from app.core.database import Database
from app.schemas.shipment import ShipmentCreate, ShipmentOut
from datetime import datetime, timezone
from bson import ObjectId

class ShipmentService:
    collection_name = "shipments"

    GEO_MAP = {
        "Ahmedabad": {"lat": 23.0225, "lng": 72.5714},
        "Mumbai": {"lat": 19.0760, "lng": 72.8777},
        "Delhi": {"lat": 28.6139, "lng": 77.2090},
        "Jaipur": {"lat": 26.9124, "lng": 75.7873},
        "London": {"lat": 51.5074, "lng": -0.1278},
        "Paris": {"lat": 48.8566, "lng": 2.3522},
        "New York": {"lat": 40.7128, "lng": -74.0060},
        "Los Angeles": {"lat": 34.0522, "lng": -118.2437},
        "Bangalore": {"lat": 12.9716, "lng": 77.5946},
        "Chennai": {"lat": 13.0827, "lng": 80.2707},
        "Shanghai": {"lat": 31.2304, "lng": 121.4737},
    }

    @classmethod
    def get_collection(cls):
        return Database.get_collection(cls.collection_name)

    @classmethod
    def apply_geo_correction(cls, doc: dict):
        """Force correct geo coordinates based on origin"""
        origin = str(doc.get("origin", "")).lower()

        for city, coords in cls.GEO_MAP.items():
            if city.lower() in origin:
                doc["current_location"] = coords
                break

        return doc

    @classmethod
    async def get_all_shipments(cls) -> list[ShipmentOut]:
        """Fetch all shipments from the database."""
        collection = cls.get_collection()
        cursor = collection.find().sort("created_at", -1)
        
        shipments = []
        async for doc in cursor:
            try:
                doc["id"] = str(doc["_id"])
                doc = cls.apply_geo_correction(doc)
                shipments.append(ShipmentOut(**doc))
            except Exception as e:
                print(f"Skipping invalid shipment document {doc.get('_id')}")
        return shipments

    @classmethod
    async def get_shipment(cls, shipment_id: str) -> ShipmentOut:
        """Fetch a single shipment by ID."""
        doc = await cls.get_collection().find_one({"_id": ObjectId(shipment_id)})
        if not doc:
            return None
        doc["id"] = str(doc["_id"])
        doc = cls.apply_geo_correction(doc)
        return ShipmentOut(**doc)

    @classmethod
    async def create_shipment(cls, shipment: ShipmentCreate, background_tasks) -> ShipmentOut:
        collection = cls.get_collection()
        doc = shipment.model_dump()

        now = datetime.now(timezone.utc)

        # Defaults (VERY IMPORTANT)
        # We ensure user-provided conditions aren't accidentally blown away if provided
        user_conditions = doc.get("conditions")
        doc.setdefault("route", {"waypoints": [], "expected_travel_seconds": None, "polyline": None})
        doc.setdefault("current_location", {"lat": None, "lng": None})
        doc["conditions"] = user_conditions if user_conditions else {"weather": "clear", "traffic": "low"}
        doc.setdefault("settings", {"auto_reroute_enabled": False})
        doc.setdefault("risk", {"current": None, "history": []})
        doc.setdefault("alerts", [])

        doc["created_at"] = now
        doc["updated_at"] = now

        result = await collection.insert_one(doc)
        doc["id"] = str(result.inserted_id)

        # Triggers risk evaluation in the background!
        background_tasks.add_task(cls.process_shipment_risk, doc["id"])

        return ShipmentOut(**doc)

    @classmethod
    async def process_shipment_risk(cls, shipment_id: str):
        """Background task to evaluate risk and update shipment."""
        from app.services.risk_engine import RiskEngine
        collection = cls.get_collection()
        
        doc = await collection.find_one({"_id": ObjectId(shipment_id)})
        if not doc:
            return

        conditions = doc.get("conditions", {})
        weather = conditions.get("weather", "clear")
        traffic = conditions.get("traffic", "low")

        risk_result = RiskEngine.evaluate(weather, traffic)

        new_assessment = {
            "timestamp": datetime.now(timezone.utc),
            "risk_score": risk_result["risk_score"],
            "risk_level": risk_result["risk_level"],
            "reason": risk_result["reason"]
        }

        old_risk = doc.get("risk", {}).get("current")
        old_level = old_risk.get("risk_level") if old_risk else None
        new_level = new_assessment["risk_level"]

        updates = {
            "$set": {
                "risk.current": new_assessment,
                "updated_at": datetime.now(timezone.utc)
            },
            "$push": {
                "risk.history": new_assessment
            }
        }

        # Create alert if risk level changes
        if old_level != new_level:
            new_alert = {
                "timestamp": datetime.now(timezone.utc),
                "message": f"Risk level evaluated to {new_level}: {new_assessment['reason']}" if not old_level else f"Risk level changed from {old_level} to {new_level}: {new_assessment['reason']}",
                "level": new_level
            }
            if "alerts" not in updates["$push"]:
                updates["$push"]["alerts"] = new_alert
            
            # Broadcast alert to all connected WebSocket clients
            from app.core.websocket import manager
            alert_payload = {
                "type": "risk_alert",
                "shipment_id": str(shipment_id),
                "level": new_level,
                "message": new_alert["message"],
                "timestamp": new_alert["timestamp"].isoformat()
            }
            await manager.broadcast(alert_payload)

        await collection.update_one({"_id": ObjectId(shipment_id)}, updates)


