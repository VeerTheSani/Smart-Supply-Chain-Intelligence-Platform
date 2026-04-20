# routers/incidents.py
#
# GET /api/shipments/{id}/incidents
#
# WHY THIS EXISTS:
#   The frontend map shows a route line but nothing about what's happening
#   ON that road right now — accidents, roadblocks, constructions.
#   This endpoint fetches live incidents from Mappls and filters them to
#   only the ones physically close to the shipment's actual route.
#
# HOW IT WORKS:
#   1. Load the shipment's route_waypoints from MongoDB
#      (these are the ~50km-spaced points we stored when creating the shipment)
#
#   2. Build a bounding box that covers the whole route
#      (min/max lat + lng from all waypoints, with a small padding)
#      This is what we send to Mappls — "give me all incidents in this rectangle"
#
#   3. Call the Mappls Traffic Incidents API with that bounding box
#      Mappls returns everything in the rectangle — could include stuff
#      far from the actual road (parallel highway, nearby city etc)
#
#   4. Filter: keep only incidents within CORRIDOR_KM (5km) of any waypoint
#      This ensures we only show incidents that are actually ON our route,
#      not random accidents 30km away in the same bounding box
#
#   5. Return clean list: [{lat, lng, type, severity, description}]
#      Frontend drops warning markers at each one
#
# WHY NOT STORE IN MONGODB:
#   Incidents change every few minutes — a cleared accident should disappear
#   from the map immediately. Storing would mean stale data.
#   Fresh API call every time = always accurate.
import os
from dotenv import load_dotenv
load_dotenv()

TOMTOM_KEY = os.getenv("TOMTOM_KEY")
import logging
import math

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException

from database import db
import httpx

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/shipments", tags=["incidents"])

# How close an incident must be to a waypoint to count as "on our route"
# 5km catches incidents on the same road without picking up parallel highways
CORRIDOR_KM = 5.0

# Small padding added to bounding box so incidents right at route edges aren't missed
BBOX_PADDING = 0.5  # degrees (~55km) — intentionally generous, corridor filter tightens it


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    """
    Straight-line distance in km between two lat/lng points.
    Used to check if an incident is close enough to a waypoint.
    """
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _build_bbox(waypoints: list[dict]) -> tuple[float, float, float, float]:
    """
    Calculate bounding box (rectangle) that covers all waypoints.
    Returns (lng_min, lat_min, lng_max, lat_max) — Mappls expects lng first.
    Adds BBOX_PADDING on all sides so edge incidents aren't missed.
    """
    lats = [wp["lat"] for wp in waypoints]
    lngs = [wp["lng"] for wp in waypoints]

    return (
        min(lngs) - BBOX_PADDING,  # lng_min (west)
        min(lats) - BBOX_PADDING,  # lat_min (south)
        max(lngs) + BBOX_PADDING,  # lng_max (east)
        max(lats) + BBOX_PADDING,  # lat_max (north)
    )


def _is_on_route(incident_lat: float, incident_lng: float, waypoints: list[dict]) -> bool:
    """
    Check if an incident is within CORRIDOR_KM of ANY waypoint on the route.
    If yes it's on our road. If no it's somewhere else in the bbox, ignore it.
    """
    for wp in waypoints:
        dist = _haversine_km(incident_lat, incident_lng, wp["lat"], wp["lng"])
        if dist <= CORRIDOR_KM:
            return True
    return False


TOMTOM_CATEGORIES = {
    1: "UNKNOWN",
    2: "ACCIDENT",
    3: "HAZARD",
    4: "DANGEROUS_CONDITIONS",
    5: "RAIN",
    6: "ROAD_HAZARD",      #
    7: "JAM",
    8: "LANE_CLOSED",
    9: "ROAD_CLOSED",
    10: "ROAD_WORKS",
    11: "HIGH_WINDS",
    12: "FLOODING",
    13: "BROKEN_DOWN_VEHICLE",
}

