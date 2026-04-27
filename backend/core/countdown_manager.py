# core/countdown_manager.py
# In-memory countdown state for auto-reroute delays.
# When scheduler detects HIGH/CRITICAL risk with auto_reroute_enabled,
# it starts a 120-second countdown instead of immediately rerouting.
# The countdown can be cancelled via API or expires to trigger reroute.

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from database import db

logger = logging.getLogger(__name__)

from core.metrics import metrics

COUNTDOWN_SECONDS = 120


class CountdownManager:
    """
    Broadcasts UI events. State is handled by the DB.
    """

    def __init__(self):
        pass

    async def start_countdown(self, shipment_id: str, shipment_name: str, shipment: dict, decision_id: str = None, seconds: int = COUNTDOWN_SECONDS):
        """
        Broadcast countdown start for UI. Actual tracking is handled by the scheduler DB loop.
        """
        from core.websocket_manager import manager
        now = datetime.now(timezone.utc)
        await manager.broadcast({
            "type": "countdown_started",
            "event_id": f"cd_start_{decision_id or shipment_id}_{uuid.uuid4().hex[:8]}",
            "shipment_id": shipment_id,
            "shipment_name": shipment_name,
            "decision_id": decision_id,
            "seconds_remaining": seconds,
            "timestamp": now.isoformat(),
            "version":   now.isoformat(),
        })

        await db.notifications.insert_one({
            "type": "countdown_started",
            "shipment_id": shipment_id,
            "title": "Countdown Started",
            "message": f"Auto-reroute countdown started for {shipment_name}.",
            "action_taken": "countdown_started",
            "impact": f"Reroute will execute in {seconds} seconds if not cancelled.",
            "severity": "high",
            "read": False,
            "timestamp": now.isoformat()
        })

        await metrics.increment("total_countdowns_started")
        logger.info(
            f"[COUNTDOWN_STARTED] shipment={shipment_id} "
            f"decision={decision_id} seconds={seconds}"
        )

    async def broadcast_update(self, shipment_id: str, shipment_name: str, seconds_remaining: int):
        from core.websocket_manager import manager
        now = datetime.now(timezone.utc)
        await manager.broadcast({
            "type": "countdown_update",
            "event_id": str(uuid.uuid4()),
            "shipment_id": shipment_id,
            "shipment_name": shipment_name,
            "seconds_remaining": seconds_remaining,
            "timestamp": now.isoformat(),
            "version":   now.isoformat(),
        })

    async def cancel_countdown(self, shipment_id: str) -> bool:
        """
        Broadcast cancellation. Actual state is managed in DB.
        """
        from core.websocket_manager import manager
        now = datetime.now(timezone.utc)
        await manager.broadcast({
            "type": "countdown_cancelled",
            "event_id": f"cd_cancel_{shipment_id}_{uuid.uuid4().hex[:8]}",
            "shipment_id": shipment_id,
            "timestamp": now.isoformat(),
            "version":   now.isoformat(),
        })

        await metrics.increment("total_countdowns_cancelled")
        logger.info(f"[COUNTDOWN_CANCELLED] shipment={shipment_id}")
        return True

    async def execute_reroute_result(self, shipment_id: str, shipment_name: str, reroute_data: Optional[dict], success: bool):
        from core.websocket_manager import manager
        now = datetime.now(timezone.utc)
        await manager.broadcast({
            "type": "reroute_executed",
            "event_id": f"rr_exec_{shipment_id}_{uuid.uuid4().hex[:8]}",
            "shipment_id": shipment_id,
            "shipment_name": shipment_name,
            "success": success,
            "timestamp": now.isoformat(),
            "version":   now.isoformat(),
        })

        if success:
            if reroute_data:
                impact = f"Route updated to avoid risks. Distance: {reroute_data.get('distance_km', 0)} km, ETA: {reroute_data.get('eta_hours', 0)} hours."
            else:
                impact = "Route updated — distance data unavailable."

            title = "Shipment Rerouted"
            message = f"{shipment_name} was rerouted successfully."
            severity = "critical"
        else:
            impact = "Auto-reroute failed to find alternatives."
            title = "Reroute Failed"
            message = f"Auto-reroute failed for {shipment_name}."
            severity = "high"

        await metrics.increment("total_countdowns_completed")
        logger.info(
            f"[REROUTE_RESULT] shipment={shipment_id} "
            f"success={success}"
        )
        await db.notifications.insert_one({
            "type": "reroute_executed",
            "shipment_id": shipment_id,
            "title": title,
            "message": message,
            "action_taken": "rerouted" if success else "reroute_failed",
            "impact": impact,
            "severity": severity,
            "read": False,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })


# Single shared instance
countdown_manager = CountdownManager()
