# core/scheduler.py
# Background scheduler that runs every 5 minutes.
# Does three things for every active shipment:
#   1. Advances simulated GPS location along the route
#   2. Recalculates risk (weather + traffic + events)
#   3. Broadcasts alerts via WebSocket if risk changed
#   4. Auto-reroutes if HIGH/CRITICAL and auto_reroute_enabled=True

import logging
import math
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from bson import ObjectId

from database import db
from core.websocket_manager import manager

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

# We are calling Gemini according to the risk level I think we can call Gemini every two minutes if the risk is too high that can cause a significant amount of token costing but lock we can't do anything about it also I've already kept the token limit to 4KI mean 4000 not 4K really 4K is like 2160P which is a resolution I wish I had a laptop with 4K screen but that's not possible and this is daydreaming
GEMINI_TTL = {
    "LOW":      30 * 60,   # 30 mins
    "MEDIUM":   15 * 60,   # 15 mins
    "HIGH":      5 * 60,   #  5 mins
    "CRITICAL":  2 * 60,   #  2 mins
    "UNKNOWN":  15 * 60,   # default
}


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

    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    elapsed  = (datetime.now(timezone.utc) - created_at).total_seconds()
    progress = min(elapsed / eta_seconds, 1.0)

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


#   
#  #  Check if enough time has passed since last Gemini call.
# ## Prevents calling Gemini every 5 mins on low risk shipments.
    

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


# auto re route if its approved

async def _apply_auto_reroute(shipment: dict) -> dict | None:
    """
    Get alternatives and apply the Recommended route.
    Updates MongoDB with new route data.
    Returns the new risk assessment or None on failure.
    """
    from routers.reroute_engine import get_alternatives
    from services.segment_service import get_named_waypoints

    try:
        result = await get_alternatives(shipment)
        alternatives = result.get("alternatives", [])

        if not alternatives:
            logger.warning(f"No alternatives for auto-reroute on {shipment['_id']}")
            return None

        # Pick Recommended — first in list (reroute_engine sorts it first)
        recommended = next(
            (a for a in alternatives if a.get("label") == "Recommended"),
            alternatives[0]
        )

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


# main fuctionn

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

    # STEP 4 — Compare to previous
    risk_changed = prev_level != new_level

    # STEP 5 — Auto reroute if HIGH/CRITICAL
    auto_rerouted    = False
    reroute_data     = None
    new_route_label  = None

    if new_level in ["HIGH", "CRITICAL"] and shipment.get("auto_reroute_enabled"):
        logger.info(f"Auto-rerouting {shipment_id} due to {new_level} risk")
        reroute_data = await _apply_auto_reroute(shipment)
        if reroute_data:
            auto_rerouted   = True
            new_route_label = reroute_data.get("label", "Recommended")

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

    # STEP 9 — Broadcast alert if risk changed OR auto rerouted
    if risk_changed or auto_rerouted:
        if auto_rerouted and reroute_data:
            alert = {
                "type":           "AUTO_REROUTED",
                "shipment_id":    shipment_id,
                "shipment_name":  shipment_name,
                "previous_level": prev_level,
                "new_level":      new_level,
                "previous_score": (shipment.get("last_risk_assessment") or {}).get("final_score", 0),
                "new_score":      new_score,
                "route_label":    new_route_label,
                "reason":         f"Auto-rerouted due to {new_level} risk — {reason}",
                "timestamp":      now.isoformat(),
            }
        else:
            alert = {
                "type":           "RISK_CHANGE",
                "shipment_id":    shipment_id,
                "shipment_name":  shipment_name,
                "previous_level": prev_level,
                "new_level":      new_level,
                "score":          new_score,
                "primary_driver": driver,
                "reason":         reason,
                "auto_rerouted":  False,
                "timestamp":      now.isoformat(),
            }

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