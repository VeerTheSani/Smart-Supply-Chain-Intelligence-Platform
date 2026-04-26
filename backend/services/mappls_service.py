# services/mappls_service.py
# Replaces both geocoding_service.py and ors_service.py
# Uses Mappls (MapmyIndia) for:
#   - Geocoding (place name → coordinates)
#   - Routing (coordinates → waypoints every 50km)
#   - Real-time traffic (duration with traffic vs without)

import httpx
import math
import os
import logging
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

CLIENT_ID     = os.getenv("MAPPLS_CLIENT_ID")
CLIENT_SECRET = os.getenv("MAPPLS_CLIENT_SECRET")

WAYPOINT_INTERVAL_KM = 50

# ── Token ──────────────────────────────────────────────────────────────────────

async def get_token() -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://outpost.mappls.com/api/security/oauth/token",
            data={
                "grant_type":    "client_credentials",
                "client_id":     CLIENT_ID,
                "client_secret": CLIENT_SECRET,
            }
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


# ── Haversine + waypoint extraction (same logic as ors_service) ───────────────

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


def _extract_waypoints_every_50km(coordinates: list) -> list[dict]:
    """
    Pick one coordinate every 50km of accumulated distance.
    coordinates: list of [lng, lat] from Mappls geometry
    Always includes first and last point.
    """
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

    last = coordinates[-1]
    last_dict = {"lat": last[1], "lng": last[0]}
    if waypoints[-1] != last_dict:
        waypoints.append(last_dict)

    return waypoints


# ── Geocoding ──────────────────────────────────────────────────────────────────

async def geocode(place_name: str) -> dict:
    """
    Convert a place name to coordinates using Mappls geocoding API.
    Returns {"lat": float, "lng": float, "display_name": str}
    """
    token = await get_token()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://atlas.mappls.com/api/places/geocode",
                params={"address": place_name},
                headers={"Authorization": f"Bearer {token}"}
            )
            resp.raise_for_status()
            data = resp.json()

        # Mappls returns copResults array
        results = data.get("copResults", [])
        if not results:
            raise ValueError(f"Could not geocode '{place_name}' — place not found")

        top = results[0]
        return {
            "lat":          float(top["latitude"]),
            "lng":          float(top["longitude"]),
            "display_name": top.get("formattedAddress", place_name),
        }

    except ValueError:
        raise
    except httpx.TimeoutException:
        raise RuntimeError(f"Mappls geocoding timed out for '{place_name}'")
    except httpx.HTTPError as e:
        logger.error(f"Mappls geocoding error for '{place_name}': {e}")
        raise RuntimeError(f"Mappls geocoding failed for '{place_name}'")


# ── Routing + Traffic ──────────────────────────────────────────────────────────

