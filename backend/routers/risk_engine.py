# services/risk_engine.py
import logging
import math
from datetime import datetime, timezone
from typing import Optional

import httpx

from services.weather_service import score_weather_along_route
from services.mappls_service import get_route

logger = logging.getLogger(__name__)

WEIGHTS = {
    "weather":     0.35,
    "traffic":     0.20,
    "events":      0.25,
    "time_buffer": 0.15,
    "historical":  0.05,
}

TRAFFIC_THRESHOLDS     = [(1.1, 10), (1.3, 30), (1.5, 50), (2.0, 75), (float("inf"), 90)]
TIME_BUFFER_THRESHOLDS = [(0.25, 10), (0.5, 30), (0.75, 50), (1.0, 75), (float("inf"), 95)]
RISK_LEVELS            = [(30, "LOW"), (60, "MEDIUM"), (85, "HIGH"), (float("inf"), "CRITICAL")]


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


# weathering 

def _build_timed_waypoints(
    waypoints: list[dict],
    current_location: dict,
    origin_coords: dict,
    eta_seconds: int,
    total_distance_km: float,
) -> list[dict]:
    if not waypoints or not eta_seconds or not total_distance_km:
        return waypoints

    avg_speed_kmh = total_distance_km / (eta_seconds / 3600)
    start = current_location or origin_coords

    timed = []
    for wp in waypoints:
        dist_km = _haversine_km(start["lat"], start["lng"], wp["lat"], wp["lng"])
        hours_to_arrive = dist_km / avg_speed_kmh if avg_speed_kmh > 0 else 0
        timed.append({**wp, "arrival_offset_hours": round(hours_to_arrive, 2)})
    return timed


async def _compute_weather_score(
    waypoints, current_location, origin_coords, eta_seconds, total_distance_km
) -> dict:
    try:
        timed = _build_timed_waypoints(
            waypoints, current_location, origin_coords,
            eta_seconds, total_distance_km
        )
        result = await score_weather_along_route(timed)
        return {"score": result["score"], "reason": result["reason"], "weight": WEIGHTS["weather"]}
    except Exception as e:
        logger.error(f"Weather scoring failed: {e}")
        return {"score": 50, "reason": "Weather data unavailable", "weight": WEIGHTS["weather"]}


# ── 2. Traffic ─────────────────────────────────────────────────────────────────

async def _compute_traffic_score(current_location: dict, dest_coords: dict) -> dict:
    try:
        start = current_location or dest_coords
        route = await get_route(start, dest_coords)
        traffic_ratio = route.get("traffic_ratio", 1.0)
        score = _threshold(traffic_ratio, TRAFFIC_THRESHOLDS)

        if traffic_ratio < 1.1:       desc = "Free flow"
        elif traffic_ratio < 1.3:     desc = "Light traffic"
        elif traffic_ratio < 1.5:     desc = "Moderate traffic"
        elif traffic_ratio < 2.0:     desc = "Heavy traffic"
        else:                         desc = "Gridlock"

        return {
            "score":         score,
            "reason":        f"{desc} ({traffic_ratio}x slower than normal)",
            "weight":        WEIGHTS["traffic"],
            "traffic_ratio": traffic_ratio,
        }
    except Exception as e:
        logger.error(f"Traffic scoring failed: {e}")
        return {"score": 50, "reason": "Traffic data unavailable", "weight": WEIGHTS["traffic"], "traffic_ratio": None}

# At the top, replace gemini/segment imports with:
from routers.incidents import _build_bbox, _parse_incidents, TOMTOM_KEY

# Incident type → risk points
INCIDENT_SCORE_MAP = {
    "ROAD_CLOSED":         30,
    "ACCIDENT":            20,
    "FLOODING":            18,
    "DANGEROUS_CONDITIONS":12,
    "ROAD_WORKS":          12,
    "HAZARD":              10,
    "ROAD_HAZARD":         0.5,
    "JAM":                 10,
    "BROKEN_DOWN_VEHICLE":  8,
    "HIGH_WINDS":           8,
    "RAIN":                 6,
}

# magnitude 0-3 → multiplier
MAGNITUDE_MULT = {0: 0.5, 1: 0.6, 2: 1.0, 3: 1.5}


