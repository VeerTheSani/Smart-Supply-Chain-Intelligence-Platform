# routers/reroute.py
# GET /api/reroute/{id}
# Returns 3 alternative routes: Fastest, Safest, Recommended
# Does NOT modify the shipment — just suggests alternatives.
# Frontend draws these as dotted lines on the map.

import logging

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException

from database import db
from routers.reroute_engine import get_alternatives

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reroute", tags=["reroute"])


def _to_id(id: str) -> ObjectId:
    try:
        return ObjectId(id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid id: {id}")


@router.get("/{id}")
async def get_reroute(id: str):
    """
    Get 3 alternative routes for a shipment:
    - Fastest    → lowest travel time
    - Safest     → lowest risk score
    - Recommended → best balance of speed and safety

    Does not modify the shipment.
    Call PATCH /api/shipments/{id} with new status='rerouting'
    if the operator accepts an alternative.
    """
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

    logger.info(
        f"Reroute computed for {id} — "
        f"{len(result['alternatives'])} alternatives found"
    )
    return result