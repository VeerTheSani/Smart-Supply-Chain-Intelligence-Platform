# core/countdown_manager.py
# In-memory countdown state for auto-reroute delays.
# When scheduler detects HIGH/CRITICAL risk with auto_reroute_enabled,
# it starts a 120-second countdown instead of immediately rerouting.
# The countdown can be cancelled via API or expires to trigger reroute.

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from database import db

logger = logging.getLogger(__name__)

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
        # Broadcast countdown_started
        from core.websocket_manager import manager
        await manager.broadcast({
            "type": "countdown_started",
            "shipment_id": shipment_id,
            "shipment_name": shipment_name,
            "decision_id": decision_id,
            "seconds_remaining": seconds,
            "timestamp": datetime.now(timezone.utc).isoformat(),
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
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

        logger.info(f"Countdown started for {shipment_id} ({seconds}s). Managed by DB loop.")

    async def broadcast_update(self, shipment_id: str, shipment_name: str, seconds_remaining: int):
        from core.websocket_manager import manager
        await manager.broadcast({
            "type": "countdown_update",
            "shipment_id": shipment_id,
            "shipment_name": shipment_name,
            "seconds_remaining": seconds_remaining,
        })

    async def cancel_countdown(self, shipment_id: str) -> bool:
        """
        Broadcast cancellation. Actual state is managed in DB.
        """
        from core.websocket_manager import manager
        await manager.broadcast({
            "type": "countdown_cancelled",
            "shipment_id": shipment_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        logger.info(f"Countdown cancelled broadcast for {shipment_id}")
        return True

    async def execute_reroute_success(self, shipment_id: str, shipment_name: str, reroute_data: dict):
        from core.websocket_manager import manager
        await manager.broadcast({
            "type": "reroute_executed",
            "shipment_id": shipment_id,
            "shipment_name": shipment_name,
            "success": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        logger.info(f"Auto-reroute executed for {shipment_id}")
        await db.notifications.insert_one({
            "type": "reroute_executed",
            "shipment_id": shipment_id,
            "title": "Shipment Rerouted",
            "message": f"{shipment_name} was rerouted successfully.",
            "action_taken": "rerouted",
            "impact": f"Route updated to avoid risks. Distance: {reroute_data.get('distance_km', 0)} km, ETA: {reroute_data.get('eta_hours', 0)} hours.",
            "severity": "critical",
            "read": False,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

# Single shared instance
countdown_manager = CountdownManager()
