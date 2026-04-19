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

import logging
import math

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException

from database import db
from services.mappls_service import get_token
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


def _parse_incidents(raw: list[dict], waypoints: list[dict]) -> list[dict]:
    """
    Parse Mappls incident response and filter to route-only incidents.

    Mappls returns incidents with varying field names depending on API version.
    We normalize to a clean shape: {lat, lng, type, severity, description}

    Incident types from Mappls: ACCIDENT, ROAD_CLOSED, CONSTRUCTION,
                                  LANE_RESTRICTION, HAZARD, WEATHER
    Severity: 0=unknown, 1=minor, 2=moderate, 3=major, 4=critical
    """
    result = []

    for item in raw:
        # Mappls can nest coords differently — handle both shapes
        # Shape 1: item["geometry"]["coordinates"] = [lng, lat]  (GeoJSON)
        # Shape 2: item["lat"], item["lng"]  (flat)
        try:
            if "geometry" in item:
                coords = item["geometry"]["coordinates"]
                lng, lat = float(coords[0]), float(coords[1])
            else:
                lat = float(item.get("lat", 0))
                lng = float(item.get("lng", 0))
        except (KeyError, IndexError, TypeError, ValueError):
            continue  # skip malformed entries

        if lat == 0 and lng == 0:
            continue  # skip null coordinates

        # Only keep if it's actually on our route
        if not _is_on_route(lat, lng, waypoints):
            continue

        # Normalize type — Mappls uses different field names
        incident_type = (
            item.get("type")
            or item.get("incidentType")
            or item.get("incident_type")
            or "UNKNOWN"
        ).upper()

        # Normalize severity to int 0-4
        severity = int(item.get("severity", item.get("severityLevel", 0)) or 0)

        # Normalize description
        description = (
            item.get("description")
            or item.get("shortDescription")
            or item.get("title")
            or incident_type.replace("_", " ").title()
        )

        result.append({
            "lat":         lat,
            "lng":         lng,
            "type":        incident_type,
            "severity":    severity,
            "description": description,
        })

    return result


@router.get("/{id}/incidents")
async def get_route_incidents(id: str):
    """
    Get live traffic incidents along a shipment's route.
    Returns only incidents within 5km of the route — not the whole region.
    Called by the frontend when a shipment is selected on the map.
    """

    # Step 1 — Load shipment from MongoDB
    try:
        oid = ObjectId(id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid shipment id: {id}")

    shipment = await db.shipments.find_one({"_id": oid})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    waypoints = shipment.get("route_waypoints", [])
    if len(waypoints) < 2:
        # No route stored — return empty, not an error
        return {"incidents": [], "count": 0, "message": "No route data available"}

    # Step 2 — Build bounding box from waypoints
    lng_min, lat_min, lng_max, lat_max = _build_bbox(waypoints)
    bbox_str = f"{lng_min:.4f},{lat_min:.4f},{lng_max:.4f},{lat_max:.4f}"

    logger.info(f"Fetching incidents for shipment {id} | bbox={bbox_str} | {len(waypoints)} waypoints")

    # Step 3 — Call Mappls Traffic Incidents API
    try:
        token = await get_token()

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://apis.mappls.com/advancedmaps/v1/traffic_incidents",
                params={"bbox": bbox_str},
                headers={"Authorization": f"Bearer {token}"},
            )

            if resp.status_code == 404:
                # No incidents in area — totally normal
                return {"incidents": [], "count": 0}

            if resp.status_code == 401:
                raise HTTPException(status_code=503, detail="Mappls auth failed")

            resp.raise_for_status()
            data = resp.json()

    except httpx.TimeoutException:
        logger.warning(f"Mappls incidents timeout for shipment {id}")
        return {"incidents": [], "count": 0, "message": "Incidents API timed out"}

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Mappls incidents API error for {id}: {e}")
        return {"incidents": [], "count": 0, "message": "Could not fetch incidents"}

    # Step 4 — Parse response, handle both GeoJSON and flat shapes
    raw_incidents = (
        data.get("incidentFeatures")
        or data.get("incidents")
        or data.get("features")
        or []
    )

    # GeoJSON FeatureCollection — actual data is in item["properties"]
    if raw_incidents and "properties" in (raw_incidents[0] if raw_incidents else {}):
        raw_incidents = [
            {**item.get("properties", {}), "geometry": item.get("geometry")}
            for item in raw_incidents
        ]

    # Step 5 — Filter to corridor + normalize shape
    filtered = _parse_incidents(raw_incidents, waypoints)

    logger.info(
        f"Incidents for {id}: {len(raw_incidents)} from Mappls → "
        f"{len(filtered)} on route (within {CORRIDOR_KM}km)"
    )

    return {
        "shipment_id": id,
        "incidents":   filtered,
        "count":       len(filtered),
        "corridor_km": CORRIDOR_KM,
    }