# core/scheduler.py
# Background scheduler that runs every 5 minutes.
# Does three things for every active shipment:
#   1. Advances simulated GPS location along the route
#   2. Recalculates risk (weather + traffic + events)
#   3. Broadcasts alerts via WebSocket if risk changed
#   4. Auto-reroutes if HIGH/CRITICAL and auto_reroute_enabled=True
#   5. Refreshes TomTom incidents in background every cycle

import asyncio
import logging
import math
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from bson import ObjectId

from database import db
from core.websocket_manager import manager

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

BATCH_SIZE = 10

GEMINI_TTL = {
    "LOW":      30 * 60,
    "MEDIUM":   15 * 60,
    "HIGH":      5 * 60,
    "CRITICAL":  2 * 60,
    "UNKNOWN":  15 * 60,
}


# ── GPS simulation ─────────────────────────────────────────────────────────────

async def _advance_location(shipment: dict) -> dict | None:
    waypoints   = shipment.get("route_waypoints", [])
    eta_seconds = shipment.get("expected_travel_seconds")
    start_time  = shipment.get("started_at") or shipment.get("created_at")

    if not waypoints or not eta_seconds or not start_time:
        return None

    if isinstance(start_time, str):
        start_time = datetime.fromisoformat(start_time)
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)

    now     = datetime.now(timezone.utc)
    elapsed = (now - start_time).total_seconds()

    SIMULATION_SPEED = 50
    elapsed *= SIMULATION_SPEED

    progress = min(elapsed / eta_seconds, 1.0)

    if progress >= 1.0:
        if shipment.get("status") != "delivered":
            await db.shipments.update_one(
                {"_id": shipment["_id"]},
                {"$set": {"status": "delivered", "updated_at": now}}
            )
            shipment["status"] = "delivered"

            updated_decisions = await db.decisions.update_many(
                {"shipment_id": str(shipment["_id"]), "status": "pending"},
                {"$set": {"status": "cancelled", "updated_at": now}}
            )
            if updated_decisions.modified_count > 0:
                from core.countdown_manager import countdown_manager
                await countdown_manager.cancel_countdown(str(shipment["_id"]))

        return waypoints[-1]

    index = progress * (len(waypoints) - 1)
    low   = int(index)
    high  = min(low + 1, len(waypoints) - 1)
    frac  = index - low

    lat = waypoints[low]["lat"] + (waypoints[high]["lat"] - waypoints[low]["lat"]) * frac
    lng = waypoints[low]["lng"] + (waypoints[high]["lng"] - waypoints[low]["lng"]) * frac

    return {"lat": round(lat, 6), "lng": round(lng, 6)}


def _should_call_gemini(shipment: dict, current_risk_level: str) -> bool:
    last_check = shipment.get("last_gemini_check")
    if not last_check:
        return True

    if isinstance(last_check, str):
        last_check = datetime.fromisoformat(last_check)
    if last_check.tzinfo is None:
        last_check = last_check.replace(tzinfo=timezone.utc)

    ttl     = GEMINI_TTL.get(current_risk_level, GEMINI_TTL["UNKNOWN"])
    elapsed = (datetime.now(timezone.utc) - last_check).total_seconds()

    return elapsed >= ttl


# ── Auto reroute ───────────────────────────────────────────────────────────────

