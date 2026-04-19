# routers/websocket.py
# WebSocket endpoint — frontend connects here once on dashboard load.
# Stays connected permanently to receive live risk alerts.
# All broadcasts come from the scheduler via manager.broadcast()

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.websocket_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])


@router.websocket("/ws/alerts")
async def alerts_endpoint(websocket: WebSocket):
    """
    Frontend connects here once.
    Receives live alerts when risk changes on any shipment.

    Message types frontend will receive:
      - RISK_CHANGE    → risk level changed (LOW→HIGH etc)
      - AUTO_REROUTED  → shipment was automatically rerouted
      - PING           → keepalive every 30 seconds
    """
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            # Frontend can send "ping" to check connection
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Frontend disconnected from alerts")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)