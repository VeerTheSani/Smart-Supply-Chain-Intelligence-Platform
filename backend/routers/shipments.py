# routers/shipments.py
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query

from database import db
from models import ShipmentCreate, ShipmentUpdate
from services.geocoding_service import geocode
from services.mappls_service import get_route
from services.segment_service import get_named_waypoints

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/shipments", tags=["shipments"])


# Helpers (superman) 

def _to_id(id: str) -> ObjectId:
    try:
        return ObjectId(id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid shipment id: {id}")


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


async def _get_or_404(id: str) -> dict:
    doc = await db.shipments.find_one({"_id": _to_id(id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return doc


# api/shipments  post request

@router.post("/", status_code=201)
async def create_shipment(data: ShipmentCreate):
    """
    Create a new shipment:
    1. Geocode origin + destination (Nominatim)
    2. Get route + traffic from Mappls
    3. Reverse geocode waypoints to get city names (for Gemini)
    4. Store everything in MongoDB
    """
    # Step 1 — geocode
    try:
        origin_geo = await geocode(data.origin_name)
        dest_geo   = await geocode(data.destination_name)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    origin_coords = {"lat": origin_geo["lat"], "lng": origin_geo["lng"]}
    dest_coords   = {"lat": dest_geo["lat"],   "lng": dest_geo["lng"]}

    # Step 2 — get route from Mappls
    route_waypoints      = []
    named_waypoints      = []
    road_names           = []
    distance_km          = None
    expected_travel_secs = None
    eta_hours            = None

    # try:
    #     route = await get_route(origin_coords, dest_coords)
    #     route_waypoints      = route["waypoints"]
    #     distance_km          = route["distance_km"]
    #     expected_travel_secs = route["duration_seconds"]
    #     eta_hours            = route["eta_hours"]
    #     road_names           = route.get("road_names", [])

    #     # Step 3 — reverse geocode waypoints → city names for Gemini
    #     named_waypoints = await get_named_waypoints(route_waypoints)

    # except RuntimeError as e:
    #     logger.warning(f"Route fetch failed for {data.origin_name}→{data.destination_name}: {e}")
    try:
        route = await get_route(origin_coords, dest_coords)
        route_waypoints = route["waypoints"]
        distance_km     = route["distance_km"]
        road_names      = route.get("road_names", [])

        # Fix ETA — Mappls free tier often returns no real traffic
        # Apply 35% buffer when traffic ratio is 1.0 (no live data)
        duration_with    = route["duration_seconds"]
        duration_without = route.get("duration_no_traffic_seconds", duration_with)

        if duration_with == duration_without:
            expected_travel_secs = int(duration_with * 1.35)
        else:
            expected_travel_secs = duration_with

        eta_hours = round(expected_travel_secs / 3600, 2)

        # Step 3 — reverse geocode waypoints → city names for Gemini
        named_waypoints = await get_named_waypoints(route_waypoints)

    except RuntimeError as e:
        logger.warning(f"Route fetch failed for {data.origin_name}→{data.destination_name}: {e}")

    now = datetime.now(timezone.utc)

    doc = {
        # Names
        "shipment_name":        data.shipment_name,
        "origin_name":          data.origin_name,
        "origin_resolved":      origin_geo["display_name"],
        "origin_coords":        origin_coords,
        "destination_name":     data.destination_name,
        "destination_resolved": dest_geo["display_name"],
        "destination_coords":   dest_coords,

        # Route
        "current_location":          None,
        "route_waypoints":           route_waypoints,
        "named_waypoints":           named_waypoints,   # city names for Gemini
        "road_names":                road_names,        # NH48 etc for Gemini
        "distance_km":               distance_km,
        "expected_travel_seconds":   expected_travel_secs,
        "eta_hours":                 eta_hours,

        # Config
        "status":               "planned",
        "auto_reroute_enabled": data.auto_reroute_enabled,

        # Risk
        "last_risk_assessment": None,
        "risk_history":         [],
        "alerts_triggered":     [],

        # Timestamps
        "created_at": now,
        "updated_at": now,
    }

    result = await db.shipments.insert_one(doc)
    doc["_id"] = result.inserted_id

    logger.info(
        f"Shipment created: {result.inserted_id} | "
        f"{data.origin_name} → {data.destination_name} | "
        f"{len(route_waypoints)} waypoints | {distance_km}km | "
        f"roads: {road_names}"
    )
    return _serialize(doc)


# ── GET /api/shipments ─────────────────────────────────────────────────────────

@router.get("/")
async def list_shipments(
    status: Optional[str] = Query(None)
):
    query = {}
    if status:
        valid = {"planned", "in_transit", "rerouting", "delivered", "delayed"}
        if status not in valid:
            raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {valid}")
        query["status"] = status

    docs = await db.shipments.find(query).sort("created_at", -1).to_list(100)
    return [_serialize(doc) for doc in docs]


# ── GET /api/shipments/{id} ────────────────────────────────────────────────────

@router.get("/{id}")
async def get_shipment(id: str):
    doc = await _get_or_404(id)
    return _serialize(doc)


# ── PATCH /api/shipments/{id} ─────────────────────────────────────────────────

@router.patch("/{id}")
async def update_shipment(id: str, data: ShipmentUpdate):
    await _get_or_404(id)

    updates = {"updated_at": datetime.now(timezone.utc)}

    if data.current_location is not None:
        updates["current_location"] = {
            "lat": data.current_location.lat,
            "lng": data.current_location.lng,
        }
    if data.status is not None:
        updates["status"] = data.status
    if data.auto_reroute_enabled is not None:
        updates["auto_reroute_enabled"] = data.auto_reroute_enabled

    if len(updates) == 1:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db.shipments.update_one({"_id": _to_id(id)}, {"$set": updates})
    updated = await db.shipments.find_one({"_id": _to_id(id)})
    return _serialize(updated)


# ── DELETE /api/shipments/{id} ────────────────────────────────────────────────

@router.delete("/{id}", status_code=204)
async def delete_shipment(id: str):
    await _get_or_404(id)
    await db.shipments.delete_one({"_id": _to_id(id)})
    logger.info(f"Shipment deleted: {id}")
    return None