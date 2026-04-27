# core/websocket_manager.py
# Manages all active WebSocket connections.
# When scheduler detects a risk change, it calls manager.broadcast()
# and every connected frontend receives the alert instantly.

import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # List of all currently connected frontends
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """Accept and register a new frontend connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Remove a frontend connection when it closes."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """
        Send a message to ALL connected frontends.
        Automatically removes dead connections.
        """
        if not self.active_connections:
            logger.debug("No active WebSocket connections to broadcast to")
            return

        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to connection: {e}")
                dead.append(connection)

        # Clean up dead connections
        for d in dead:
            self.disconnect(d)

        if self.active_connections:
            logger.info(f"Broadcasted to {len(self.active_connections)} connections")

    async def send_personal(self, message: dict, websocket: WebSocket):
        """Send a message to ONE specific frontend only."""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.warning(f"Failed to send personal message: {e}")
            self.disconnect(websocket)


# Single shared instance — imported everywhere
manager = ConnectionManager()
