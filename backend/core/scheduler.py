# core/scheduler.py
# Background scheduler that runs every 5 minutes.
# Does three things for every active shipment:
#   1. Advances simulated GPS location along the route
#   2. Recalculates risk (weather + traffic + events)
#   3. Broadcasts alerts via WebSocket if risk changed
#   4. Auto-reroutes if HIGH/CRITICAL and auto_reroute_enabled=True

import asyncio
import logging
import math
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from bson import ObjectId

from database import db
from core.websocket_manager import manager
from core.event_factory import create_risk_alert, create_gps_stuck, create_api_failure
from core.countdown_manager import countdown_manager, COUNTDOWN_SECONDS

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

# We are calling Gemini according to the risk level I think we can call Gemini every two minutes if the risk is too high that can cause a significant amount of token costing but look we can't do anything about it also I've already kept the token limit to 4KI mean 4000 not 4K really 4K is like 2160P which is a resolution I wish I had a laptop with 4K screen but that's not possible and this is daydreaming
GEMINI_TTL = {
    "LOW":      30 * 60,   # 30 mins
    "MEDIUM":   15 * 60,   # 15 mins
    "HIGH":      5 * 60,   #  5 mins
    "CRITICAL":  2 * 60,   # 2 mins
    "UNKNOWN":  15 * 60,   # default 
}


# ── GPS stuck detection ────────────────────────────────────────────────────────
# Tracks the last time each shipment's position actually changed.
# When a shipment's GPS hasn't moved for GPS_STUCK_SECONDS we fire one notification,
# then stay silent until the truck moves again (notified flag reset on movement).
GPS_STUCK_SECONDS = 15 * 60  # 15 minutes

_gps_last_position: dict[str, dict] = {}
# schema: {shipment_id: {"lat": float, "lng": float, "last_changed_at": datetime, "notified": bool}}

# ── API failure cooldown ───────────────────────────────────────────────────────
# One notification per shipment-service pair per hour to avoid spamming.
API_FAILURE_COOLDOWN_SECONDS = 60 * 60  # 1 hour
_api_failure_cooldown: dict[str, datetime] = {}
# schema: {"<shipment_id>:<service>": last_notified_at}


def _gps_changed(a: dict, b: dict) -> bool:
    """True when the two positions differ by more than ~11 m (0.0001 deg)."""
    return abs(a["lat"] - b["lat"]) > 0.0001 or abs(a["lng"] - b["lng"]) > 0.0001


def _should_notify_api_failure(shipment_id: str, service: str, now: datetime) -> bool:
    key = f"{shipment_id}:{service}"
    last = _api_failure_cooldown.get(key)
    if last is None or (now - last).total_seconds() >= API_FAILURE_COOLDOWN_SECONDS:
        _api_failure_cooldown[key] = now
        return True
    return False


#GPS simulation

def _advance_location(shipment: dict) -> dict | None:
    """
    Interpolate truck position along route_waypoints based on elapsed time.
    Returns new {"lat", "lng"} or None if journey complete.
    """
    waypoints   = shipment.get("route_waypoints", [])
    eta_seconds = shipment.get("expected_travel_seconds")
    created_at  = shipment.get("created_at")

    if not waypoints or not eta_seconds or not created_at:
        return None

    if shipment.get("status") == "planned":
        return waypoints[0]
    if shipment.get("status") == "delivered":
        return waypoints[-1]

    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    elapsed  = (datetime.now(timezone.utc) - created_at).total_seconds()
    # 5x Hyper-Lapse Time Simulation multiplier to match frontend visuals!
    sim_elapsed = elapsed * 5
    progress = min(sim_elapsed / eta_seconds, 1.0)

    if progress >= 1.0:
        return waypoints[-1]  # arrived at destination

    # Interpolate between waypoints
    index = progress * (len(waypoints) - 1)
    low   = int(index)
    high  = min(low + 1, len(waypoints) - 1)
    frac  = index - low

    lat = waypoints[low]["lat"] + (waypoints[high]["lat"] - waypoints[low]["lat"]) * frac
    lng = waypoints[low]["lng"] + (waypoints[high]["lng"] - waypoints[low]["lng"]) * frac

    return {"lat": round(lat, 6), "lng": round(lng, 6)}


