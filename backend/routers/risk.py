# routers/risk.py
# GET /api/risk/{id} — compute and return risk for a shipment

import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query

from database import db
from routers.risk_engine import calculate_risk

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/risk", tags=["risk"])


def _to_id(id: str) -> ObjectId:
    try:
        return ObjectId(id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid id: {id}")


@router.get("/{id}")
async def get_risk(id: str, force_gemini: bool = Query(False)):
    """
    Compute risk for a shipment right now.
    Saves result to MongoDB and returns the assessment.
    
    ?force_gemini=true — Forces a fresh Gemini AI Intel call (costs API quota).
    """
    shipment = await db.shipments.find_one({"_id": _to_id(id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if not shipment.get("route_waypoints"):
        raise HTTPException(
            status_code=400,
            detail="Shipment has no route waypoints yet — route not computed"
        )

    # Skip Gemini by default to conserve quota; allow explicit retry
    assessment = await calculate_risk({**shipment, "_skip_gemini": not force_gemini})

    # Convert datetime to string for MongoDB storage
    assessment_to_store = {**assessment, "computed_at": assessment["computed_at"].isoformat()}

    # Save to shipment
    await db.shipments.update_one(
        {"_id": _to_id(id)},
        {
            "$set": {
                "last_risk_assessment": assessment_to_store,
                "updated_at": datetime.now(timezone.utc),
            },
            "$push": {
                "risk_history": assessment_to_store
            }
        }
    )

    label = "with Gemini" if force_gemini else "cached"
    logger.info(f"Risk computed ({label}) for {id}: {assessment['risk_level']} ({assessment['final_score']})")
    return assessment_to_store