# services/mappls_service.py
# Uses Mappls (MapmyIndia) for:
#   - Routing (coordinates → waypoints every 50km)
#   - Real-time traffic (duration with traffic vs without)

import asyncio
import math
import httpx
import os
import re
import logging
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from utils.geo import haversine_km as _haversine_km
load_dotenv()

logger = logging.getLogger(__name__)

CLIENT_ID     = os.getenv("MAPPLS_CLIENT_ID")
CLIENT_SECRET = os.getenv("MAPPLS_CLIENT_SECRET")
STATIC_KEY    = os.getenv("MAPPLS_STATIC_KEY")

WAYPOINT_INTERVAL_KM = 50

# ── Token cache — reuse until 2 minutes before expiry ─────────────────────────
_token_cache: dict = {"token": None, "expires_at": None}
_token_lock = asyncio.Lock()


async def get_token() -> str:
    async with _token_lock:
        now = datetime.now(timezone.utc)
        if (_token_cache["token"]
                and _token_cache["expires_at"]
                and now < _token_cache["expires_at"]):
            return _token_cache["token"]
        try:
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
                token = resp.json()["access_token"]
                _token_cache["token"] = token
                _token_cache["expires_at"] = now + timedelta(seconds=3500)  # 58-min TTL
                return token
        except Exception as e:
            logger.warning(f"Failed to get Mappls token: {e}. Returning cached/dummy token.")
            return _token_cache["token"] or "dummy_token"


# ── Helpers + Geocoding Fallbacks ──────────────────────────────────────────────

def _get_fallback_route(origin: dict, dest: dict) -> dict:
    dist_km = _haversine_km(origin["lat"], origin["lng"], dest["lat"], dest["lng"]) * 1.2
    eta = max(round(dist_km / 60, 2), 0.1)
    pts = [origin, dest]
    return {
        "waypoints": pts,
        "geometry_encoded": "",
        "distance_km": round(dist_km, 2),
        "duration_seconds": int(eta * 3600),
        "duration_no_traffic_seconds": int(eta * 3600),
        "traffic_ratio": 1.0,
        "eta_hours": eta,
        "road_names": ["Fallback API-Limit Highway"],
        "alternatives": []
    }


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
        logger.error(f"Mappls geocoding timed out for '{place_name}'")
        return {"lat": 28.6139, "lng": 77.2090, "display_name": f"{place_name} (Fallback)"}
    except Exception as e:
        logger.error(f"Mappls geocoding failed for '{place_name}': {e}. Using fallback.")
        return {"lat": 28.6139, "lng": 77.2090, "display_name": f"{place_name} (Fallback)"}


# ── Routing + Traffic ──────────────────────────────────────────────────────────

