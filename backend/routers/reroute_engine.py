# services/reroute_engine.py
# Gets 3 alternative routes from Mappls and scores each one.
# Returns Fastest, Safest, and Recommended options.
# Called by routers/reroute.py
# Does NOT call Gemini — weather + traffic only for speed.

import logging
import math
from datetime import datetime, timezone

from services.mappls_service import get_route
from services.weather_service import score_weather_along_route

logger = logging.getLogger(__name__)

TRAFFIC_THRESHOLDS = [(1.1, 10), (1.3, 30), (1.5, 50), (2.0, 75), (float("inf"), 90)]
RISK_LEVELS        = [(30, "LOW"), (60, "MEDIUM"), (85, "HIGH"), (float("inf"), "CRITICAL")]


def _threshold(value: float, table: list) -> int:
    for upper, score in table:
        if value < upper:
            return score
    return table[-1][1]


def _risk_level(score: float) -> str:
    for upper, level in RISK_LEVELS:
        if score < upper:
            return level
    return "CRITICAL"


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _build_timed_waypoints(waypoints, eta_seconds, distance_km) -> list[dict]:
    """Add arrival_offset_hours to each waypoint based on ETA."""
    if not waypoints or not eta_seconds or not distance_km:
        return waypoints

    avg_speed = distance_km / (eta_seconds / 3600)
    start = waypoints[0]
    timed = []
    for wp in waypoints:
        dist = _haversine_km(start["lat"], start["lng"], wp["lat"], wp["lng"])
        hours = dist / avg_speed if avg_speed > 0 else 0
        timed.append({**wp, "arrival_offset_hours": round(hours, 2)})
    return timed


async def _score_route(route: dict) -> dict:
    """
    Score a single route on weather + traffic only.
    Returns risk score, level, and reason.
    """
    import asyncio

    waypoints    = route.get("waypoints", [])
    eta_seconds  = route.get("duration_seconds", 0)
    distance_km  = route.get("distance_km", 0)
    traffic_ratio = route.get("traffic_ratio", 1.0)

    # Time-aware waypoints
    timed = _build_timed_waypoints(waypoints, eta_seconds, distance_km)

    # Run weather concurrently with traffic scoring
    weather_result = await score_weather_along_route(timed)

    weather_score  = weather_result["score"]
    traffic_score  = _threshold(traffic_ratio, TRAFFIC_THRESHOLDS)

    # Weighted: weather 60%, traffic 40% (no events/time buffer for alternatives)
    combined = round(weather_score * 0.60 + traffic_score * 0.40, 2)

    # Build reason
    reasons = []
    if weather_score > 30:
        reasons.append(weather_result["reason"])
    if traffic_score > 30:
        if traffic_ratio < 1.3:   reasons.append("light traffic")
        elif traffic_ratio < 1.5: reasons.append("moderate traffic")
        elif traffic_ratio < 2.0: reasons.append("heavy traffic")
        else:                     reasons.append("gridlock")

    reason = ", ".join(reasons) if reasons else "Clear conditions, free flow"

    return {
        "risk_score":      combined,
        "risk_level":      _risk_level(combined),
        "weather_score":   weather_score,
        "traffic_score":   traffic_score,
        "traffic_ratio":   traffic_ratio,
        "reason":          reason,
        "waypoints":       waypoints,
        "distance_km":     distance_km,
        "duration_seconds": eta_seconds,
        "eta_hours":       round(eta_seconds / 3600, 2),
    }


def _recommended_score(risk_score: float, extra_time_minutes: float) -> float:
    """
    Score for recommendation — balances risk and time.
    Lower = better.
    risk 60% weight, time penalty 40% weight.
    Time penalty normalized to 0-100 (120 mins = score 100).
    """
    time_penalty = min((extra_time_minutes / 120) * 100, 100)
    return round(risk_score * 0.60 + time_penalty * 0.40, 2)


async def get_alternatives(shipment: dict) -> dict:
    """
    Main function. Pass MongoDB shipment doc.
    Returns current risk + 3 labeled alternatives.
    """
    current_location = shipment.get("current_location") or shipment.get("origin_coords")
    dest_coords      = shipment.get("destination_coords")
    current_risk     = shipment.get("last_risk_assessment", {})

    if not current_location or not dest_coords:
        raise ValueError("Shipment missing location data")

    # Fetch alternatives from Mappls
    logger.info("Fetching alternative routes from Mappls...")
    route_data = await get_route(current_location, dest_coords, alternatives=True)

    primary      = route_data
    alternatives = route_data.get("alternatives", [])

    if not alternatives:
        raise ValueError("Mappls returned no alternative routes for this path")

    # Build list of all routes including primary
    all_routes = [primary] + alternatives

    # Score all routes concurrently
    import asyncio
    scored = await asyncio.gather(*[_score_route(r) for r in all_routes])

    # Primary route baseline duration for extra_time calc
    primary_duration = primary.get("duration_seconds", 1)

    # Add extra time vs primary
    for i, s in enumerate(scored):
        extra_secs = s["duration_seconds"] - primary_duration
        s["extra_time_minutes"] = round(max(extra_secs / 60, 0), 1)

    # Skip primary (index 0), label alternatives
    alt_scored = scored[1:]

    if not alt_scored:
        raise ValueError("No scored alternatives available")

    # Fastest → lowest duration
    fastest = min(alt_scored, key=lambda x: x["duration_seconds"])
    fastest["label"] = "Fastest"
    fastest["label_reason"] = f"Saves {abs(fastest['extra_time_minutes']):.0f} min vs other options"

    # Safest is lowest risk score
    safest = min(alt_scored, key=lambda x: x["risk_score"])
    safest["label"] = "Safest"
    safest["label_reason"] = f"Lowest risk — {safest['risk_level']} ({safest['risk_score']:.0f}/100)"

    #smart  Recommended 
    recommended = min(
        alt_scored,
        key=lambda x: _recommended_score(x["risk_score"], x["extra_time_minutes"])
    )
    recommended["label"] = "Recommended"
    recommended["label_reason"] = (
        f"Best balance — {recommended['risk_level']} risk, "
        f"+{recommended['extra_time_minutes']:.0f} min"
    )

    # Handle case where fastest == safest == recommended (only 1 alternative)
    result_alts = []
    seen = set()
    for alt in [recommended, fastest, safest]:
        key = (alt["distance_km"], alt["duration_seconds"])
        if key not in seen:
            seen.add(key)
            result_alts.append(alt)

    return {
        "shipment_id":     str(shipment.get("_id", "")),
        "current_risk":    current_risk.get("final_score", 0),
        "current_level":   current_risk.get("risk_level", "UNKNOWN"),
        "primary_route": {
            "risk_score":   scored[0]["risk_score"],
            "risk_level":   scored[0]["risk_level"],
            "distance_km":  scored[0]["distance_km"],
            "eta_hours":    scored[0]["eta_hours"],
            "reason":       scored[0]["reason"],
        },
        "alternatives": result_alts,
    }