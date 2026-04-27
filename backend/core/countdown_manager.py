# core/countdown_manager.py
# In-memory countdown state for auto-reroute delays.
# When scheduler detects HIGH/CRITICAL risk with auto_reroute_enabled,
# it starts a 120-second countdown instead of immediately rerouting.
# The countdown can be cancelled via API or expires to trigger reroute.

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Literal
from database import db
from core.event_factory import (
    create_countdown_started,
    create_countdown_update,
    create_countdown_cancelled,
    create_reroute_executed,
)

logger = logging.getLogger(__name__)

from core.metrics import metrics

COUNTDOWN_SECONDS = 120


class CountdownManager:
    """
    Broadcasts UI events. State is handled by the DB.
    """

    def __init__(self):
        pass

    async def start_countdown(
        self,
        shipment_id: str,
        shipment_name: str,
        shipment: dict,
        decision_id: str = None,
        seconds: int = COUNTDOWN_SECONDS,
        source: Literal["REAL_SYSTEM", "SIMULATOR"] = "REAL_SYSTEM",
    ):
        """
        Broadcast countdown start for UI. Actual tracking is handled by the scheduler DB loop.
        
        source: "REAL_SYSTEM" = production, "SIMULATOR" = scenario lab
        """
        from core.websocket_manager import manager
        
        msg = create_countdown_started(
            shipment_id=shipment_id,
            shipment_name=shipment_name,
            seconds_remaining=seconds,
            source=source,
        )
        
        await manager.broadcast(msg)

        await db.notifications.insert_one({
            "type": "countdown_started",
            "source": source,
            "shipment_id": shipment_id,
            "title": "Countdown Started",
            "message": f"Auto-reroute countdown started for {shipment_name}.",
            "action_taken": "countdown_started",
            "impact": f"Reroute will execute in {seconds} seconds if not cancelled.",
            "severity": "high",
            "read": False,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

        await metrics.increment("total_countdowns_started")
        logger.info(
            f"[COUNTDOWN_STARTED] shipment={shipment_id} "
            f"decision={decision_id} seconds={seconds} source={source}"
        )

    async def broadcast_update(
        self,
        shipment_id: str,
        shipment_name: str,
        seconds_remaining: int,
        source: Literal["REAL_SYSTEM", "SIMULATOR"] = "REAL_SYSTEM",
    ):
        """Broadcast countdown tick."""
        from core.websocket_manager import manager
        
        msg = create_countdown_update(
            shipment_id=shipment_id,
            shipment_name=shipment_name,
            seconds_remaining=seconds_remaining,
            source=source,
        )
        
        await manager.broadcast(msg)

    async def cancel_countdown(
        self,
        shipment_id: str,
        source: Literal["REAL_SYSTEM", "SIMULATOR"] = "REAL_SYSTEM",
        reason: str = "Risk dropped below threshold",
    ) -> bool:
        """
        Broadcast cancellation. Actual state is managed in DB.
        """
        from core.websocket_manager import manager
        
        msg = create_countdown_cancelled(
            shipment_id=shipment_id,
            source=source,
            reason=reason,
        )
        
        await manager.broadcast(msg)

        await metrics.increment("total_countdowns_cancelled")
        logger.info(f"[COUNTDOWN_CANCELLED] shipment={shipment_id} source={source} reason={reason}")
        return True

    async def execute_reroute_result(
        self,
        shipment_id: str,
        shipment_name: str,
        reroute_data: Optional[dict],
        success: bool,
        source: Literal["REAL_SYSTEM", "SIMULATOR"] = "REAL_SYSTEM",
    ):
        """Reroute execution result."""
        from core.websocket_manager import manager
        
        msg = create_reroute_executed(
            shipment_id=shipment_id,
            shipment_name=shipment_name,
            source=source,
            success=success,
            reason="Auto-reroute executed" if success else "Auto-reroute failed",
        )
        
        await manager.broadcast(msg)

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
            "source": source,
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
