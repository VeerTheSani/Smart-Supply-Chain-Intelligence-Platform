# core/metrics.py
# Lightweight in-memory metrics tracker for observability.
# Thread-safe via asyncio lock. No external dependencies.

import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class MetricsTracker:
    """
    Minimal in-memory counters for system health visibility.
    Safe for concurrent async access.
    """

    def __init__(self):
        self._counters = {
            "total_reroutes":          0,
            "total_reroute_failures":  0,
            "total_retries":           0,
            "total_lock_failures":     0,
            "total_countdowns_started": 0,
            "total_countdowns_cancelled": 0,
            "total_countdowns_completed": 0,
            "websocket_messages_sent": 0,
            "websocket_errors":        0,
            "gps_updates_sent":        0,
            "risk_alerts_sent":        0,
            "shipments_delivered":     0,
        }
        self._lock = asyncio.Lock()
        self._started_at = datetime.now(timezone.utc)

    async def increment(self, name: str, amount: int = 1):
        """Increment a named counter. Creates it if it doesn't exist."""
        async with self._lock:
            self._counters[name] = self._counters.get(name, 0) + amount

    def increment_sync(self, name: str, amount: int = 1):
        """Synchronous increment — for use in non-async contexts."""
        self._counters[name] = self._counters.get(name, 0) + amount

    async def get_metrics(self) -> dict:
        """Return snapshot of all counters plus uptime info."""
        async with self._lock:
            now = datetime.now(timezone.utc)
            uptime_seconds = (now - self._started_at).total_seconds()
            return {
                "counters": dict(self._counters),
                "started_at": self._started_at.isoformat(),
                "uptime_seconds": round(uptime_seconds, 1),
                "snapshot_at": now.isoformat(),
            }

    async def reset(self):
        """Reset all counters. Useful for testing."""
        async with self._lock:
            for key in self._counters:
                self._counters[key] = 0
            self._started_at = datetime.now(timezone.utc)


# Single shared instance
metrics = MetricsTracker()