def _parse_incidents(raw: list[dict], waypoints: list[dict]) -> list[dict]:
    result = []
    seen = set()  # prevent duplicates

    for item in raw:
        try:
            props = item.get("properties", item)
            geometry = item.get("geometry", {})
            coords = geometry.get("coordinates", [])

            if not coords:
                continue

            # TomTom LineString — use first coordinate as incident position
            # coordinates are [lng, lat] in GeoJSON format
            first = coords[0]
            lng, lat = float(first[0]), float(first[1])

        except (IndexError, TypeError, ValueError):
            continue

        if lat == 0 and lng == 0:
            continue

        # Deduplicate by rounding to 3 decimal places (~100m)
        key = (round(lat, 3), round(lng, 3))
        if key in seen:
            continue
        seen.add(key)

        if not _is_on_route(lat, lng, waypoints):
            continue

        category = props.get("iconCategory", 1)
        incident_type = TOMTOM_CATEGORIES.get(category, "UNKNOWN")

        # Only show relevant ones — skip lane closures and minor stuff
        if incident_type in ("UNKNOWN", "LANE_CLOSED"):
            continue

        description = (
            props.get("description")
            or props.get("shortDescription")
            or incident_type.replace("_", " ").title()
        )

        result.append({
            "lat":         lat,
            "lng":         lng,
            "type":        incident_type,
            "severity":    props.get("magnitudeOfDelay", 0),
            "description": description,
        })

    return result

@router.get("/{id}/incidents")
async def get_route_incidents(id: str):

    # Step 1 — Load shipment
    try:
        oid = ObjectId(id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid shipment id: {id}")

    shipment = await db.shipments.find_one({"_id": oid})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    waypoints = shipment.get("route_waypoints", [])
    print(f"Waypoints count: {len(waypoints)}") 
    if len(waypoints) < 2:
        return {"incidents": [], "count": 0, "message": "No route data available"}

    # Step 2 — Call TomTom per segment
    all_raw_incidents = []

    for i in range(len(waypoints) - 1):
        chunk = waypoints[i:i+2]
        lats = [wp["lat"] for wp in chunk]
        lngs = [wp["lng"] for wp in chunk]
        pad = 0.1
        bbox_str = (
            f"{min(lngs)-pad:.4f},{min(lats)-pad:.4f},"
            f"{max(lngs)+pad:.4f},{max(lats)+pad:.4f}"
        )
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                url = (
                    f"https://api.tomtom.com/traffic/services/5/incidentDetails"
                    f"?key={TOMTOM_KEY}"
                    f"&bbox={bbox_str}"
                    f"&language=en-GB"
                    f"&zoom=10"
                )
                resp = await client.get(url)
                print(f"TomTom segment {i}: status={resp.status_code} | {resp.text[:200]}")
                if resp.status_code == 200:
                    data = resp.json()
                    print(f"TomTom segment {i}: {data}")
                    raw = (
                        data.get("incidentFeatures")
                        or data.get("incidents")
                        or data.get("features")
                        or []
                    )
                    all_raw_incidents.extend(raw)
        except Exception as e:
            print(f"TomTom segment {i} ERROR: {type(e).__name__}: {e}")
            continue

    # Step 3 — Parse + filter to corridor
    
    if all_raw_incidents and "properties" in (all_raw_incidents[0] if all_raw_incidents else {}):
        all_raw_incidents = [
            {**item.get("properties", {}), "geometry": item.get("geometry")}
            for item in all_raw_incidents
        ]

    filtered = _parse_incidents(all_raw_incidents, waypoints)

    logger.info(f"Incidents for {id}: {len(all_raw_incidents)} from TomTom → {len(filtered)} on route")

    return {
        "shipment_id": id,
        "incidents":   filtered,
        "count":       len(filtered),
        "corridor_km": CORRIDOR_KM,
    }

