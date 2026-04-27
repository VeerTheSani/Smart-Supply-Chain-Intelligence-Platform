# routers/dashboard.py
import logging
from fastapi import APIRouter
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/")
async def get_dashboard():
    """
    Returns everything the frontend needs on page load.
    Includes compatibility fields for Nandani's frontend:
    - total_shipments, active_disruptions, avg_risk_score, optimized_routes
    """
    shipments = await db.shipments.find({}).sort("created_at", -1).to_list(100)

    from routers.shipments import _serialize
    serialized = [_serialize(s) for s in shipments]

    # ── Stats for dashboard stat cards ────────────────────────────────────────
    total_shipments = len(serialized)

    risk_scores = []
    active_disruptions = 0
    optimized_routes   = 0

    risk_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0, "unknown": 0}
    status_counts = {}

    for s in serialized:
        # Risk stats
        risk_current = (s.get("risk") or {}).get("current")
        if risk_current:
            level = risk_current.get("risk_level", "unknown").lower()
            score = risk_current.get("risk_score", 0)
            risk_scores.append(score)
            risk_counts[level] = risk_counts.get(level, 0) + 1

            if level in ("high", "critical"):
                active_disruptions += 1
        else:
            risk_counts["unknown"] += 1

        # Status stats
        status = s.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
        if status == "rerouting":
            optimized_routes += 1

    avg_risk_score = round(sum(risk_scores) / len(risk_scores), 1) if risk_scores else 0.0

    # ── Recent alerts ──────────────────────────────────────────────────────────
    all_alerts = []
    for s in serialized:
        for alert in s.get("alerts_triggered", []):
            alert["shipment_name"] = s.get("shipment_name", s.get("origin_name", "Unknown"))
            all_alerts.append(alert)

    all_alerts.sort(key=lambda a: a.get("timestamp", ""), reverse=True)
    recent_alerts = all_alerts[:5]

    return {
        # Fields her frontend stat cards read
        "total_shipments":    total_shipments,
        "active_disruptions": active_disruptions,
        "avg_risk_score":     avg_risk_score,
        "optimized_routes":   optimized_routes,

        # Extra fields (your dashboard uses these)
        "shipments":     serialized,
        "risk_counts":   risk_counts,
        "status_counts": status_counts,
        "recent_alerts": recent_alerts,
        "total":         total_shipments,
    }