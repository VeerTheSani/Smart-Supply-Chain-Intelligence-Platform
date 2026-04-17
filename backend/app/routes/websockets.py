from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.websocket import manager

router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time supply chain alerts.
    Clients connect to this to receive live disruption and risk changes.
    """
    await manager.connect(websocket)
    try:
        while True:
            # Keep the connection alive, allow pong/ping frames from client
            # We don't process incoming client messages currently
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
