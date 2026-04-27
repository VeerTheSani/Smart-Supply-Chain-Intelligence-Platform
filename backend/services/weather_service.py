<<<<<<< Updated upstream
# services/weather_service.py
# Fetches weather at each waypoint for the TIME the truck will actually
# be there — not current weather.
# Uses Open-Meteo hourly forecast (free, no API key).

import asyncio
import httpx
import logging
from datetime import datetime, timezone, timedelta
from services.geocoding_service import reverse_geocode

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Max concurrent Open-Meteo connections — burst of 80+ kills the free tier
_SEMAPHORE = asyncio.Semaphore(5)

# Max waypoints to score per route — weather doesn't change every 50km
MAX_WEATHER_WAYPOINTS = 8

# ── Thresholds ─────────────────────────────────────────────────────────────────
RAINFALL_THRESHOLDS   = [(2, 10),   (10, 30),  (30, 60),  (float("inf"), 90)]
WIND_THRESHOLDS       = [(20, 10),  (40, 30),  (60, 50),  (float("inf"), 80)]
VISIBILITY_THRESHOLDS = [(500, 90), (1000, 60),(5000, 30), (float("inf"), 0)]


def _threshold(value: float, table: list) -> int:
    for upper, score in table:
        if value < upper:
            return score
    return table[-1][1]


# ── Fetch hourly forecast — with semaphore + retry ────────────────────────────

async def _fetch_hourly(lat: float, lng: float) -> dict | None:
    """
    Fetch 48-hour hourly forecast for a coordinate.
    Retries up to 3 times with exponential backoff.
    Semaphore-limited to 5 concurrent connections.
    """
    params = {
        "latitude":      lat,
        "longitude":     lng,
        "hourly":        ["precipitation", "wind_speed_10m", "visibility", "weather_code"],
        "forecast_days": 2,
        "timezone":      "Asia/Kolkata",
    }

    for attempt in range(3):
        try:
            async with _SEMAPHORE:
                async with httpx.AsyncClient(timeout=12.0) as client:
                    resp = await client.get(OPEN_METEO_URL, params=params)
                    resp.raise_for_status()
                    return resp.json().get("hourly", {})
        except Exception as e:
            wait = 0.5 * (2 ** attempt)   # 0.5s → 1s → 2s
            if attempt < 2:
                logger.debug(f"Open-Meteo attempt {attempt+1} failed for ({lat}, {lng}), retrying in {wait}s: {e}")
                await asyncio.sleep(wait)
            else:
                logger.warning(f"Open-Meteo failed after 3 attempts for ({lat}, {lng}): {e}")

    return None


def _get_value_at_hour(hourly: dict, target_time: datetime, key: str) -> float:
    times  = hourly.get("time", [])
    values = hourly.get(key, [])

    if not times or not values:
        return 0

    target_str = target_time.strftime("%Y-%m-%dT%H:00")

    if target_str in times:
        idx = times.index(target_str)
        return values[idx] or 0

    best_idx  = 0
    best_diff = float("inf")
    for i, t in enumerate(times):
        try:
            t_dt   = datetime.strptime(t, "%Y-%m-%dT%H:%M")
            diff   = abs((t_dt - target_time.replace(tzinfo=None)).total_seconds())
            if diff < best_diff:
                best_diff = diff
                best_idx  = i
        except Exception:
            continue

    return values[best_idx] or 0


# ── Score one waypoint at its arrival time ────────────────────────────────────

async def _score_waypoint_at_arrival(
    lat: float,
    lng: float,
    arrival_offset_hours: float,
) -> dict:
    now          = datetime.now(timezone.utc).astimezone()
    arrival_time = now + timedelta(hours=arrival_offset_hours)

    hourly = await _fetch_hourly(lat, lng)

    if hourly is None:
        return {
            "lat":    lat,
            "lng":    lng,
            "score":  0,          # treat unavailable as clear — don't penalise
            "reason": "Weather data unavailable",
            "arrival_time": arrival_time.strftime("%H:%M"),
            "raw":    {}
        }

    rainfall   = _get_value_at_hour(hourly, arrival_time, "precipitation")
    wind       = _get_value_at_hour(hourly, arrival_time, "wind_speed_10m")
    visibility = _get_value_at_hour(hourly, arrival_time, "visibility") or 10000

    r = _threshold(rainfall,   RAINFALL_THRESHOLDS)
    w = _threshold(wind,       WIND_THRESHOLDS)
    v = _threshold(visibility, VISIBILITY_THRESHOLDS)

    score = max(r, w, v)

    reasons = []
    if r == score and rainfall > 2:
        reasons.append(f"{rainfall:.1f}mm rain")
    if w == score and wind > 20:
        reasons.append(f"{wind:.0f}km/h wind")
    if v == score and visibility < 5000:
        reasons.append(f"{visibility:.0f}m visibility")

    return {
        "lat":          lat,
        "lng":          lng,
        "score":        score,
        "reason":       ", ".join(reasons) if reasons else "Clear conditions",
        "arrival_time": arrival_time.strftime("%d %b %H:%M"),
        "raw": {
            "rainfall_mm":  rainfall,
            "wind_kmh":     wind,
            "visibility_m": visibility,
        }
    }


