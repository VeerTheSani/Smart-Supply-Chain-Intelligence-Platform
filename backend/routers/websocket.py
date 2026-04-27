# routers/websocket.py
# WebSocket endpoint — frontend connects here once on dashboard load.
# Stays connected permanently to receive live risk alerts.
# All broadcasts come from the scheduler via manager.broadcast()

import os
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.websocket_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])

API_KEY = os.getenv("API_KEY", "sc-dev-key-2026")


@router.websocket("/ws/alerts")
async def alerts_endpoint(websocket: WebSocket):
    """
    Frontend connects here once.
    Receives live alerts when risk changes on any shipment.

    Authentication:
      - Token passed via query param: /ws/alerts?token=<API_KEY>
      - Invalid/missing token → close with code 1008 (Policy Violation)

    Message types frontend will receive:
      - risk_alert       → risk level changed (LOW→HIGH etc)
      - position_update  → GPS location update
      - countdown_*      → countdown lifecycle events
      - reroute_executed → auto-reroute result
    """
    # ── WS Authentication ─────────────────────────────────────────────────────
    token = websocket.query_params.get("token")
    if not token or token != API_KEY:
        await websocket.accept()
        logger.warning(
            f"[WS] auth_rejected | ip={websocket.client.host if websocket.client else 'unknown'} "
            f"reason={'missing_token' if not token else 'invalid_token'}"
        )
        await websocket.close(code=1008, reason="Unauthorized")
        return

    # ── Connection limit check ────────────────────────────────────────────────
    accepted = await manager.connect(websocket)
    if not accepted:
        return  # Connection rejected due to limits

    try:
        import asyncio
        while True:
            try:
                # Wait for data or timeout to send heartbeat
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                # Send heartbeat to keep connection alive
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        logger.info("Frontend disconnected from alerts")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        # Ensure removal on disconnect
        manager.disconnect(websocket)