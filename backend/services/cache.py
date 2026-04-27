# services/cache.py
# In-memory TTL cache for weather and traffic data.
# Prevents hammering external APIs during scheduler cycles.
# Falls back safely — cache misses just hit the API as before.

import time
import logging
from typing import Any, Optional
from collections import OrderedDict

logger = logging.getLogger(__name__)


class TTLCache:
    """
    Simple in-memory cache with per-key TTL expiry.
    Thread-safe enough for async single-threaded event loop.
    Uses OrderedDict for efficient LRU-style eviction.
    """

    def __init__(self, default_ttl_seconds: int = 300, max_size: int = 500):
        self._store: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._default_ttl = default_ttl_seconds
        self._max_size = max_size

    def get(self, key: str) -> Optional[Any]:
        """Get a value if it exists and hasn't expired. Returns None on miss."""
        try:
            if key not in self._store:
                return None

            value, expires_at = self._store[key]
            if time.monotonic() > expires_at:
                # Expired — remove and return None
                del self._store[key]
                return None

            # Move to end (most recently used)
            self._store.move_to_end(key)
            return value
        except Exception as e:
            logger.debug(f"Cache get error for key '{key}': {e}")
            return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Store a value with optional custom TTL (seconds)."""
        try:
            ttl = ttl if ttl is not None else self._default_ttl
            expires_at = time.monotonic() + ttl

            # Evict oldest if at capacity
            if len(self._store) >= self._max_size and key not in self._store:
                self._store.popitem(last=False)

            self._store[key] = (value, expires_at)
            self._store.move_to_end(key)
        except Exception as e:
            logger.debug(f"Cache set error for key '{key}': {e}")

    def invalidate(self, key: str) -> None:
        """Remove a specific key."""
        self._store.pop(key, None)

    def clear(self) -> None:
        """Clear all entries."""
        self._store.clear()

    def _cleanup_expired(self) -> None:
        """Remove all expired entries. Called periodically if needed."""
        now = time.monotonic()
        expired_keys = [k for k, (_, exp) in self._store.items() if now > exp]
        for k in expired_keys:
            del self._store[k]

    @property
    def size(self) -> int:
        return len(self._store)


# ── Shared cache instances ────────────────────────────────────────────────────
# Weather data changes slowly — 10 minute TTL
weather_cache = TTLCache(default_ttl_seconds=600, max_size=200)

# Traffic is more volatile — 5 minute TTL
traffic_cache = TTLCache(default_ttl_seconds=300, max_size=200)


def cleanup_all_caches():
    """Remove all expired entries from all caches. Called periodically by scheduler."""
    before = weather_cache.size + traffic_cache.size
    weather_cache._cleanup_expired()
    traffic_cache._cleanup_expired()
    after = weather_cache.size + traffic_cache.size
    if before > after:
        logger.debug(f"[CACHE_CLEANUP] evicted={before - after} remaining={after}")