# ── Main: score entire route ───────────────────────────────────────────────────

async def score_weather_along_route(waypoints: list[dict]) -> dict:
    """
    Score weather at sampled waypoints based on WHEN the truck will be there.

    Waypoints are thinned to MAX_WEATHER_WAYPOINTS evenly-spaced samples
    before calling Open-Meteo — weather doesn't change every 50km and the
    burst of 80+ concurrent calls reliably triggers rate limits.

    Each waypoint must have: lat, lng, arrival_offset_hours (defaults to 0).
    """
    if not waypoints:
        return {"score": 0, "reason": "No waypoints", "point_results": []}

    # ── Thin to at most MAX_WEATHER_WAYPOINTS evenly-spaced points ──
    n = len(waypoints)
    if n <= MAX_WEATHER_WAYPOINTS:
        sampled = waypoints
    else:
        step    = (n - 1) / (MAX_WEATHER_WAYPOINTS - 1)
        sampled = [waypoints[round(i * step)] for i in range(MAX_WEATHER_WAYPOINTS)]

    tasks = [
        _score_waypoint_at_arrival(
            wp["lat"],
            wp["lng"],
            wp.get("arrival_offset_hours", 0),
        )
        for wp in sampled
    ]
    results = await asyncio.gather(*tasks)

    # Filter out unavailable results before finding worst
    scored = [r for r in results if r["reason"] != "Weather data unavailable"]

    # All waypoints failed — return neutral, don't surface a fake location warning
    if not scored:
        return {
            "score":         0,
            "reason":        "Clear conditions along route",
            "point_results": list(results),
        }

    worst = max(scored, key=lambda r: r["score"])

    if worst["score"] > 0:
        place = await reverse_geocode(worst["lat"], worst["lng"])
        reason = f"{worst['reason']} near {place} around {worst['arrival_time']}"
    else:
        reason = "Clear conditions along route"

    return {
        "score":         worst["score"],
        "reason":        reason,
        "point_results": list(results),
    }


# ── Self test ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    async def test():
        waypoints = [
            {"lat": 21.1702, "lng": 72.8312, "arrival_offset_hours": 0.0},
            {"lat": 21.4950, "lng": 72.9219, "arrival_offset_hours": 0.6},
            {"lat": 21.9328, "lng": 72.9770, "arrival_offset_hours": 1.3},
            {"lat": 22.3527, "lng": 73.0911, "arrival_offset_hours": 2.0},
            {"lat": 22.6965, "lng": 72.8977, "arrival_offset_hours": 2.7},
            {"lat": 23.0467, "lng": 72.6812, "arrival_offset_hours": 3.3},
            {"lat": 23.2449, "lng": 72.4967, "arrival_offset_hours": 3.9},
        ]

        print("Fetching time-aware weather for Surat → Kalol...\n")
        result = await score_weather_along_route(waypoints)

        print(f"Worst weather score : {result['score']}/100")
        print(f"Primary concern     : {result['reason']}")
        print(f"\nSampled {len(result['point_results'])} waypoints:")
        for p in result["point_results"]:
            print(
                f"  ({p['lat']:.4f}, {p['lng']:.4f}) "
                f"@ {p['arrival_time']:>14} → "
                f"score {p['score']:>3} | {p['reason']}"
            )

    asyncio.run(test())
=======
# services/weather_service.py
# Fetches weather at each waypoint for the TIME the truck will actually
# be there — not current weather.
# Uses Open-Meteo hourly forecast (free, no API key).

