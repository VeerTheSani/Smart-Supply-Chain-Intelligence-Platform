# routers/reroute.py
# GET /api/reroute/{id}
# Returns 3 alternative routes shaped for Nandani's RerouteModal component.
#
# Her frontend expects:
#   data.reroute_suggested     → bool
#   data.reason                → string
#   data.recommended_route     → route_id like "A", "B", "C"
#   data.current_route.eta     → seconds (used for timeSaved calc)
#   data.alternatives[]        → each with:
#       route_id               → "A", "B", "C"
#       type                   → "Fast but Risky", "Balanced", "Safe but Slow"
#       risk_level             → lowercase "high"/"medium"/"low"
#       risk_score             → number
#       eta                    → seconds
#       distance               → km
#       score                  → combined score number

import logging
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db
from routers.reroute_engine import get_alternatives, score_alternatives_risk


class ScoreRequest(BaseModel):
    alternatives: list[dict[str, Any]]

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reroute", tags=["reroute"])


def _to_id(id: str) -> ObjectId:
    try:
        return ObjectId(id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid id: {id}")


def _label_to_type(label: str) -> str:
    """Convert our internal labels to the type strings her UI shows."""
    mapping = {
        "Fastest":     "Fast but Risky",
        "Safest":      "Safe but Slow",
        "Recommended": "Balanced",
        "Avoidance":   "Incident Avoidance",
    }
    return mapping.get(label, label)


def _transform_for_frontend(result: dict, shipment: dict) -> dict:
    """
    Transform our reroute_engine output into the shape RerouteModal expects.
    """
    alternatives = result.get("alternatives", [])
    current_risk = result.get("current_risk", 0)
    current_level = result.get("current_level", "unknown")

    # Assign A/B/C route IDs in order: Recommended→A, Fastest→B, Safest→C
    label_order = ["Recommended", "Fastest", "Safest", "Avoidance"]
    route_ids = ["A", "B", "C", "D"]

    transformed_alts = []
    recommended_route = "A"  # default

    for i, alt in enumerate(alternatives[:3]):
        label    = alt.get("label", label_order[i] if i < len(label_order) else f"Route {i+1}")
        route_id = route_ids[i] if i < len(route_ids) else str(i + 1)

        if label == "Recommended":
            recommended_route = route_id

        dur = alt.get("duration_seconds", 0)
        dist = alt.get("distance_km", 0)
        transformed_alts.append({
            "route_id":          route_id,
            "type":              _label_to_type(label),
            "risk_level":        alt.get("risk_level", "low").lower(),
            "risk_score":        round(alt.get("risk_score", 0), 1),
            # UI-friendly aliases
            "eta":               dur,
            "distance":          dist,
            "score":             round(alt.get("risk_score", 0), 2),
            # canonical names preserved so score endpoint can use them
            "duration_seconds":  dur,
            "distance_km":       dist,
            "traffic_ratio":     alt.get("traffic_ratio", 1.0),
            # extra fields
            "label":             label,
            "waypoints":         alt.get("waypoints", []),
            "geometry_encoded":  alt.get("geometry_encoded", ""),
            "extra_time_minutes": alt.get("extra_time_minutes", 0),
            "is_avoidance":      alt.get("is_avoidance", False),
        })

    # Determine if reroute is actually suggested
    reroute_suggested = current_level.upper() in ("HIGH", "CRITICAL")

    reason = (
        f"CRITICAL: Current route risk is {current_level.upper()}. Reroute recommended. "
        f"Route {recommended_route} provides the lowest combined risk and travel time."
        if reroute_suggested else
        f"Route {recommended_route} provides the optimal balance of safety and speed."
    )

    # current_route.eta — use shipment's expected_travel_seconds
    current_eta = shipment.get("expected_travel_seconds", 0) or 0

    return {
        "shipment_id":       str(shipment.get("_id", "")),
        "reroute_suggested": reroute_suggested,
        "reason":            reason,
        "recommended_route": recommended_route,
        "current_route": {
            "risk_level": current_level.lower(),
            "risk_score": current_risk,
            "eta":        current_eta,
            "distance":   shipment.get("distance_km", 0) or 0,
        },
        "alternatives": transformed_alts,
    }


@router.get("/{id}")
async def get_reroute(id: str):
    shipment = await db.shipments.find_one({"_id": _to_id(id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if not shipment.get("destination_coords"):
        raise HTTPException(status_code=400, detail="Shipment missing destination coordinates")

    try:
        result = await get_alternatives(shipment)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Reroute failed for {id}: {e}")
        raise HTTPException(status_code=503, detail=f"Reroute computation failed: {str(e)}")

    transformed = _transform_for_frontend(result, shipment)

    logger.info(
        f"Reroute computed for {id} — "
        f"{len(transformed['alternatives'])} alternatives | "
        f"reroute_suggested={transformed['reroute_suggested']}"
    )
    return transformed


@router.post("/{id}/score")
async def score_reroute(id: str, body: ScoreRequest):
    """
    On-demand full risk scoring (weather + traffic) for the given alternatives.
    Called when the user clicks "Assess Risk" in the frontend.
    """
    if not await db.shipments.find_one({"_id": _to_id(id)}):
        raise HTTPException(status_code=404, detail="Shipment not found")

    if not body.alternatives:
        raise HTTPException(status_code=400, detail="No alternatives provided to score")

    try:
        scored = await score_alternatives_risk(body.alternatives)
    except Exception as e:
        logger.error(f"Risk scoring failed for {id}: {e}")
        raise HTTPException(status_code=503, detail=f"Risk scoring failed: {str(e)}")

    logger.info(f"Risk scored for {id} — {len(scored)} alternatives")
    return {"scored_alternatives": scored}