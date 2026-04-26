# services/ors_service.py
# Calls OpenRouteService to get a route between two coordinates.
# Extracts waypoints every 50km from the route geometry for accurate
# weather sampling along the full path.

import httpx
import math
import os
import logging
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

ORS_API_KEY = os.getenv("ORS_API_KEY")
ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
WAYPOINT_INTERVAL_KM = 50


# Haversine distance formula
def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    """Straight-line distance in km between two coordinates."""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# Extract one waypoint coordinate every 50km along the route
def _extract_waypoints_every_50km(coordinates: list) -> list[dict]:

    if not coordinates:
        return []

    waypoints = []
    accumulated_km = 0.0
    prev = coordinates[0]


    waypoints.append({"lat": prev[1], "lng": prev[0]})

    for coord in coordinates[1:]:
        segment_km = _haversine_km(prev[1], prev[0], coord[1], coord[0])
        accumulated_km += segment_km

        if accumulated_km >= WAYPOINT_INTERVAL_KM:
            waypoints.append({"lat": coord[1], "lng": coord[0]})
            accumulated_km = 0.0

        prev = coord

    # Always include destination if not already added
    last = coordinates[-1]
    last_dict = {"lat": last[1], "lng": last[0]}
    if waypoints[-1] != last_dict:
        waypoints.append(last_dict)

    return waypoints


# Main function

async def get_route(
    origin_coords: dict,
    dest_coords: dict,
    alternatives: bool = False,
) -> dict:
    """


    Get route from ORS between two coordinate dicts {"lat", "lng"}.

    Returns:
    {
        "waypoints":               list of {"lat", "lng"} every 50km,
        "distance_km":             float,
        "duration_seconds":        int,
        "alternatives":            list of alternative route dicts (if requested)
    }

    Raises RuntimeError on API failure.
    """
    if not ORS_API_KEY:
        raise RuntimeError("ORS_API_KEY not set in .env")

    body = {
        "coordinates": [
            [origin_coords["lng"], origin_coords["lat"]],   # ORS uses [lng, lat]
            [dest_coords["lng"],   dest_coords["lat"]],
        ],
        "instructions": False,
        "geometry_simplify": False,   # full geometry for accurate sampling
    }

    if alternatives:
        body["alternative_routes"] = {
            "target_count": 3,
            "weight_factor": 1.6,
            "share_factor": 0.6,
        }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                ORS_URL,
                json=body,
                headers={
                    "Authorization": ORS_API_KEY,
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

    except httpx.TimeoutException:
        raise RuntimeError("ORS API timed out")
    except httpx.HTTPError as e:
        logger.error(f"ORS HTTP error: {e}")
        raise RuntimeError(f"ORS API error: {e}")

    features = data.get("features", [])
    if not features:
        raise RuntimeError("ORS returned no routes")

    # ── Primary route ──────────────────────────────────────────────────────────
    primary     = features[0]
    coordinates = primary["geometry"]["coordinates"]
    summary     = primary["properties"]["summary"]

    result = {
        "waypoints":        _extract_waypoints_every_50km(coordinates),
        "distance_km":      round(summary["distance"] / 1000, 2),
        "duration_seconds": int(summary["duration"]),
        "alternatives":     [],
        "eta_hours": round(int(summary["duration"]) / 3600, 2),  # converting the seconds in hours of ETA
    }

    # alternative coordi/path waypoints
    for feature in features[1:]:
        alt_coords  = feature["geometry"]["coordinates"]
        alt_summary = feature["properties"]["summary"]
        result["alternatives"].append({
            "waypoints":        _extract_waypoints_every_50km(alt_coords),
            "distance_km":      round(alt_summary["distance"] / 1000, 2),
            "duration_seconds": int(alt_summary["duration"]),
            "eta_hours": round(int(summary["duration"]) / 3600, 2),  # converting the seconds in hours of ETA
        })

    logger.info(
        f"Route computed: {result['distance_km']}km, "
        f"{result['duration_seconds']//3600}h {(result['duration_seconds']%3600)//60}m, "
        f"{len(result['waypoints'])} waypoints"
    )
    return result


# ── Self test ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import asyncio

    async def test():
        # Mumbai to Delhi
        origin = {"lat": 19.0760, "lng": 72.8777}
        dest   = {"lat": 28.6139, "lng": 77.2090}

        print("Fetching route Mumbai to Delhi...")
        route = await get_route(origin, dest)

        print(f"\nDistance        : {route['distance_km']} km")
        print(f"Duration        : {route['duration_seconds'] // 3600}h "
              f"{(route['duration_seconds'] % 3600) // 60}m")
        print(f"Waypoints (50km): {len(route['waypoints'])}")
        print("\nWaypoints:")
        for i, wp in enumerate(route['waypoints']):
            print(f"  {i+1:2}. lat={wp['lat']:.4f}, lng={wp['lng']:.4f}")

    asyncio.run(test())