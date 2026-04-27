# core/websocket_manager.py
# Manages all active WebSocket connections.
# When scheduler detects a risk change, it calls manager.broadcast()
# and every connected frontend receives the alert instantly.

import logging
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger(__name__)

MAX_CONNECTIONS = 100
MAX_PER_IP = 5


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self._ip_counts: dict[str, int] = defaultdict(int)

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)

    def _get_ip(self, websocket: WebSocket) -> str:
        try:
            return websocket.client.host if websocket.client else "unknown"
        except Exception:
            return "unknown"

    async def connect(self, websocket: WebSocket) -> bool:
        """
        Accept and register a new frontend connection.
        Returns False and closes if limits exceeded.
        """
        # Check global limit
        if self.connection_count >= MAX_CONNECTIONS:
            logger.warning(
                f"[WS] rejected | reason=max_connections_reached "
                f"limit={MAX_CONNECTIONS}"
            )
            await websocket.close(code=1013, reason="Server at capacity")
            return False

        # Check per-IP limit
        client_ip = self._get_ip(websocket)
        if self._ip_counts[client_ip] >= MAX_PER_IP:
            logger.warning(
                f"[WS] rejected | reason=per_ip_limit "
                f"ip={client_ip} limit={MAX_PER_IP}"
            )
            await websocket.close(code=1013, reason="Too many connections from this IP")
            return False

        await websocket.accept()
        self.active_connections.append(websocket)
        self._ip_counts[client_ip] += 1
        logger.info(f"[WS] connected | ip={client_ip} total={self.connection_count}")
        return True

    def disconnect(self, websocket: WebSocket):
        """Remove a frontend connection when it closes."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            client_ip = self._get_ip(websocket)
            self._ip_counts[client_ip] = max(0, self._ip_counts[client_ip] - 1)
            if self._ip_counts[client_ip] == 0:
                del self._ip_counts[client_ip]
        logger.info(f"[WS] disconnected | total={self.connection_count}")

    async def safe_disconnect(self, websocket: WebSocket):
        """Gracefully close + remove a connection. Swallows errors."""
        try:
            await websocket.close()
        except Exception:
            pass  # Already closed — safe to ignore
        self.disconnect(websocket)

    async def broadcast(self, message: dict):
        """
        Send a message to ALL connected frontends.
        Automatically removes dead connections.
        Never crashes if individual connections fail.
        """
        from core.metrics import metrics

        if not self.active_connections:
            return

        dead = []
        sent_count = 0
        msg_type = message.get("type", "unknown")

        for connection in self.active_connections:
            try:
                await connection.send_json(message)
                sent_count += 1
            except Exception as e:
                logger.warning(
                    f"[WS] send_failed | type={msg_type} "
                    f"error={type(e).__name__}"
                )
                dead.append(connection)
                await metrics.increment("websocket_errors")

        # Clean up dead connections
        for d in dead:
            self.disconnect(d)

        if sent_count > 0:
            await metrics.increment("websocket_messages_sent", sent_count)
            logger.debug(
                f"[WS] broadcast | type={msg_type} "
                f"sent={sent_count} dead={len(dead)} total={self.connection_count}"
            )

    async def send_personal(self, message: dict, websocket: WebSocket):
        """Send a message to ONE specific frontend only."""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.warning(f"[WS] personal_send_failed | error={type(e).__name__}")
            self.disconnect(websocket)


# Single shared instance — imported everywhere
manager = ConnectionManager()