def _compute_progress(current_location: dict, route_waypoints: list) -> float:
    """
    Returns 0.0–1.0 progress fraction by finding the nearest waypoint index
    to the shipment's current GPS position.
    """
    if not route_waypoints or not current_location:
        return 0.0
    cur_lat = current_location.get("lat", 0)
    cur_lng = current_location.get("lng", 0)
    best_idx = 0
    best_dist = float("inf")
    for i, wp in enumerate(route_waypoints):
        d = math.hypot(wp["lat"] - cur_lat, wp["lng"] - cur_lng)
        if d < best_dist:
            best_dist = d
            best_idx = i
    return best_idx / max(len(route_waypoints) - 1, 1)


#
#  #  Check if enough time has passed since last Gemini call.
# ## Prevents calling Gemini every 5 mins on low risk shipments.


def _should_call_gemini(shipment: dict, current_risk_level: str) -> bool:
    """
    To fiercely conserve API Quota, we NEVER call Gemini on scheduled 5-minute ticks.
    Gemini is only executed ONCE autonomously upon initial deployment/creation.
    """
    return False


# auto re route if its approved

async def _apply_auto_reroute(shipment: dict, risk_level: str = "HIGH") -> dict | None:
    """
    Get alternatives and apply the best route.
    When risk is CRITICAL and Gemini flagged a bypass city, the Gemini Route is
    preferred over Recommended — it actively avoids the detected road disturbance.
    Updates MongoDB with new route data.
    Returns the chosen route dict or None on failure.
    """
    from routers.reroute_engine import get_alternatives
    from services.segment_service import get_named_waypoints

    try:
        result = await get_alternatives(shipment)
        alternatives = result.get("alternatives", [])

        if not alternatives:
            logger.warning(f"No alternatives for auto-reroute on {shipment['_id']}")
            return None

        # CRITICAL + Gemini Route available → prefer the AI-suggested bypass
        if risk_level == "CRITICAL":
            gemini_alt = next((a for a in alternatives if a.get("label") == "Gemini Route"), None)
            if gemini_alt:
                recommended = gemini_alt
                logger.info(f"CRITICAL risk: selecting Gemini Route bypass for {shipment['_id']}")
            else:
                recommended = next((a for a in alternatives if a.get("label") == "Recommended"), alternatives[0])
        else:
            recommended = next((a for a in alternatives if a.get("label") == "Recommended"), alternatives[0])

        new_waypoints = recommended.get("waypoints", [])
        if not new_waypoints:
            return None

        # Reverse geocode new waypoints
        named = await get_named_waypoints(new_waypoints)

        now = datetime.now(timezone.utc)

        await db.shipments.update_one(
            {"_id": shipment["_id"]},
            {"$set": {
                "route_waypoints":         new_waypoints,
                "named_waypoints":         named,
                "expected_travel_seconds": recommended.get("duration_seconds"),
                "distance_km":             recommended.get("distance_km"),
                "eta_hours":               recommended.get("eta_hours"),
                "status":                  "rerouting",
                "updated_at":              now,
            }}
        )

        logger.info(
            f"Auto-rerouted shipment {shipment['_id']} "
            f"to {recommended['label']} route "
            f"(risk {recommended['risk_score']:.0f})"
        )
        return recommended

    except Exception as e:
        logger.error(f"Auto-reroute failed for {shipment['_id']}: {e}")
        return None


# In-memory registry of active countdown tasks keyed by shipment_id string
_pending_countdowns: dict[str, asyncio.Task] = {}


