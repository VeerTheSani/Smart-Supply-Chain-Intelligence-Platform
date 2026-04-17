from fastapi import WebSocket
from typing import List

class ConnectionManager:
    """Manages active WebSocket connections to broadcast real-time events."""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        """Broadcasts a JSON message to all connected clients safely."""
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                # Connection might have dropped without clean disconnect
                dead_connections.append(connection)
        
        for dead in dead_connections:
            self.disconnect(dead)

# Global singleton instance for the entire application
manager = ConnectionManager()