import httpx
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# ── Thresholds ─────────────────────────────────────────────────────────────────
RAINFALL_THRESHOLDS   = [(2, 10),   (10, 30),  (30, 60),  (float("inf"), 90)]
WIND_THRESHOLDS       = [(20, 10),  (40, 30),  (60, 50),  (float("inf"), 80)]
VISIBILITY_THRESHOLDS = [(500, 90), (1000, 60),(5000, 30), (float("inf"), 0)]


def _threshold(value: float, table: list) -> int:
    for upper, score in table:
        if value < upper:
            return score
    return table[-1][1]


# ── Fetch hourly forecast for one point ───────────────────────────────────────

import time

# Native dict cache: { cache_key: (expiration_timestamp, data) }
weather_api_cache = {}
CACHE_TTL = 1800  # 30 minutes

async def _fetch_hourly(lat: float, lng: float) -> dict | None:
    """
    Fetch 48-hour hourly forecast for a coordinate.
    Uses an aggressive native caching layer to prevent Open-Meteo's 50 reqs/sec limit.
    """
    # Round to 1 decimal (~11km resolution) to maximize cache hits
    # E.g. 23.4, 72.8 allows hundreds of waypoints to collapse into 1 API call
    cache_key = f"{round(lat, 1)},{round(lng, 1)}"
    
    # Check cache
    if cache_key in weather_api_cache:
        expire_time, cached_data = weather_api_cache[cache_key]
        if time.time() < expire_time:
            return cached_data
        else:
            del weather_api_cache[cache_key]

    params = {
        "latitude":      lat,
        "longitude":     lng,
        "hourly":        ["precipitation", "wind_speed_10m", "visibility", "weather_code"],
        "forecast_days": 2,        # 48 hours ahead
        "timezone":      "Asia/Kolkata",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(OPEN_METEO_URL, params=params)
            resp.raise_for_status()
            data = resp.json().get("hourly", {})
            
            # Save to cache
            weather_api_cache[cache_key] = (time.time() + CACHE_TTL, data)
            
            # Simple cleanup to prevent runaway memory leak
            if len(weather_api_cache) > 2000:
                oldest_keys = sorted(weather_api_cache.keys(), key=lambda k: weather_api_cache[k][0])[:500]
                for k in oldest_keys: weather_api_cache.pop(k, None)
                
            return data
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
             logger.warning(f"Open-Meteo rate limit (429) hit for ({lat}, {lng})")
        else:
             logger.warning(f"Open-Meteo failed for ({lat}, {lng}): {e}")
        return None
    except Exception as e:
        logger.warning(f"Open-Meteo failed for ({lat}, {lng}): {e}")
        return None


def _get_value_at_hour(hourly: dict, target_time: datetime, key: str) -> float:
    """
    Pick the hourly value closest to target_time.
    Open-Meteo returns times like "2026-04-18T14:00" in IST.
    """
    times  = hourly.get("time", [])
    values = hourly.get(key, [])

    if not times or not values:
        return 0

    # Find the index whose time is closest to target_time
    target_str = target_time.strftime("%Y-%m-%dT%H:00")

    # Try exact match first
    if target_str in times:
        idx = times.index(target_str)
        return values[idx] or 0

    # Otherwise find closest hour
    best_idx  = 0
    best_diff = float("inf")
    for i, t in enumerate(times):
        try:
            t_dt   = datetime.strptime(t, "%Y-%m-%dT%H:%M")
            diff   = abs((t_dt - target_time.replace(tzinfo=None)).total_seconds())
            if diff < best_diff:
                best_diff = diff
                best_idx  = i
        except Exception:
            continue

    return values[best_idx] or 0


# ── Score one waypoint at its arrival time ────────────────────────────────────

async def _score_waypoint_at_arrival(
    lat: float,
    lng: float,
    arrival_offset_hours: float,
) -> dict:
    """
    Fetch hourly forecast and score weather at the time the truck
    will arrive at this waypoint.
    """
    now          = datetime.now(timezone.utc).astimezone()
    arrival_time = now + timedelta(hours=arrival_offset_hours)

    hourly = await _fetch_hourly(lat, lng)

    if hourly is None:
        return {
            "lat":    lat,
            "lng":    lng,
            "score":  50,
            "reason": "Weather data unavailable",
            "arrival_time": arrival_time.strftime("%I:%M %p"),
            "raw":    {}
        }

    rainfall   = _get_value_at_hour(hourly, arrival_time, "precipitation")
    wind       = _get_value_at_hour(hourly, arrival_time, "wind_speed_10m")
    visibility = _get_value_at_hour(hourly, arrival_time, "visibility") or 10000

    r = _threshold(rainfall,   RAINFALL_THRESHOLDS)
    w = _threshold(wind,       WIND_THRESHOLDS)
    v = _threshold(visibility, VISIBILITY_THRESHOLDS)

    score = max(r, w, v)

    reasons = []
    if r == score and rainfall > 2:
        reasons.append(f"{rainfall:.1f}mm rain")
    if w == score and wind > 20:
        reasons.append(f"{wind:.0f}km/h wind")
    if v == score and visibility < 5000:
        reasons.append(f"{visibility:.0f}m visibility")

    return {
        "lat":          lat,
        "lng":          lng,
        "score":        score,
        "reason":       ", ".join(reasons) if reasons else "Clear conditions",
        "arrival_time": arrival_time.strftime("%d %b %I:%M %p"),  # e.g. "18 Apr 10:30 PM"
        "raw": {
            "rainfall_mm":  rainfall,
            "wind_kmh":     wind,
            "visibility_m": visibility,
        }
    }


# ── Main: score entire route ───────────────────────────────────────────────────

async def score_weather_along_route(waypoints: list[dict]) -> dict:
    """
    Score weather at each waypoint based on WHEN the truck will be there.

    Each waypoint must have:
      - lat, lng
      - arrival_offset_hours (how many hours from now until truck arrives here)
        → if missing, defaults to 0 (current weather)

    Returns:
    {
        "score":         int,    # 0-100 worst case across all waypoints
        "reason":        str,    # what's causing it + where
        "point_results": list    # per-waypoint breakdown
    }
    """
    import asyncio

    if not waypoints:
        return {"score": 50, "reason": "No waypoints", "point_results": []}

    # Score all waypoints concurrently
    tasks = [
        _score_waypoint_at_arrival(
            wp["lat"],
            wp["lng"],
            wp.get("arrival_offset_hours", 0),
        )
        for wp in waypoints
    ]
    results = await asyncio.gather(*tasks)

    worst = max(results, key=lambda r: r["score"])

    return {
        "score":         worst["score"],
        "reason":        f"{worst['reason']} at ({worst['lat']:.2f}, {worst['lng']:.2f}) around {worst['arrival_time']}",
        "point_results": list(results),
    }


# ── Self test ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio

    async def test():
        # Surat → Kalol, ETA 3.9 hours
        # Each waypoint gets arrival_offset_hours based on distance
        waypoints = [
            {"lat": 21.1702, "lng": 72.8312, "arrival_offset_hours": 0.0},   # Surat — now
            {"lat": 21.4950, "lng": 72.9219, "arrival_offset_hours": 0.6},   # +50km ~ 0.6h
            {"lat": 21.9328, "lng": 72.9770, "arrival_offset_hours": 1.3},   # +100km ~ 1.3h
            {"lat": 22.3527, "lng": 73.0911, "arrival_offset_hours": 2.0},   # +150km ~ 2.0h
            {"lat": 22.6965, "lng": 72.8977, "arrival_offset_hours": 2.7},   # +200km ~ 2.7h
            {"lat": 23.0467, "lng": 72.6812, "arrival_offset_hours": 3.3},   # +250km ~ 3.3h
            {"lat": 23.2449, "lng": 72.4967, "arrival_offset_hours": 3.9},   # Kalol — ETA
        ]

        print("Fetching time-aware weather for Surat → Kalol...\n")
        result = await score_weather_along_route(waypoints)

        print(f"Worst weather score : {result['score']}/100")
        print(f"Primary concern     : {result['reason']}")
        print("\nPer waypoint (at arrival time):")
        for p in result["point_results"]:
            print(
                f"  ({p['lat']:.4f}, {p['lng']:.4f}) "
                f"@ {p['arrival_time']:>14} → "
                f"score {p['score']:>3} | {p['reason']}"
            )
            print(
                f"    rain={p['raw'].get('rainfall_mm', '?')}mm  "
                f"wind={p['raw'].get('wind_kmh', '?')}km/h  "
                f"vis={p['raw'].get('visibility_m', '?')}m"
            )

    asyncio.run(test())
>>>>>>> Stashed changes
