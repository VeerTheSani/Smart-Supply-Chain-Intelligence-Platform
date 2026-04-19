# routers/dashboard.py
# GET /api/dashboard
# Returns everything the frontend needs on initial page load.
# One call instead of 5 separate requests.

import logging
from fastapi import APIRouter
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/")
async def get_dashboard():
    """
    Returns:
    - all active shipments with their last risk assessment
    - count by risk level
    - last 5 alerts across all shipments
    - total shipment stats
    """
    # Get all shipments
    shipments = await db.shipments.find({}).sort("created_at", -1).to_list(100)

    # Serialize ObjectId
    serialized = []
    for s in shipments:
        s["id"] = str(s.pop("_id"))
        serialized.append(s)

    # Count by risk level
    risk_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0, "UNKNOWN": 0}
    for s in serialized:
        level = (s.get("last_risk_assessment") or {}).get("risk_level", "UNKNOWN")
        risk_counts[level] = risk_counts.get(level, 0) + 1

    # Count by status
    status_counts = {}
    for s in serialized:
        status = s.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1

    # Collect last 5 alerts across all shipments
    all_alerts = []
    for s in serialized:
        for alert in s.get("alerts_triggered", []):
            alert["shipment_name"] = s.get("shipment_name", s.get("origin_name", "Unknown"))
            all_alerts.append(alert)

    # Sort by timestamp and take last 5
    all_alerts.sort(key=lambda a: a.get("timestamp", ""), reverse=True)
    recent_alerts = all_alerts[:5]

    return {
        "shipments":      serialized,
        "risk_counts":    risk_counts,
        "status_counts":  status_counts,
        "recent_alerts":  recent_alerts,
        "total":          len(serialized),
    }