async def _countdown_and_reroute(shipment_id: str, shipment: dict, risk_level: str):
    """
    Sleep COUNTDOWN_SECONDS (120s), then auto-execute reroute unless cancelled.
    Re-fetches the shipment from DB before acting so stale data is never used.
    """
    try:
        await asyncio.sleep(COUNTDOWN_SECONDS)
    except asyncio.CancelledError:
        _pending_countdowns.pop(shipment_id, None)
        return

    _pending_countdowns.pop(shipment_id, None)

    fresh = await db.shipments.find_one({"_id": shipment["_id"]})
    if not fresh or fresh.get("status") == "delivered":
        return

    fresh_level   = (fresh.get("last_risk_assessment") or {}).get("risk_level", "LOW")
    shipment_name = fresh.get("shipment_name", fresh.get("origin_name", "Unknown"))

    if fresh_level not in ["HIGH", "CRITICAL"]:
        await countdown_manager.cancel_countdown(
            shipment_id, reason="Risk dropped — reroute not needed"
        )
        return

    reroute_data = await _apply_auto_reroute(fresh, risk_level=fresh_level)
    await countdown_manager.execute_reroute_result(
        shipment_id=shipment_id,
        shipment_name=shipment_name,
        reroute_data=reroute_data,
        success=reroute_data is not None,
        source="REAL_SYSTEM",
    )


# main fuctionn

async def _cascade_propagate(parent_id: str, delay_minutes: int, depth: int = 0):
    """
    Recursively push a parent shipment's delay down to all children that
    declare upstream_shipment_id == parent_id.  Stops at depth 5 to prevent
    runaway recursion on circular data.
    """
    from core.event_factory import create_cascade_alert  # late import — defined in Session 5

    if depth > 5:
        return

    now = datetime.now(timezone.utc)
    try:
        children = await db.shipments.find(
            {"upstream_shipment_id": parent_id, "status": {"$nin": ["delivered"]}}
        ).to_list(50)
    except Exception as e:
        logger.error(f"Cascade query failed for parent {parent_id}: {e}")
        return

    if not children:
        return

    parent_doc = None
    try:
        parent_doc = await db.shipments.find_one(
            {"_id": ObjectId(parent_id)}, {"shipment_name": 1}
        )
    except Exception:
        pass
    parent_name = (parent_doc or {}).get("shipment_name", "Unknown")

    for child in children:
        child_id   = str(child["_id"])
        child_name = child.get("shipment_name", "Unknown")

        try:
            await db.shipments.update_one(
                {"_id": child["_id"]},
                {"$set": {
                    "delay_minutes":    delay_minutes,
                    "is_delayed":       delay_minutes > 30,
                    "cascade_notified": False,
                    "updated_at":       now,
                }}
            )
        except Exception as e:
            logger.error(f"Cascade update failed for child {child_id}: {e}")
            continue

        try:
            alert = create_cascade_alert(
                shipment_id=child_id,
                shipment_name=child_name,
                upstream_id=parent_id,
                upstream_name=parent_name,
                delay_minutes=delay_minutes,
            )
            await manager.broadcast(alert)
            await db.shipments.update_one(
                {"_id": child["_id"]},
                {"$set": {"cascade_notified": True}}
            )
            logger.info(
                f"Cascade alert: {child_name} delayed {delay_minutes}m "
                f"due to upstream {parent_name}"
            )
        except Exception as e:
            logger.warning(f"Cascade alert broadcast failed for {child_id}: {e}")

        # Recurse into grandchildren
        await _cascade_propagate(child_id, delay_minutes, depth + 1)


