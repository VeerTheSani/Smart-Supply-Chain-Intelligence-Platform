# routers/risk_engine.py
# Central risk calculation engine.
# Computes a weighted risk score from 5 factors:
#   weather, traffic, events, time_buffer, historical
# Returns structured breakdown with per-factor contribution.

import logging
import math
from datetime import datetime, timezone
from typing import Optional

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
        return {
            "score": result["score"], 
            "reason": result["reason"], 
            "weight": WEIGHTS["weather"],
            "point_results": result.get("point_results", [])
        }
    except Exception as e:
        logger.error(f"Weather scoring failed: {e}")
        return {"score": 50, "reason": "Weather data unavailable", "weight": WEIGHTS["weather"], "point_results": []}


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


# Incident type → risk contribution points
INCIDENT_SCORE_MAP = {
    "ROAD_CLOSED":          30,
    "ACCIDENT":             20,
    "FLOODING":             18,
    "DANGEROUS_CONDITIONS": 12,
    "ROAD_WORKS":           12,
    "HAZARD":               10,
    "JAM":                  10,
    "BROKEN_DOWN_VEHICLE":   8,
    "HIGH_WINDS":            8,
    "RAIN":                  6,
    "ROAD_HAZARD":           5,
}

# magnitude 0-3 → multiplier
MAGNITUDE_MULT = {0: 0.5, 1: 0.6, 2: 1.0, 3: 1.5}


def _compute_event_score(stored_incidents: list[dict]) -> dict:
    """
    Score road incidents using the list already stored in MongoDB
    (route_incidents field, refreshed by the scheduler every 5 min).
    No TomTom API call — reads from what the incident service cached.
    """
    if not stored_incidents:
        return {
            "score": 0, "reason": "No incidents on route",
            "weight": WEIGHTS["events"], "events_found": [], "incident_count": 0,
        }

    total = 0.0
    for inc in stored_incidents:
        base = INCIDENT_SCORE_MAP.get(inc.get("type", ""), 5)
        mult = MAGNITUDE_MULT.get(inc.get("severity", 0), 1.0)
        total += base * mult

    score  = min(round(total), 100)
    reason = stored_incidents[0]["description"] if stored_incidents else "No incidents on route"

    return {
        "score":          score,
        "reason":         reason,
        "weight":         WEIGHTS["events"],
        "events_found":   [i["description"] for i in stored_incidents[:5]],
        "incident_count": len(stored_incidents),
    }

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
    eta_seconds      = shipment.get("expected_travel_seconds")
    distance_km      = shipment.get("distance_km", 0)
    created_at       = shipment.get("created_at", datetime.now(timezone.utc))

    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)

    stored_incidents = shipment.get("route_incidents", [])

    logger.info(f"Calculating risk for shipment with {len(waypoints)} waypoints, {len(stored_incidents)} stored incidents")

    import asyncio
    weather_data, traffic_data = await asyncio.gather(
        _compute_weather_score(waypoints, current_location, origin_coords, eta_seconds, distance_km),
        _compute_traffic_score(current_location, dest_coords),
    )
    event_data = _compute_event_score(stored_incidents)

    time_buffer_data = _compute_time_buffer_score(created_at, eta_seconds)
    historical_data  = _compute_historical_score()

    # Apply simulation overrides if present
    simulated_scenario = shipment.get("_simulated_scenario")
    simulated_severity = shipment.get("_simulated_severity", "medium")
    
    if simulated_scenario == "storm":
        score = 90 if simulated_severity == "high" else 70 if simulated_severity == "medium" else 50
        weather_data = {"score": score, "reason": "Simulated Storm", "weight": WEIGHTS["weather"]}
    elif simulated_scenario == "traffic":
        score = 85 if simulated_severity == "high" else 65 if simulated_severity == "medium" else 45
        traffic_data = {"score": score, "reason": "Simulated Traffic", "weight": WEIGHTS["traffic"]}
    elif simulated_scenario == "blockage":
        score = 95 if simulated_severity == "high" else 75 if simulated_severity == "medium" else 55
        event_data = {"score": score, "reason": "Simulated Blockage", "weight": WEIGHTS["events"]}

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
    
    # Build enriched breakdown with contribution values
    enriched_breakdown = {}
    for factor_name, factor_data in breakdown.items():
        contribution = round(factor_data["score"] * factor_data["weight"], 2)
        enriched_breakdown[factor_name] = {
            **factor_data,
            "contribution": contribution,
        }

    logger.info(f"Risk: {final_score} | {risk_level} | driver={primary_driver}")

    return {
        "final_score":    final_score,
        "risk_level":     risk_level,
        "primary_driver": primary_driver,
        "breakdown":      enriched_breakdown,
        "computed_at":    datetime.now(timezone.utc),
    }