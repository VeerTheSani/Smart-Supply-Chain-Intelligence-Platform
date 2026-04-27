# routers/incidents.py
#
# GET /api/shipments/{id}/incidents
#
# HOW IT WORKS:
#   1. Serve from MongoDB (route_incidents field) — fast, no TomTom call
#   2. If empty/missing, fall back to live TomTom fetch and store result
#
# BACKGROUND REFRESH:
#   fetch_and_store_incidents() is called:
#     - As a fire-and-forget background task when a shipment is created
#     - Every scheduler cycle (5 min) for active shipments
#   This keeps route_incidents current without per-request TomTom calls.

import asyncio
import logging
import math
import os
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException

import httpx
from database import db
from services.mappls_service import _decode_polyline

load_dotenv()

TOMTOM_KEY = os.getenv("TOMTOM_KEY")

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/shipments", tags=["incidents"])

CORRIDOR_KM  = 0.2   # km — TomTom incident coords are often offset from road centerline
BBOX_PADDING = 0.5   # degrees — corridor filter tightens it down


# ── Geometry helpers ──────────────────────────────────────────────────────────

def _haversine_km(lat1, lng1, lat2, lng2) -> float:
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


def _dist_to_segment_km(lat, lng, lat1, lng1, lat2, lng2) -> float:
    dx = lat2 - lat1
    dy = lng2 - lng1
    if dx == 0 and dy == 0:
        return _haversine_km(lat, lng, lat1, lng1)
    t = ((lat - lat1) * dx + (lng - lng1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return _haversine_km(lat, lng, lat1 + t * dx, lng1 + t * dy)


def _is_on_route(incident_lat, incident_lng, waypoints) -> bool:
    for i in range(len(waypoints) - 1):
        w1, w2 = waypoints[i], waypoints[i + 1]
        dist = _dist_to_segment_km(
            incident_lat, incident_lng,
            w1["lat"], w1["lng"],
            w2["lat"], w2["lng"],
        )
        if dist <= CORRIDOR_KM:
            return True
    return False


# ── TomTom categories ─────────────────────────────────────────────────────────

TOMTOM_CATEGORIES = {
    1: "UNKNOWN", 2: "ACCIDENT", 3: "HAZARD", 4: "DANGEROUS_CONDITIONS",
    5: "RAIN", 6: "ROAD_HAZARD", 7: "JAM", 8: "LANE_CLOSED",
    9: "ROAD_CLOSED", 10: "ROAD_WORKS", 11: "HIGH_WINDS",
    12: "FLOODING", 13: "BROKEN_DOWN_VEHICLE",
}


def _parse_incidents(raw: list[dict], waypoints: list[dict]) -> list[dict]:
    result = []
    seen   = set()

    for item in raw:
        try:
            props    = item.get("properties", item)
            geometry = item.get("geometry", {})
            coords   = geometry.get("coordinates", [])
            geo_type = geometry.get("type", "")

            if not coords:
                continue

            if geo_type == "Point":
                lng, lat = float(coords[0]), float(coords[1])
            else:
                first = coords[0]
                if isinstance(first, (list, tuple)):
                    lng, lat = float(first[0]), float(first[1])
                else:
                    lng, lat = float(coords[0]), float(coords[1])

        except (IndexError, TypeError, ValueError):
            continue

        if lat == 0 and lng == 0:
            continue

        key = (round(lat, 3), round(lng, 3))
        if key in seen:
            continue
        seen.add(key)

        if not _is_on_route(lat, lng, waypoints):
            continue

        category      = props.get("iconCategory", 1)
        incident_type = TOMTOM_CATEGORIES.get(category, "UNKNOWN")

        if incident_type in ("UNKNOWN", "LANE_CLOSED"):
            continue

        import random
        description = (
            props.get("description")
            or props.get("shortDescription")
            or incident_type.replace("_", " ").title()
        )

        # Enhance generic or sterile API descriptions for demo purposes
        generic_match = incident_type.lower().replace("_", " ")
        if description.lower() in [generic_match, "hazard", "road_hazard", "jam", "accident", "road works"]:
            enhancements = {
                "ACCIDENT": [
                    "Multi-vehicle collision blocking two lanes.",
                    "Overturned cargo truck causing severe bottleneck.",
                    "Minor fender bender on the shoulder; rubbernecking delays."
                ],
                "JAM": [
                    "Heavy standstill traffic due to rush hour volume.",
                    "Unexpected severe bottleneck extending 4km.",
                    "Stop-and-go conditions; average speed below 15km/h."
                ],
                "ROAD_HAZARD": [
                    "Debris reported in the left lane.",
                    "Large pothole causing vehicles to swerve erratically.",
                    "Spilled construction material causing slick conditions."
                ],
                "HAZARD": [
                    "Unidentified obstruction in the roadway.",
                    "Stalled vehicle in the active travel lane.",
                    "Emergency responders active on the shoulder."
                ],
                "ROAD_WORKS": [
                    "Active lane closure for highway resurfacing.",
                    "Bridge maintenance work reducing flow to one lane.",
                    "Utility construction causing intermittent stoppages."
                ]
            }
            fallbacks = enhancements.get(incident_type, [f"Active {generic_match} affecting route progress."])
            description = random.choice(fallbacks)

        result.append({
            "lat":         lat,
            "lng":         lng,
            "type":        incident_type,
            "severity":    props.get("magnitudeOfDelay", 0),
            "description": description,
        })

    return result


# ── Core TomTom fetch (reusable) ──────────────────────────────────────────────

MAX_BBOX_SEGMENTS = 20   # max TomTom calls per shipment — prevents timeout on long routes


async def _fetch_tomtom_incidents(
    sparse_waypoints: list[dict],
    corridor_points: list[dict] | None = None,
) -> list[dict]:
    """
    Hit TomTom for route segments and return filtered incident list.

    sparse_waypoints — used for bbox generation (few segments → few API calls)
    corridor_points  — used for per-incident corridor check (can be dense); falls back to sparse
    """
    if len(sparse_waypoints) < 2:
        return []

    check_points = corridor_points if corridor_points else sparse_waypoints

    async def fetch_one(client, bbox_str):
        try:
            url = (
                f"https://api.tomtom.com/traffic/services/5/incidentDetails"
                f"?key={TOMTOM_KEY}&bbox={bbox_str}&language=en-GB&zoom=10"
            )
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                return (
                    data.get("features")
                    or data.get("incidentFeatures")
                    or data.get("incidents")
                    or []
                )
        except Exception:
            pass
        return []

    # Thin sparse_waypoints if still too many (e.g. 50km-sampled can still be large)
    pts = sparse_waypoints
    if len(pts) - 1 > MAX_BBOX_SEGMENTS:
        step = (len(pts) - 1) / MAX_BBOX_SEGMENTS
        pts  = [pts[round(i * step)] for i in range(MAX_BBOX_SEGMENTS)] + [pts[-1]]

    bboxes = []
    for i in range(len(pts) - 1):
        lats = [pts[i]["lat"],   pts[i+1]["lat"]]
        lngs = [pts[i]["lng"],   pts[i+1]["lng"]]
        pad  = 0.15   # ~16km padding so incidents near waypoints aren't clipped
        bboxes.append(
            f"{min(lngs)-pad:.4f},{min(lats)-pad:.4f},"
            f"{max(lngs)+pad:.4f},{max(lats)+pad:.4f}"
        )

    all_raw = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        BATCH = 10  # conservative — TomTom free tier is rate-limited
        for i in range(0, len(bboxes), BATCH):
            batch   = bboxes[i:i + BATCH]
            results = await asyncio.gather(*[fetch_one(client, b) for b in batch])
            for r in results:
                all_raw.extend(r)

    return _parse_incidents(all_raw, check_points)


# ── Public helper: fetch + store in MongoDB ───────────────────────────────────

async def fetch_and_store_incidents(shipment_id: str | ObjectId) -> list[dict]:
    """
    Fetch live incidents from TomTom for a shipment and persist them to
    MongoDB (route_incidents field).  Returns the filtered incident list.

    Called:
      - As a background task when a shipment is created
      - By the scheduler every 5 minutes for active shipments
    """
    try:
        oid      = ObjectId(shipment_id) if isinstance(shipment_id, str) else shipment_id
        shipment = await db.shipments.find_one({"_id": oid}, {"route_waypoints": 1, "route_geometry_encoded": 1, "status": 1, "created_at": 1, "expected_travel_seconds": 1})
        if not shipment:
            return []

        waypoints = shipment.get("route_waypoints", [])
        encoded   = shipment.get("route_geometry_encoded", "")
        status    = shipment.get("status")
        created_at = shipment.get("created_at")
        eta_seconds = shipment.get("expected_travel_seconds")

        if len(waypoints) < 2:
            return []

        # Mathematically calculate dynamic slice of the road currently remaining!
        progress = 0.0
        if status == "delivered":
            progress = 1.0
        elif status == "planned":
            progress = 0.0
        elif created_at and eta_seconds:
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at)
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            elapsed  = (datetime.now(timezone.utc) - created_at).total_seconds()
            progress = min((elapsed * 5) / eta_seconds, 1.0)

        # Truncate queries: only pull geometry physically IN FRONT of the truck!
        dense_points = None
        bbox_anchors = waypoints
        
        if encoded:
            from core.mappls_service import _decode_polyline
            raw_coords = _decode_polyline(encoded)
            idx        = min(int(progress * len(raw_coords)), len(raw_coords) - 1)
            active_coords = raw_coords[idx:] 
            
            if len(active_coords) > 0:
               dense_points = [{"lat": c[1], "lng": c[0]} for c in active_coords]
               
               # Dynamically recreate BBOX anchors from only the active road ahead so TomTom doesn't pull trailing data
               step = max(1, len(dense_points) // 10)
               bbox_anchors = dense_points[::step]
               if dense_points[-1] not in bbox_anchors:
                   bbox_anchors.append(dense_points[-1])
            else:
               dense_points = [{"lat": waypoints[-1]["lat"], "lng": waypoints[-1]["lng"]}]
               bbox_anchors = dense_points

        incidents = await _fetch_tomtom_incidents(bbox_anchors, corridor_points=dense_points)

        # Only overwrite stored incidents if TomTom returned data.
        # An empty result likely means API failure (403/rate-limit), not a clear route —
        # preserves previously fetched incidents instead of wiping them.
        if incidents:
            await db.shipments.update_one(
                {"_id": oid},
                {"$set": {
                    "route_incidents":            incidents,
                    "route_incidents_updated_at": datetime.now(timezone.utc),
                }}
            )
            logger.info(f"Incidents stored for {shipment_id}: {len(incidents)} on-route")
        else:
            logger.info(f"TomTom returned no incidents for {shipment_id} — keeping existing stored data")

        return incidents

    except Exception as e:
        logger.warning(f"fetch_and_store_incidents failed for {shipment_id}: {e}")
        return []


# ── GET /api/shipments/{id}/incidents ─────────────────────────────────────────

@router.get("/{id}/incidents")
async def get_route_incidents(id: str):
    try:
        oid = ObjectId(id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid shipment id: {id}")

    shipment = await db.shipments.find_one({"_id": oid})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    # Serve from MongoDB if fresh (updated within last 10 minutes)
    stored_at = shipment.get("route_incidents_updated_at")
    stored    = shipment.get("route_incidents")

    if stored is not None and stored_at:
        if isinstance(stored_at, str):
            stored_at = datetime.fromisoformat(stored_at)
        if stored_at.tzinfo is None:
            stored_at = stored_at.replace(tzinfo=timezone.utc)

        age_minutes = (datetime.now(timezone.utc) - stored_at).total_seconds() / 60
        if age_minutes < 10:
            return {
                "shipment_id": id,
                "incidents":   stored,
                "count":       len(stored),
                "source":      "cache",
                "corridor_km": CORRIDOR_KM,
            }

    # Stale or missing — fetch live and store
    incidents = await fetch_and_store_incidents(id)

    return {
        "shipment_id": id,
        "incidents":   incidents,
        "count":       len(incidents),
        "source":      "live",
        "corridor_km": CORRIDOR_KM,
    }