async def _compute_event_score(waypoints: list[dict]) -> dict:
    """waypoints = shipment's route_waypoints [{lat, lng}, ...]"""
    try:
        if not waypoints or len(waypoints) < 2:
            return {"score": 0, "reason": "No waypoints", "weight": WEIGHTS["events"], "events_found": []}

        lng_min, lat_min, lng_max, lat_max = _build_bbox(waypoints)
        bbox_str = f"{lng_min:.4f},{lat_min:.4f},{lng_max:.4f},{lat_max:.4f}"

        async with httpx.AsyncClient(timeout=8.0) as client:
            url = (
                f"https://api.tomtom.com/traffic/services/5/incidentDetails"
                f"?key={TOMTOM_KEY}&bbox={bbox_str}&language=en-GB&zoom=10"
            )
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        raw = (
            data.get("features")
            or data.get("incidentFeatures")
            or data.get("incidents")
            or []
        )

        incidents = _parse_incidents(raw, waypoints)

        total = 0.0
        for inc in incidents:
            base = INCIDENT_SCORE_MAP.get(inc["type"], 5)
            mult = MAGNITUDE_MULT.get(inc["severity"], 1.0)
            total += base * mult

        score = min(round(total), 100)
        reason = incidents[0]["description"] if incidents else "No incidents on route"

        return {
            "score":        score,
            "reason":       reason,
            "weight":       WEIGHTS["events"],
            "events_found": [i["description"] for i in incidents[:5]],
            "incident_count": len(incidents),
        }

    except Exception as e:
        logger.error(f"Event scoring failed: {e}")
        return {"score": 0, "reason": "Incident analysis unavailable", "weight": WEIGHTS["events"], "events_found": []}

# time buffer

def _compute_time_buffer_score(created_at: datetime, eta_seconds: Optional[int]) -> dict:
    if not eta_seconds or eta_seconds <= 0:
        return {"score": 30, "reason": "ETA not available", "weight": WEIGHTS["time_buffer"]}

    now = datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    elapsed       = (now - created_at).total_seconds()
    ratio         = elapsed / eta_seconds
    score         = _threshold(ratio, TIME_BUFFER_THRESHOLDS)
    eta_hours     = round(eta_seconds / 3600, 1)
    elapsed_hours = round(elapsed / 3600, 1)

    if ratio < 0.25:    desc = "Just started"
    elif ratio < 0.5:   desc = "Early in journey"
    elif ratio < 0.75:  desc = "Mid journey"
    elif ratio < 1.0:   desc = "Approaching destination"
    else:               desc = "Overdue"

    return {
        "score":  score,
        "reason": f"{desc} — {elapsed_hours}h elapsed of {eta_hours}h ETA",
        "weight": WEIGHTS["time_buffer"],
    }


# historycal data, pathetical value but still has some wetightage , i like it tbh

def _compute_historical_score() -> dict:
    return {"score": 0, "reason": "No historical data", "weight": WEIGHTS["historical"]}


#main masalaa , with protin tube with white soas
async def calculate_risk(shipment: dict) -> dict:
    origin_coords    = shipment.get("origin_coords", {})
    dest_coords      = shipment.get("destination_coords", {})
    current_location = shipment.get("current_location") or origin_coords
    waypoints        = shipment.get("route_waypoints", [])
    origin_name      = shipment.get("origin_name", "origin")
    dest_name        = shipment.get("destination_name", "destination")
    eta_seconds      = shipment.get("expected_travel_seconds")
    distance_km      = shipment.get("distance_km", 0)
    created_at       = shipment.get("created_at", datetime.now(timezone.utc))

    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)

    # gemini cache checking
    last_assessment  = shipment.get("last_risk_assessment") or {}
    cached_events    = (last_assessment.get("breakdown") or {}).get("events")
    skip_gemini      = shipment.get("_skip_gemini", False)

    logger.info(f"Calculating risk for shipment with {len(waypoints)} waypoints")

    import asyncio
    weather_data, traffic_data, event_data = await asyncio.gather(
        _compute_weather_score(waypoints, current_location, origin_coords, eta_seconds, distance_km),
        _compute_traffic_score(current_location, dest_coords),
        _compute_event_score(waypoints),
    )

    time_buffer_data = _compute_time_buffer_score(created_at, eta_seconds)
    historical_data  = _compute_historical_score()

    breakdown = {
        "weather":     weather_data,
        "traffic":     traffic_data,
        "time_buffer": time_buffer_data,
        "events":      event_data,
        "historical":  historical_data,
    }

    final_score    = round(sum(d["score"] * d["weight"] for d in breakdown.values()), 2)
    risk_level     = _risk_level(final_score)
    primary_driver = max(breakdown, key=lambda k: breakdown[k]["score"] * breakdown[k]["weight"])

    logger.info(f"Risk: {final_score} | {risk_level} | driver={primary_driver}")

    return {
        "final_score":    final_score,
        "risk_level":     risk_level,
        "primary_driver": primary_driver,
        "breakdown":      breakdown,
        "computed_at":    datetime.now(timezone.utc),
    }