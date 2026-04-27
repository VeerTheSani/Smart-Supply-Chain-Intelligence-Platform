# routers/cascade.py
# GET /api/shipments/{shipment_id}/cascade
# Returns the cascade dependency graph for a shipment.
# Uses BFS traversal with cycle detection and depth limiting.

import logging
from collections import deque

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query

from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/shipments", tags=["cascade"])


def _to_id(id: str) -> ObjectId:
    try:
        return ObjectId(id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid shipment id: {id}")


async def get_cascade_impact(shipment_id: str, max_depth: int = 3) -> list[dict]:
    """
    BFS traversal of the shipment_dependencies collection.
    Finds all downstream shipments that would be affected by a delay
    in the given parent shipment.

    - Uses a queue (BFS) for breadth-first exploration
    - Tracks visited set to avoid cycles
    - Limits depth to max_depth (default 3)
    - All MongoDB queries are async
    """
    root_oid = _to_id(shipment_id)
    visited: set[str] = {shipment_id}
    result: list[dict] = []

    # Queue items: (parent_id_str, current_depth, accumulated_delay_hours)
    queue: deque[tuple[str, int, float]] = deque()
    queue.append((shipment_id, 0, 0.0))

    while queue:
        current_id, depth, accumulated_delay = queue.popleft()

        if depth >= max_depth:
            continue

        # Find all children of this shipment
        try:
            deps = await db.shipment_dependencies.find(
                {"parent_shipment_id": ObjectId(current_id)}
            ).to_list(100)
        except Exception as e:
            logger.error(f"Failed to query dependencies for {current_id}: {e}")
            continue

        for dep in deps:
            child_id_str = str(dep["child_shipment_id"])

            # Cycle detection
            if child_id_str in visited:
                continue
            visited.add(child_id_str)

            delay_sensitivity = dep.get("delay_sensitivity_hours", 0)
            total_delay = accumulated_delay + delay_sensitivity

            # Fetch child shipment details
            try:
                child_shipment = await db.shipments.find_one(
                    {"_id": dep["child_shipment_id"]},
                    {"shipment_name": 1, "status": 1, "origin_name": 1}
                )
            except Exception as e:
                logger.error(f"Failed to fetch child shipment {child_id_str}: {e}")
                child_shipment = None

            child_name = "Unknown"
            child_status = "unknown"
            if child_shipment:
                child_name = child_shipment.get(
                    "shipment_name",
                    child_shipment.get("origin_name", "Unknown")
                )
                child_status = child_shipment.get("status", "unknown")

            result.append({
                "id": child_id_str,
                "shipment_name": child_name,
                "delay_exposure_hours": round(total_delay, 2),
                "status": child_status,
                "depth": depth + 1,
            })

            # Enqueue for further traversal
            queue.append((child_id_str, depth + 1, total_delay))

    return result


@router.get("/{shipment_id}/cascade")
async def get_cascade(
    shipment_id: str,
    max_depth: int = Query(default=3, ge=1, le=10, description="Maximum traversal depth"),
):
    """
    Get the cascade dependency graph for a shipment.
    Shows all downstream shipments that would be impacted by a delay.
    """
    # Validate shipment exists
    shipment = await db.shipments.find_one(
        {"_id": _to_id(shipment_id)},
        {"shipment_name": 1}
    )
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    dependent_shipments = await get_cascade_impact(shipment_id, max_depth=max_depth)

    total_delay_exposure = round(
        sum(d["delay_exposure_hours"] for d in dependent_shipments), 2
    )

    return {
        "shipment_id": shipment_id,
        "dependent_shipments": dependent_shipments,
        "total_delay_exposure_hours": total_delay_exposure,
    }