async def _apply_auto_reroute(shipment: dict) -> dict | None:
    from routers.reroute_engine import get_alternatives
    from services.segment_service import get_named_waypoints

    try:
        result       = await get_alternatives(shipment)
        alternatives = result.get("alternatives", [])

        if not alternatives:
            logger.warning(f"No alternatives for auto-reroute on {shipment['_id']}")
            return None

        # Prefer Avoidance route if one exists (bypasses a live road closure/flood).
        # Fall back to Recommended, then first available.
        chosen = (
            next((a for a in alternatives if a.get("label") == "Avoidance"), None)
            or next((a for a in alternatives if a.get("label") == "Recommended"), None)
            or alternatives[0]
        )

        new_waypoints = chosen.get("waypoints", [])
        if not new_waypoints:
            return None

        named = await get_named_waypoints(new_waypoints)
        now   = datetime.now(timezone.utc)

        await db.shipments.update_one(
            {"_id": shipment["_id"]},
            {"$set": {
                "route_waypoints":         new_waypoints,
                "named_waypoints":         named,
                "expected_travel_seconds": chosen.get("duration_seconds"),
                "distance_km":             chosen.get("distance_km"),
                "eta_hours":               chosen.get("eta_hours"),
                "status":                  "rerouting",
                "updated_at":              now,
            }}
        )

        logger.info(
            f"Auto-rerouted shipment {shipment['_id']} "
            f"to {chosen['label']} route "
            f"(risk {chosen['risk_score']:.0f})"
        )
        return chosen

    except Exception as e:
        logger.error(f"Auto-reroute failed for {shipment['_id']}: {e}")
        return None


# ── Main processing function ───────────────────────────────────────────────────