async def _process_shipment(shipment: dict):
    """Process a single shipment — advance GPS, check risk, alert if changed."""
    from routers.risk_engine import calculate_risk

    shipment_id   = str(shipment["_id"])
    shipment_name = shipment.get("shipment_name", shipment.get("origin_name", "Unknown"))
    now           = datetime.now(timezone.utc)

    # STEP 1 — Advance GPS location
    new_location = _advance_location(shipment)
    if new_location:
        shipment["current_location"] = new_location

    # STEP 1b — GPS stuck detection (in_transit / rerouting shipments only)
    if new_location and shipment.get("status") in ("in_transit", "rerouting"):
        prev_gps = _gps_last_position.get(shipment_id)
        if prev_gps is None:
            _gps_last_position[shipment_id] = {
                "lat": new_location["lat"], "lng": new_location["lng"],
                "last_changed_at": now, "notified": False,
            }
        elif _gps_changed(new_location, prev_gps):
            # Truck moved — reset state
            _gps_last_position[shipment_id] = {
                "lat": new_location["lat"], "lng": new_location["lng"],
                "last_changed_at": now, "notified": False,
            }
        else:
            # Position unchanged — check duration
            stuck_seconds = (now - prev_gps["last_changed_at"]).total_seconds()
            if stuck_seconds >= GPS_STUCK_SECONDS and not prev_gps["notified"]:
                duration_minutes = int(stuck_seconds / 60)
                gps_event = create_gps_stuck(shipment_id, shipment_name, duration_minutes)
                await manager.broadcast(gps_event)
                await db.notifications.insert_one({
                    "type":        "gps_stuck",
                    "source":      "REAL_SYSTEM",
                    "shipment_id": shipment_id,
                    "title":       "GPS Signal Stuck",
                    "message":     gps_event["message"],
                    "action_taken": "manual_monitoring_required",
                    "impact":      f"No GPS movement for {duration_minutes} min on {shipment_name}",
                    "severity":    "high",
                    "read":        False,
                    "timestamp":   now.isoformat(),
                })
                _gps_last_position[shipment_id]["notified"] = True
                logger.warning(
                    f"GPS stuck: {shipment_name} | no movement for {duration_minutes} min"
                )

    # STEP 1c — Delay detection: compare current ETA projection to original_eta
    was_delayed    = shipment.get("is_delayed", False)
    new_delay_mins = 0
    new_is_delayed = False

    original_eta = shipment.get("original_eta")
    if original_eta and shipment.get("status") not in ("delivered",):
        progress        = _compute_progress(
            shipment.get("current_location") or {},
            shipment.get("route_waypoints", [])
        )
        remaining_secs  = (1.0 - progress) * (shipment.get("expected_travel_seconds") or 0)
        current_eta_dt  = now + timedelta(seconds=remaining_secs)

        if isinstance(original_eta, str):
            original_eta = datetime.fromisoformat(original_eta)
        if original_eta.tzinfo is None:
            original_eta = original_eta.replace(tzinfo=timezone.utc)

        drift_mins     = max(0.0, (current_eta_dt - original_eta).total_seconds() / 60)
        new_is_delayed = drift_mins > 30
        new_delay_mins = int(drift_mins) if new_is_delayed else 0

    # STEP 2 — Check if we should call Gemini
    prev_level = (
        shipment.get("last_risk_assessment", {}) or {}
    ).get("risk_level", "UNKNOWN")

    use_gemini = _should_call_gemini(shipment, prev_level)

    # Temporarily patch shipment to skip Gemini if TTL not reached
    if not use_gemini:
        # Use cached event score from last assessment
        shipment["_skip_gemini"] = True

    # STEP 3 — Calculate fresh risk
    try:
        assessment = await calculate_risk(shipment)
    except Exception as e:
        logger.error(f"Risk calculation failed for {shipment_id}: {e}")
        return

    new_level  = assessment["risk_level"]
    new_score  = assessment["final_score"]
    breakdown  = assessment["breakdown"]
    driver     = assessment["primary_driver"]
    reason     = breakdown.get(driver, {}).get("reason", "Unknown reason")

    # STEP 3b — Detect API service failures from breakdown signals
    weather_reason = breakdown.get("weather", {}).get("reason", "")
    if "unavailable" in weather_reason.lower() and _should_notify_api_failure(shipment_id, "weather", now):
        api_event = create_api_failure(
            service_name="Open-Meteo (weather)",
            error_message=weather_reason,
            shipment_id=shipment_id,
            shipment_name=shipment_name,
        )
        await manager.broadcast(api_event)
        await db.notifications.insert_one({
            "type":        "api_failure",
            "source":      "REAL_SYSTEM",
            "shipment_id": shipment_id,
            "title":       "Weather API Unavailable",
            "message":     api_event["message"],
            "action_taken": "manual_monitoring_required",
            "impact":      f"Weather risk factor skipped for {shipment_name}",
            "severity":    "medium",
            "read":        False,
            "timestamp":   now.isoformat(),
        })
        logger.warning(f"Weather API failure for {shipment_name}: {weather_reason}")

    hist_reason = breakdown.get("historical", {}).get("reason", "")
    if hist_reason.lower() in ("unavailable", "no road names available") and \
            _should_notify_api_failure(shipment_id, "gemini", now):
        api_event = create_api_failure(
            service_name="Gemini (road disturbance)",
            error_message=hist_reason,
            shipment_id=shipment_id,
            shipment_name=shipment_name,
        )
        await manager.broadcast(api_event)
        await db.notifications.insert_one({
            "type":        "api_failure",
            "source":      "REAL_SYSTEM",
            "shipment_id": shipment_id,
            "title":       "Gemini API Unavailable",
            "message":     api_event["message"],
            "action_taken": "manual_monitoring_required",
            "impact":      f"Road disturbance factor skipped for {shipment_name}",
            "severity":    "medium",
            "read":        False,
            "timestamp":   now.isoformat(),
        })
        logger.warning(f"Gemini API failure for {shipment_name}: {hist_reason}")

    # STEP 4 — Compare to previous
    risk_changed = prev_level != new_level

    # STEP 5 — Start 2-min countdown for HIGH/CRITICAL, cancel if risk dropped
    auto_rerouted   = False
    reroute_data    = None
    new_route_label = None

    if new_level in ["HIGH", "CRITICAL"] and shipment.get("auto_reroute_enabled"):
        if shipment_id not in _pending_countdowns and prev_level not in ["HIGH", "CRITICAL"]:
            # Fresh HIGH/CRITICAL escalation — start countdown
            logger.info(f"Starting {COUNTDOWN_SECONDS}s countdown for {shipment_id} ({new_level})")
            await countdown_manager.start_countdown(
                shipment_id=shipment_id,
                shipment_name=shipment_name,
                shipment=shipment,
                seconds=COUNTDOWN_SECONDS,
            )
            task = asyncio.create_task(
                _countdown_and_reroute(shipment_id, shipment, new_level)
            )
            _pending_countdowns[shipment_id] = task
        else:
            logger.debug(f"Countdown already active or risk unchanged for {shipment_id}")
    elif new_level in ["LOW", "MEDIUM"] and shipment_id in _pending_countdowns:
        # Risk dropped — cancel the pending countdown
        _pending_countdowns[shipment_id].cancel()
        _pending_countdowns.pop(shipment_id, None)
        await countdown_manager.cancel_countdown(
            shipment_id, reason="Risk dropped below threshold"
        )
        logger.info(f"Countdown cancelled for {shipment_id} — risk now {new_level}")

    # STEP 6 — Serialize assessment for MongoDB
    assessment_to_store = {
        **assessment,
        "computed_at": assessment["computed_at"].isoformat()
    }

    # STEP 7 — Build MongoDB update
    mongo_update = {
        "$set": {
            "last_risk_assessment": assessment_to_store,
            "updated_at":           now,
            "is_delayed":           new_is_delayed,
            "delay_minutes":        new_delay_mins,
            # Reset cascade_notified so propagation fires when newly delayed
            **({"cascade_notified": False} if new_is_delayed and not was_delayed else {}),
        },
        "$push": {
            "risk_history": assessment_to_store
        }
    }

    if new_location:
        mongo_update["$set"]["current_location"] = new_location

    if use_gemini:
        mongo_update["$set"]["last_gemini_check"] = now.isoformat()

    # STEP 8 — Save to MongoDB
    try:
        await db.shipments.update_one(
            {"_id": shipment["_id"]},
            mongo_update
        )
    except Exception as e:
        logger.error(f"MongoDB update failed for {shipment_id}: {e}")
        return

    # STEP 8b — Cascade propagation when newly delayed
    if new_is_delayed and not was_delayed and new_delay_mins > 0:
        asyncio.create_task(_cascade_propagate(shipment_id, new_delay_mins))
        logger.info(f"Cascade propagation triggered: {shipment_name} delayed {new_delay_mins}m")

    # STEP 9 — Refresh incidents in background (non-blocking)
    try:
        from routers.incidents import fetch_and_store_incidents
        asyncio.create_task(fetch_and_store_incidents(shipment["_id"]))
    except Exception as e:
        logger.warning(f"Incident refresh task failed to start for {shipment_id}: {e}")

    # STEP 9b — Road disturbance notification (Gemini historical factor)
    prev_hist_score = (
        (shipment.get("last_risk_assessment") or {})
        .get("breakdown", {})
        .get("historical", {})
        .get("score", 0)
    )
    new_hist_score  = breakdown.get("historical", {}).get("score", 0)
    hist_reason     = breakdown.get("historical", {}).get("reason", "")

    safe_wp   = breakdown.get("historical", {}).get("safe_waypoint", "")
    dist_msg  = f"Road disturbance detected: {hist_reason}"
    if safe_wp:
        dist_msg += f" — Suggested bypass via {safe_wp}"

    if (new_hist_score >= 40 and prev_hist_score < 40
            and "unavailable" not in hist_reason
            and "No road" not in hist_reason):
        road_alert = create_risk_alert(
            shipment_id=shipment_id,
            shipment_name=shipment_name,
            level=new_level.lower(),
            message=dist_msg,
            score=new_hist_score,
            primary_driver="historical",
            source="REAL_SYSTEM",
            previous_level=prev_level,
        )
        await manager.broadcast(road_alert)
        await db.notifications.insert_one({
            "type":        "road_disturbance",
            "source":      "REAL_SYSTEM",
            "shipment_id": shipment_id,
            "title":       "Road Disturbance Detected",
            "message":     dist_msg,
            "action_taken": "bypass_suggested" if safe_wp else "alert_sent",
            "impact":      f"Score {new_hist_score:.0f}/100 on {shipment_name}",
            "severity":    "critical" if new_hist_score >= 60 else "high",
            "read":        False,
            "timestamp":   now.isoformat(),
        })
        logger.info(f"Road disturbance alert: {shipment_name} | score={new_hist_score} | {hist_reason[:60]}")

    # STEP 10 — Broadcast alert if risk changed OR auto rerouted
    if risk_changed or auto_rerouted:
        # Build message using strict event factory
        alert_message = f"Auto-rerouted due to {new_level} risk — {reason}" if (auto_rerouted and reroute_data) else reason

        alert = create_risk_alert(
            shipment_id=shipment_id,
            shipment_name=shipment_name,
            level=new_level.lower(),
            message=alert_message,
            score=new_score,
            primary_driver=driver,
            source="REAL_SYSTEM",  # Scheduler is production
            previous_level=prev_level,
            auto_rerouted=auto_rerouted,
        )

        await manager.broadcast(alert)
        logger.info(
            f"Alert broadcast: {shipment_name} "
            f"{prev_level} → {new_level} | {reason[:60]}"
        )

        # Save alert to shipment's alerts_triggered
        await db.shipments.update_one(
            {"_id": shipment["_id"]},
            {"$push": {"alerts_triggered": alert}}
        )


async def recompute_all_shipments():
    """
    Main scheduler job.
    Runs every 5 minutes for all active shipments.
    """
    logger.info("Scheduler running — checking all active shipments...")

    try:
        active = await db.shipments.find({
            "status": {"$in": ["planned", "in_transit", "rerouting"]}
        }).to_list(None)
    except Exception as e:
        logger.error(f"Failed to fetch active shipments: {e}")
        return

    if not active:
        logger.info("No active shipments to process")
        return

    logger.info(f"Processing {len(active)} active shipments")

    for shipment in active:
        try:
            await _process_shipment(shipment)
        except Exception as e:
            # Never let one shipment crash the whole loop
            logger.error(f"Error processing shipment {shipment.get('_id')}: {e}")
            continue

    logger.info("Scheduler cycle complete")


#star and stop points

def start_scheduler():
    scheduler.add_job(
        recompute_all_shipments,
        trigger="interval",
        minutes=5,
        id="risk_recompute",
        max_instances=1,      # never run two at same time
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started — running every 5 minutes")


def stop_scheduler():
    scheduler.shutdown()
    logger.info("Scheduler stopped")