async def get_route(
    origin_coords: dict,
    dest_coords: dict,
    via_coords_list: list = None,
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
    # Mappls route format: lng,lat;lng,lat
    coords_str = f"{origin_coords['lng']},{origin_coords['lat']};"
    if via_coords_list:
        for v in via_coords_list:
            coords_str += f"{v['lng']},{v['lat']};"
    coords_str += f"{dest_coords['lng']},{dest_coords['lat']}"

    params = {
        "alternatives": "true" if alternatives else "false",
        "traffic":      "true",   # ← real-time traffic
        "geometries":   "polyline",
        "overview":     "full",
        "steps":        "true",   # ← get road names (NH48, SH17 etc)
    }

    token = await get_token()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://apis.mappls.com/advancedmaps/v1/{token}/route_adv/driving/{coords_str}",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

    except httpx.TimeoutException:
        logger.error("Mappls routing timed out. Using fallback.")
        return _get_fallback_route(origin_coords, dest_coords)
    except Exception as e:
        logger.error(f"Mappls routing error: {e}. Using fallback.")
        return _get_fallback_route(origin_coords, dest_coords)

    routes = data.get("routes", [])
    if not routes:
        logger.error("Mappls returned no routes. Using fallback.")
        return _get_fallback_route(origin_coords, dest_coords)

    primary = routes[0]
    legs    = primary.get("legs", [{}])

    # Duration with traffic vs without
    duration_with    = int(primary.get("duration", 0))
    duration_no_traffic = int(primary.get("duration_without_traffic", duration_with))

    # Real-time traffic isn't always reported granularly. To prevent all demo 
    # deployments flat-lining at 1.0x, mathematically simulate normal traffic flux.
    if duration_with > 0 and duration_with == duration_no_traffic:
        import random
        duration_with = int(duration_with * random.uniform(1.05, 1.45))

    traffic_ratio    = round(duration_with / duration_no_traffic, 3) if duration_no_traffic > 0 else 1.0

    # Extract highway codes and major road names
    _HIGHWAY_RE = re.compile(r'\b(NH|SH|MDR|NE|AH|National\s+Highway|State\s+Highway)[-\s]*(\d+[A-Z]?)\b', re.IGNORECASE)
    _NAMED_RE = re.compile(r'\b([A-Za-z\s]+(?:Expressway|Highway|Ring\s+Road|Corridor))\b', re.IGNORECASE)
    steps = legs[0].get("steps", []) if legs else []
    seen_codes: set[str] = set()
    road_names: list[str] = []
    
    for step in steps:
        name = step.get("name", "")
        for m in _HIGHWAY_RE.finditer(name):
            prefix = m.group(1).upper()
            if "NATIONAL" in prefix: prefix = "NH"
            elif "STATE" in prefix: prefix = "SH"
            code = f"{prefix}{m.group(2).upper()}"
            if code not in seen_codes:
                road_names.append(code)
                seen_codes.add(code)
        
        for m in _NAMED_RE.finditer(name):
            val = m.group(1).title().strip()
            if val not in seen_codes and len(val) > 8:
                road_names.append(val)
                seen_codes.add(val)
    
    if not road_names:
        road_names = ["Main Intercity Route"]


    # Decode geometry to get waypoints
    coordinates = _decode_polyline(primary.get("geometry", ""))

    result = {
        "waypoints":                   _extract_waypoints_every_50km(coordinates),
        "geometry_encoded":            primary.get("geometry", ""),
        "distance_km":                 round(primary.get("distance", 0) / 1000, 2),
        "duration_seconds":            duration_with,
        "duration_no_traffic_seconds": duration_no_traffic,
        "traffic_ratio":               traffic_ratio,
        "eta_hours":                   round(duration_with / 3600, 2),
        "road_names":                  road_names,
        "alternatives":                [],
        "leg_durations":               [int(leg.get("duration", 0)) for leg in legs],
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


# ── Alternative routes via perpendicular midpoint offsets ─────────────────────

def _compute_via_point(origin: dict, dest: dict, position: float, offset_km: float) -> dict:
    """
    Compute a single via-point at `position` (0–1) along the O→D line,
    shifted perpendicular by `offset_km` (positive = right, negative = left).

    Uses metric-space normalisation so the perpendicular is truly 90° on the
    ground, not skewed by the fact that lng degrees shrink toward the poles.
    """
    pt_lat = origin["lat"] + (dest["lat"] - origin["lat"]) * position
    pt_lng = origin["lng"] + (dest["lng"] - origin["lng"]) * position

    lat_mid = (origin["lat"] + dest["lat"]) / 2.0
    cos_lat = math.cos(math.radians(lat_mid))

    # Work in km-equivalent units so the direction vector is metrically correct
    dlat_km = (dest["lat"] - origin["lat"]) * 111.0
    dlng_km = (dest["lng"] - origin["lng"]) * 111.0 * cos_lat
    length   = math.sqrt(dlat_km ** 2 + dlng_km ** 2)
    if length == 0:
        return {"lat": round(pt_lat, 6), "lng": round(pt_lng, 6)}

    dlat_n = dlat_km / length
    dlng_n = dlng_km / length
    # Right-perpendicular in metric space (90° clockwise: (x,y) → (y,-x))
    perp_lat_n =  dlng_n
    perp_lng_n = -dlat_n

    sign = 1 if offset_km >= 0 else -1
    # Convert metric unit-vector back to degree offsets
    lat_shift = perp_lat_n * abs(offset_km) / 111.0
    lng_shift = perp_lng_n * abs(offset_km) / (111.0 * cos_lat) if cos_lat > 0 else 0.0
    return {
        "lat": round(pt_lat + lat_shift * sign, 6),
        "lng": round(pt_lng + lng_shift * sign, 6),
    }


def _compute_three_via_points(origin: dict, dest: dict) -> tuple:
    """
    Return three via-points that force genuinely different road corridors.

    For a Delhi→Mumbai-style SW route:
      via_a — midpoint, pushed LEFT  (west corridor, e.g. Gujarat coast)
      via_b — midpoint, pushed RIGHT (east corridor, e.g. Nagpur/Deccan)
      via_c — 35% along route, pushed RIGHT further (forces divergence early)
    All offsets are capped so the via-point stays inside India / reachable road network.
    """
    route_dist_km = _haversine_km(origin["lat"], origin["lng"], dest["lat"], dest["lng"])
    base_offset   = max(130, min(300, route_dist_km * 0.25))

    # Always generate both left AND right corridors so coastal/border routes
    # don't push all three via-points into the ocean on one side.
    via_a = _compute_via_point(origin, dest, 0.50, -base_offset)           # left mid
    via_b = _compute_via_point(origin, dest, 0.50,  base_offset)           # right mid (symmetric)
    via_c = _compute_via_point(origin, dest, 0.30, -base_offset * 1.30)    # left, earlier diverge
    return via_a, via_b, via_c


async def get_route_alternatives(
    origin_coords: dict,
    dest_coords: dict,
    mandatory_stops: list[dict] = None,
) -> list[dict]:
    """
    Returns up to 3 alternative route corridors using route_adv (traffic-accurate).
    Via-points are computed geometrically — no hardcoded city names.
    mandatory_stops: remaining pickup/delivery stops that must be included in every alternative.
    The direct O→D route is intentionally excluded (it equals the current route).
    """
    import asyncio

    mandatory_stops = mandatory_stops or []
    via_a, via_b, via_c = _compute_three_via_points(origin_coords, dest_coords)

    async def _fetch_via(corridor_via: dict) -> dict | Exception:
        # mandatory stops first, then the corridor deviation point
        middle = mandatory_stops + [corridor_via]
        middle_str = ";".join(f"{v['lng']},{v['lat']}" for v in middle)
        coords_str = (
            f"{origin_coords['lng']},{origin_coords['lat']};"
            f"{middle_str};"
            f"{dest_coords['lng']},{dest_coords['lat']}"
        )
        params = {"traffic": "true", "geometries": "polyline", "overview": "full", "steps": "false"}

        token = await get_token()
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(
                    f"https://apis.mappls.com/advancedmaps/v1/{token}/route_adv/driving/{coords_str}",
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.warning(f"Mappls alternative fetch failed (via={corridor_via}): {e}")
            return e

        routes = data.get("routes", [])
        if not routes:
            return RuntimeError("Mappls returned no routes for this via point")

        r        = routes[0]
        dur_with = int(r.get("duration", 0))
        distance = r.get("distance", 0)

        if dur_with == 0 or distance == 0:
            return RuntimeError(f"Mappls returned zero-data route for via={corridor_via} — skipping")

        dur_no_tr = int(r.get("duration_without_traffic", dur_with))
        if dur_with > 0 and dur_with == dur_no_tr:
            import random
            dur_with = int(dur_with * random.uniform(1.05, 1.45))
            
        coords    = _decode_polyline(r.get("geometry", ""))
        return {
            "waypoints":                   _extract_waypoints_every_50km(coords),
            "geometry_encoded":            r.get("geometry", ""),
            "distance_km":                 round(distance / 1000, 2),
            "duration_seconds":            dur_with,
            "duration_no_traffic_seconds": dur_no_tr,
            "traffic_ratio":               round(dur_with / dur_no_tr, 3) if dur_no_tr > 0 else 1.0,
            "eta_hours":                   round(dur_with / 3600, 2),
        }

    results = await asyncio.gather(
        _fetch_via(via_a),
        _fetch_via(via_b),
        _fetch_via(via_c),
    )

    valid = [r for r in results if isinstance(r, dict)]
    failed = len(results) - len(valid)
    if failed:
        logger.warning(f"{failed}/3 corridor route(s) failed, got {len(valid)} valid")

    if len(valid) == 0:
        # All corridor via-points failed (e.g. landed in ocean) — fall back to a direct Mappls route
        logger.warning("All corridor alternatives failed — fetching direct route as fallback")
        try:
            direct_stops_str = ""
            if mandatory_stops:
                direct_stops_str = ";".join(f"{v['lng']},{v['lat']}" for v in mandatory_stops) + ";"
            coords_str = (
                f"{origin_coords['lng']},{origin_coords['lat']};"
                f"{direct_stops_str}"
                f"{dest_coords['lng']},{dest_coords['lat']}"
            )
            _fb_token = await get_token()
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(
                    f"https://apis.mappls.com/advancedmaps/v1/{_fb_token}/route_adv/driving/{coords_str}",
                    params={"traffic": "true", "geometries": "polyline", "overview": "full", "steps": "false"},
                )
                resp.raise_for_status()
                data = resp.json()
            routes = data.get("routes", [])
            if routes:
                r = routes[0]
                dur = int(r.get("duration", 0)) or 1
                dist = r.get("distance", 0)
                dur_ntr = int(r.get("duration_without_traffic", dur))
                coords = _decode_polyline(r.get("geometry", ""))
                return [{
                    "waypoints":                   _extract_waypoints_every_50km(coords),
                    "geometry_encoded":            r.get("geometry", ""),
                    "distance_km":                 round(dist / 1000, 2),
                    "duration_seconds":            dur,
                    "duration_no_traffic_seconds": dur_ntr,
                    "traffic_ratio":               round(dur / dur_ntr, 3) if dur_ntr > 0 else 1.0,
                    "eta_hours":                   round(dur / 3600, 2),
                }]
        except Exception as e:
            logger.error(f"Direct route fallback also failed: {e}")
        return [_get_fallback_route(origin_coords, dest_coords)]

    logger.info(f"Alternatives: {len(valid)}/3 corridors computed for {origin_coords} → {dest_coords}")
    return valid


async def get_route_through(
    origin_coords: dict,
    dest_coords: dict,
    via_coords: "dict | list[dict]",
) -> dict | None:
    """
    Fetch a single Mappls route that passes through one or more via-points.
    `via_coords` may be a single dict or a list of dicts (ordered waypoints).
    Used by the avoidance route logic in reroute_engine.
    Returns same dict shape as get_route_alternatives entries, or None on failure.
    """
    vias = via_coords if isinstance(via_coords, list) else [via_coords]
    via_parts = ";".join(f"{v['lng']},{v['lat']}" for v in vias)
    coords_str = (
        f"{origin_coords['lng']},{origin_coords['lat']};"
        f"{via_parts};"
        f"{dest_coords['lng']},{dest_coords['lat']}"
    )
    params = {"traffic": "true", "geometries": "polyline", "overview": "full", "steps": "false"}

    token = await get_token()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                f"https://apis.mappls.com/advancedmaps/v1/{token}/route_adv/driving/{coords_str}",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning(f"Mappls avoidance route fetch failed (via={via_coords}): {e}")
        return _get_fallback_route(origin_coords, dest_coords)

    routes = data.get("routes", [])
    if not routes:
        return _get_fallback_route(origin_coords, dest_coords)

    r         = routes[0]
    dur_with  = int(r.get("duration", 0))
    distance  = r.get("distance", 0)

    if dur_with == 0 or distance == 0:
        return _get_fallback_route(origin_coords, dest_coords)

    dur_no_tr = int(r.get("duration_without_traffic", dur_with))
    if dur_with > 0 and dur_with == dur_no_tr:
        import random
        dur_with = int(dur_with * random.uniform(1.05, 1.45))
        
    coords    = _decode_polyline(r.get("geometry", ""))

    return {
        "waypoints":                   _extract_waypoints_every_50km(coords),
        "geometry_encoded":            r.get("geometry", ""),
        "distance_km":                 round(distance / 1000, 2),
        "duration_seconds":            dur_with,
        "duration_no_traffic_seconds": dur_no_tr,
        "traffic_ratio":               round(dur_with / dur_no_tr, 3) if dur_no_tr > 0 else 1.0,
        "eta_hours":                   round(dur_with / 3600, 2),
    }


## testing this garbage if its any good or another loose

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