async def _process_shipment(shipment: dict):
    """Process a single shipment — advance GPS, refresh incidents, check risk, alert if changed."""
    from routers.risk_engine import calculate_risk

    shipment_id   = str(shipment["_id"])
    shipment_name = shipment.get("shipment_name", shipment.get("origin_name", "Unknown"))

    if shipment.get("status") in ["rerouted", "delivered"]:
        return

    now = datetime.now(timezone.utc)

    # STEP 1 — Advance GPS location
    new_location = await _advance_location(shipment)
    if new_location:
        shipment["current_location"] = new_location

    if shipment.get("status") == "delivered":
        return

    # STEP 2 — Refresh TomTom incidents in background (fire and forget)
    asyncio.create_task(_refresh_incidents_safe(shipment_id))

    # STEP 3 — Check if we should call Gemini
    prev_level = (
        shipment.get("last_risk_assessment", {}) or {}
    ).get("risk_level", "UNKNOWN")

    use_gemini = _should_call_gemini(shipment, prev_level)

    if not use_gemini:
        shipment["_skip_gemini"] = True

    # STEP 4 — Calculate fresh risk
    try:
        assessment = await calculate_risk(shipment)
    except Exception as e:
        logger.error(f"Risk calculation failed for {shipment_id}: {e}")
        return

    new_level = assessment["risk_level"]
    new_score = assessment["final_score"]
    breakdown = assessment["breakdown"]
    driver    = assessment["primary_driver"]
    reason    = breakdown.get(driver, {}).get("reason", "Unknown reason")

    risk_changed = prev_level != new_level

    auto_rerouted = False
    reroute_data  = None

    if new_level in ["HIGH", "CRITICAL"] and shipment.get("auto_reroute_enabled"):
        from core.countdown_manager import countdown_manager
        try:
            expires_at = now + timedelta(seconds=120)

            from routers.cascade import get_cascade_impact
            dependent_shipments = await get_cascade_impact(shipment_id, max_depth=3)
            total_delay = round(sum(d["delay_exposure_hours"] for d in dependent_shipments), 2)

            update_result = await db.decisions.update_one(
                {"shipment_id": shipment_id, "status": "pending"},
                {
                    "$setOnInsert": {
                        "shipment_id": shipment_id,
                        "type": "auto_reroute",
                        "status": "pending",
                        "risk_snapshot": {
                            "score": new_score,
                            "level": new_level,
                            "primary_driver": driver,
                            "factors": [
                                {"factor": k, "score": v.get("score", 0), "weight": v.get("weight", 0)}
                                for k, v in breakdown.items()
                            ],
                        },
                        "cascade_impact": {
                            "nodes_affected": len(dependent_shipments),
                            "total_delay_hours": total_delay,
                        },
                        "reason_summary": reason,
                        "confidence_score": round(new_score / 100.0, 2),
                        "proposed_route_id": "pending_reroute",
                        "countdown_expires_at": expires_at,
                        "created_at": now,
                    }
                },
                upsert=True
            )

            if update_result.upserted_id:
                decision_id_str = str(update_result.upserted_id)
                logger.info(f"Created decision {decision_id_str} for {shipment_id} due to {new_level} risk")

                seconds_remaining = max(0, int((expires_at - now).total_seconds()))
                if seconds_remaining > 0:
                    await countdown_manager.start_countdown(
                        shipment_id, shipment_name, shipment,
                        decision_id=decision_id_str, seconds=seconds_remaining
                    )
            else:
                logger.debug(f"Pending decision already exists for {shipment_id}, skipping.")

        except Exception as e:
            logger.error(f"Failed to log decision for {shipment_id}: {e}")

    elif new_level in ["LOW", "MEDIUM"] and prev_level in ["HIGH", "CRITICAL"]:
        try:
            updated = await db.decisions.update_many(
                {"shipment_id": shipment_id, "status": "pending"},
                {"$set": {"status": "cancelled", "updated_at": now}}
            )
            if updated.modified_count > 0:
                logger.info(f"Cancelled {updated.modified_count} pending decision(s) for {shipment_id}")
                from core.countdown_manager import countdown_manager
                await countdown_manager.cancel_countdown(shipment_id)
        except Exception as e:
            logger.error(f"Failed to cancel pending decisions for {shipment_id}: {e}")

    assessment_to_store = {
        **assessment,
        "computed_at": assessment["computed_at"].isoformat()
    }

    mongo_update = {
        "$set": {
            "last_risk_assessment": assessment_to_store,
            "updated_at":           now,
        },
        "$push": {
            "risk_history": assessment_to_store
        }
    }

    if new_location:
        mongo_update["$set"]["current_location"] = new_location

    if use_gemini:
        mongo_update["$set"]["last_gemini_check"] = now.isoformat()

    try:
        query = {"_id": shipment["_id"]}
        if "updated_at" in shipment:
            query["updated_at"] = shipment["updated_at"]

        update_result = await db.shipments.update_one(query, mongo_update)
        if update_result.matched_count == 0:
            logger.warning(f"Optimistic lock failure for {shipment_id} — concurrent update detected.")
            return
    except Exception as e:
        logger.error(f"MongoDB update failed for {shipment_id}: {e}")
        return

    if risk_changed or auto_rerouted:
        if auto_rerouted and reroute_data:
            alert_message = f"Auto-rerouted due to {new_level} risk — {reason}"
        else:
            alert_message = reason

        alert = {
            "type":           "risk_alert",
            "shipment_id":    shipment_id,
            "shipment_name":  shipment_name,
            "level":          new_level.lower(),
            "message":        alert_message,
            "previous_level": prev_level.lower() if prev_level else "unknown",
            "score":          new_score,
            "primary_driver": driver,
            "auto_rerouted":  auto_rerouted,
            "timestamp":      now.isoformat(),
        }

        await manager.broadcast(alert)
        logger.info(
            f"Alert broadcast: {shipment_name} "
            f"{prev_level} → {new_level} | {reason[:60]}"
        )

        await db.shipments.update_one(
            {"_id": shipment["_id"]},
            {"$push": {"alerts_triggered": alert}}
        )

        await db.notifications.insert_one({
            "type": "risk_alert",
            "shipment_id": shipment_id,
            "title": f"Risk Alert: {new_level.upper()}",
            "message": alert_message,
            "action_taken": "none",
            "impact": reason,
            "severity": new_level.lower(),
            "read": False,
            "timestamp": now.isoformat()
        })


async def _refresh_incidents_safe(shipment_id: str):
    """Fire-and-forget TomTom incident refresh. Errors are swallowed."""
    try:
        from routers.incidents import fetch_and_store_incidents
        await fetch_and_store_incidents(shipment_id)
    except Exception as e:
        logger.debug(f"Incident refresh skipped for {shipment_id}: {e}")


