# routers/reroute_engine.py
# Fast path  : get_alternatives()       — traffic ratio only, no weather API (~3-5s)
# Slow path  : score_alternatives_risk() — full weather + traffic scoring (~20-30s, on-demand)

import asyncio
import logging
import math

from services.mappls_service import get_route_alternatives
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


def _recommended_score(risk_score: float, extra_time_minutes: float) -> float:
    time_penalty = min((extra_time_minutes / 120) * 100, 100)
    return round(risk_score * 0.60 + time_penalty * 0.40, 2)


def _label_routes(routes: list) -> list:
    """
    Assign Fastest / Safest / Recommended labels and deduplicate.
    Works on any list of route dicts that have risk_score + duration_seconds.
    """
    base_duration = min(r["duration_seconds"] for r in routes)
    for r in routes:
        r["extra_time_minutes"] = round(max((r["duration_seconds"] - base_duration) / 60, 0), 1)

    fastest_r = min(routes, key=lambda x: x["duration_seconds"])
    safest_r  = min(routes, key=lambda x: x["risk_score"])
    rec_r     = min(routes, key=lambda x: _recommended_score(x["risk_score"], x["extra_time_minutes"]))

    # Copy each so overlapping winners don't overwrite each other's label
    fastest = {**fastest_r, "label": "Fastest",     "label_reason": "Shortest travel time"}
    safest  = {**safest_r,  "label": "Safest",      "label_reason": f"Lowest risk — {safest_r['risk_level']} ({safest_r['risk_score']:.0f}/100)"}
    recommended = {
        **rec_r,
        "label": "Recommended",
        "label_reason": f"Best balance — {rec_r['risk_level']} risk, +{rec_r['extra_time_minutes']:.0f} min",
    }

    result = []
    seen = set()
    for alt in [recommended, fastest, safest]:
        # Deduplicate by rounding distance to 30km and duration to 15min buckets
        # Intentionally loose — only collapse truly identical routes, not similar corridors
        key = (round(alt["distance_km"] / 30) * 30, round(alt["duration_seconds"] / 900) * 900)
        if key not in seen:
            seen.add(key)
            result.append(alt)
    return result


# ── Fast path ─────────────────────────────────────────────────────────────────

async def get_alternatives(shipment: dict) -> dict:
    """
    Returns 3 alternative routes using traffic ratio only — no weather API calls.
    Completes in ~3-5 seconds. Risk scores are traffic-based estimates only.
    """
    current_location = shipment.get("origin_coords") or shipment.get("current_location")
    dest_coords      = shipment.get("destination_coords")
    current_risk     = shipment.get("last_risk_assessment") or {}

    if not current_location or not dest_coords:
        raise ValueError("Shipment missing location data")

    logger.info("Fetching alternative routes (fast path, traffic only)...")
    all_routes = await get_route_alternatives(current_location, dest_coords)

    if len(all_routes) < 1:
        raise ValueError("Could not compute any alternative routes for this path")

    # Quick risk estimate from traffic ratio only — no weather API
    routes_scored = []
    for r in all_routes:
        traffic_ratio = r.get("traffic_ratio", 1.0)
        risk_score    = round(float(_threshold(traffic_ratio, TRAFFIC_THRESHOLDS)), 1)
        risk_level    = _risk_level(risk_score).lower()
        routes_scored.append({
            **r,
            "risk_score":    risk_score,
            "risk_level":    risk_level,
            "weather_score": None,
            "traffic_score": risk_score,
            "reason":        f"Traffic {traffic_ratio:.2f}x — weather not yet assessed",
            "risk_assessed": False,
        })

    labeled = _label_routes(routes_scored)

    return {
        "shipment_id":   str(shipment.get("_id", "")),
        "current_risk":  current_risk.get("final_score", 0),
        "current_level": (current_risk.get("risk_level") or "UNKNOWN"),
        "risk_assessed": False,
        "primary_route": {
            "risk_score":  routes_scored[0]["risk_score"],
            "risk_level":  routes_scored[0]["risk_level"],
            "distance_km": routes_scored[0]["distance_km"],
            "eta_hours":   routes_scored[0]["eta_hours"],
            "reason":      routes_scored[0]["reason"],
        },
        "alternatives": labeled,
    }


# ── Slow path (on-demand) ─────────────────────────────────────────────────────

async def score_alternatives_risk(alternatives: list) -> list:
    """
    Full weather + traffic scoring for a list of alternatives.
    Each alternative must have: waypoints, duration_seconds, distance_km, traffic_ratio.
    Returns the same list with updated risk_score, risk_level, weather_score, reason.
    """
    async def _score_one(alt: dict) -> dict:
        waypoints     = alt.get("waypoints", [])
        # Accept both canonical names and the UI aliases set by _transform_for_frontend
        eta_seconds   = alt.get("duration_seconds") or alt.get("eta") or 0
        distance_km   = alt.get("distance_km") or alt.get("distance") or 0
        traffic_ratio = alt.get("traffic_ratio", 1.0)

        timed          = _build_timed_waypoints(waypoints, eta_seconds, distance_km)
        weather_result = await score_weather_along_route(timed)

        weather_score = weather_result["score"]
        traffic_score = _threshold(traffic_ratio, TRAFFIC_THRESHOLDS)
        combined      = round(weather_score * 0.60 + traffic_score * 0.40, 2)

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
            **alt,
            # Guarantee canonical names exist regardless of what came in
            "duration_seconds": eta_seconds,
            "distance_km":      distance_km,
            "risk_score":       combined,
            "risk_level":       _risk_level(combined).lower(),
            "weather_score":    weather_score,
            "traffic_score":    float(traffic_score),
            "reason":           reason,
            "risk_assessed":    True,
        }

    scored = await asyncio.gather(*[_score_one(a) for a in alternatives])
    result = _label_routes(list(scored))
    return result