async def get_route(
    origin_coords: dict,
    dest_coords: dict,
    alternatives: bool = False,
) -> dict:
    """
    Get route from Mappls with real-time traffic data.

    Returns:
    {
        "waypoints":                  list of {"lat", "lng"} every 50km,
        "distance_km":                float,
        "duration_seconds":           int,   ← with traffic
        "duration_no_traffic_seconds": int,  ← free flow
        "traffic_ratio":              float, ← duration / free_flow (use for risk scoring)
        "eta_hours":                  float,
        "alternatives":               list
    }
    """
    token = await get_token()

    # Mappls route format: lng,lat;lng,lat
    coords_str = (
        f"{origin_coords['lng']},{origin_coords['lat']};"
        f"{dest_coords['lng']},{dest_coords['lat']}"
    )

    params = {
        "alternatives": "true" if alternatives else "false",
        "traffic":      "true",   # ← real-time traffic
        "geometries":   "polyline",
        "overview":     "full",
        "steps":        "true",   # ← get road names (NH48, SH17 etc)
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://apis.mappls.com/advancedmaps/v1/{token}/route_adv/driving/{coords_str}",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

    except httpx.TimeoutException:
        raise RuntimeError("Mappls routing timed out")
    except httpx.HTTPError as e:
        logger.error(f"Mappls routing error: {e} | response: {e.response.text if hasattr(e, 'response') else ''}")
        raise RuntimeError(f"Mappls routing failed: {e}")

    routes = data.get("routes", [])
    if not routes:
        raise RuntimeError("Mappls returned no routes")

    primary = routes[0]
    legs    = primary.get("legs", [{}])

    # Duration with traffic vs without
    duration_with    = int(primary.get("duration", 0))
    duration_no_traffic = int(primary.get("duration_without_traffic", duration_with))
    traffic_ratio    = round(duration_with / duration_no_traffic, 3) if duration_no_traffic > 0 else 1.0

    # Extract road names from steps (NH48, SH17 etc)
    steps = legs[0].get("steps", []) if legs else []
    road_names = list(dict.fromkeys([
        step.get("name", "").strip()
        for step in steps
        if step.get("name", "").strip()
        and any(x in step.get("name", "") for x in ["NH", "SH", "MDR", "Highway", "Expressway", ])
    ]))

    # Decode geometry to get waypoints
    coordinates = _decode_polyline(primary.get("geometry", ""))

    result = {
        "waypoints":                   _extract_waypoints_every_50km(coordinates),
        "distance_km":                 round(primary.get("distance", 0) / 1000, 2),
        "duration_seconds":            duration_with,
        "duration_no_traffic_seconds": duration_no_traffic,
        "traffic_ratio":               traffic_ratio,
        "eta_hours":                   round(duration_with / 3600, 2),
        "road_names":                  road_names,
        "alternatives":                [],
    }

    # Alternative routes
    for route in routes[1:]:
        alt_legs    = route.get("legs", [{}])
        alt_dur     = int(route.get("duration", 0))
        alt_dur_ntr = int(route.get("duration_without_traffic", alt_dur))
        alt_coords  = _decode_polyline(route.get("geometry", ""))
        result["alternatives"].append({
            "waypoints":                   _extract_waypoints_every_50km(alt_coords),
            "distance_km":                 round(route.get("distance", 0) / 1000, 2),
            "duration_seconds":            alt_dur,
            "duration_no_traffic_seconds": alt_dur_ntr,
            "traffic_ratio":               round(alt_dur / alt_dur_ntr, 3) if alt_dur_ntr > 0 else 1.0,
            "eta_hours":                   round(alt_dur / 3600, 2),
        })

    logger.info(
        f"Route: {result['distance_km']}km | "
        f"ETA: {result['eta_hours']}h | "
        f"Traffic ratio: {traffic_ratio} | "
        f"Waypoints: {len(result['waypoints'])}"
    )
    return result


# ── Polyline decoder ───────────────────────────────────────────────────────────

def _decode_polyline(encoded: str) -> list:
    """
    Decode a Google-style encoded polyline to list of [lng, lat].
    Mappls uses the same encoding as Google Maps.
    """
    coords = []
    index = 0
    lat = 0
    lng = 0

    while index < len(encoded):
        # decode latitude
        shift, result = 0, 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        d_lat = ~(result >> 1) if result & 1 else result >> 1
        lat += d_lat

        # decode longitude
        shift, result = 0, 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        d_lng = ~(result >> 1) if result & 1 else result >> 1
        lng += d_lng

        coords.append([lng / 1e5, lat / 1e5])   # [lng, lat] to match ORS format

    return coords


# ── Self test ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio

    async def test():
        print("=== Routing (Surat → Kalol) ===")
        origin = {"lat": 21.1702, "lng": 72.8311}
        dest   = {"lat": 23.2452, "lng": 72.4966}

        route = await get_route(origin, dest)

        print(f"Distance      : {route['distance_km']} km")
        print(f"ETA           : {route['eta_hours']} hours")
        print(f"Traffic ratio : {route['traffic_ratio']}x")
        print(f"Road names    : {route['road_names']}")
        print(f"Waypoints     : {len(route['waypoints'])}")

    asyncio.run(test())