async def recompute_all_shipments():
    """Main scheduler job — runs every 5 minutes for all active shipments."""
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

    logger.info(f"Processing {len(active)} active shipments in batches of {BATCH_SIZE}")

    for i in range(0, len(active), BATCH_SIZE):
        batch     = active[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1

        async def _safe_process(shipment):
            try:
                await _process_shipment(shipment)
            except Exception as e:
                logger.error(f"Error processing shipment {shipment.get('_id')}: {e}")

        results = await asyncio.gather(
            *[_safe_process(s) for s in batch],
            return_exceptions=True,
        )

        for j, result in enumerate(results):
            if isinstance(result, Exception):
                sid = batch[j].get("_id", "unknown")
                logger.error(f"Unhandled exception in batch {batch_num} for {sid}: {result}")

    logger.info("Scheduler cycle complete")


async def check_pending_decisions():
    """Fast loop (5s) to check all pending decisions and execute expired ones."""
    now = datetime.now(timezone.utc)
    try:
        pending_decisions = await db.decisions.find({"status": "pending"}).to_list(None)

        from core.countdown_manager import countdown_manager

        for decision in pending_decisions:
            shipment_id = decision.get("shipment_id")
            decision_id = str(decision["_id"])
            expires_at  = decision.get("countdown_expires_at")

            if not expires_at:
                continue

            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)

            remaining = int((expires_at - now).total_seconds())

            shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
            if not shipment:
                continue

            shipment_name = shipment.get("shipment_name", shipment.get("origin_name", "Unknown"))

            if remaining <= 0:
                logger.info(f"Decision {decision_id} expired. Executing auto-reroute for {shipment_id}")

                updated = await db.decisions.update_one(
                    {"_id": decision["_id"], "status": "pending"},
                    {"$set": {"status": "executed", "executed_at": now}}
                )
                if updated.modified_count == 0:
                    continue

                reroute_data = await _apply_auto_reroute(shipment)

                if reroute_data:
                    await countdown_manager.execute_reroute_result(shipment_id, shipment_name, reroute_data, success=True)
                else:
                    logger.warning(f"Auto-reroute failed for {shipment_id}")
                    await countdown_manager.execute_reroute_result(shipment_id, shipment_name, None, success=False)
            else:
                await countdown_manager.broadcast_update(shipment_id, shipment_name, remaining)

    except Exception as e:
        logger.error(f"Error checking pending decisions: {e}")


async def update_gps_positions():
    """Fast loop (3s) to simulate real-time GPS tracking."""
    try:
        active = await db.shipments.find({
            "status": {"$in": ["in_transit", "rerouting"]}
        }).to_list(None)

        for shipment in active:
            new_location = await _advance_location(shipment)
            if not new_location:
                continue

            shipment_id  = str(shipment["_id"])
            old_location = shipment.get("current_location", {})
            if (old_location.get("lat") == new_location["lat"] and
                    old_location.get("lng") == new_location["lng"]):
                continue

            await db.shipments.update_one(
                {"_id": shipment["_id"]},
                {"$set": {"current_location": new_location}}
            )

            await manager.broadcast({
                "type":        "position_update",
                "shipment_id": shipment_id,
                "lat":         new_location["lat"],
                "lng":         new_location["lng"]
            })

    except Exception as e:
        logger.error(f"Error updating GPS positions: {e}")


# ── Start and stop ─────────────────────────────────────────────────────────────

def start_scheduler():
    scheduler.add_job(
        recompute_all_shipments,
        trigger="interval",
        minutes=5,
        id="risk_recompute",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )

    scheduler.add_job(
        check_pending_decisions,
        trigger="interval",
        seconds=5,
        id="check_pending_decisions",
        max_instances=1,
        replace_existing=True,
    )

    scheduler.add_job(
        update_gps_positions,
        trigger="interval",
        seconds=3,
        id="update_gps_positions",
        max_instances=1,
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started — running background jobs")


def stop_scheduler():
    scheduler.shutdown()
    logger.info("Scheduler stopped")
