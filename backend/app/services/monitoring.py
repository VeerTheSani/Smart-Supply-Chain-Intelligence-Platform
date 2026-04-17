"""
Continuous Monitoring Service using APScheduler.
"""
import random
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from app.core.database import Database
from app.services.risk_engine import RiskEngine

class MonitoringService:
    scheduler = AsyncIOScheduler()
    _is_running = False

    @classmethod
    def start(cls):
        """Start the APScheduler."""
        if not cls._is_running:
            # Adding max_instances=1 prevents overlapping jobs safely.
            cls.scheduler.add_job(
                cls.monitor_active_shipments,
                trigger=IntervalTrigger(minutes=5),
                id="monitor_active_shipments_job",
                name="Check active shipments and re-evaluate risk",
                max_instances=1,
                replace_existing=True
            )
            cls.scheduler.start()
            cls._is_running = True
            print("🕒 Monitoring service started. Running every 5 minutes.")

    @classmethod
    def stop(cls):
        """Stop the APScheduler."""
        if cls._is_running:
            cls.scheduler.shutdown()
            cls._is_running = False
            print("⏹️ Monitoring service stopped.")

    @classmethod
    async def monitor_active_shipments(cls):
        """Job: fetch active shipments, simulate GPS updates, re-evaluate risk."""
        print("🔍 Running scheduled monitoring job for active shipments...")
        try:
            collection = Database.get_collection("shipments")
            
            # Fetch all shipments that are active
            cursor = collection.find({"status": {"$in": ["pending", "in_transit"]}})
            
            async for doc in cursor:
                shipment_id = doc["_id"]
                
                try:
                    # Simulation: Update GPS (simple random walk)
                    current_location = doc.get("current_location") or {"lat": 0.0, "lng": 0.0}
                    base_lat = current_location.get("lat") or 34.0522 # LA as default
                    base_lng = current_location.get("lng") or -118.2437
                    
                    new_lat = base_lat + random.uniform(-0.05, 0.05)
                    new_lng = base_lng + random.uniform(-0.05, 0.05)
                    
                    # Risk evaluation
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
                    
                    # Ensure new_lat/new_lng aren't None before writing
                    new_lat = new_lat if new_lat is not None else 34.0522
                    new_lng = new_lng if new_lng is not None else -118.2437
                    
                    updates = {
                        "$set": {
                            "current_location": {"lat": new_lat, "lng": new_lng},
                            "risk.current": new_assessment,
                            "updated_at": datetime.now(timezone.utc)
                        },
                        "$push": {
                            "risk.history": new_assessment
                        }
                    }
                    
                    # Alerts condition
                    if old_level != new_level:
                        new_alert = {
                            "timestamp": datetime.now(timezone.utc),
                            "message": f"Auto-monitor: Risk level changed from {old_level or 'none'} to {new_level}: {new_assessment['reason']}",
                            "level": new_level
                        }
                        updates["$push"]["alerts"] = new_alert
                        
                        # Broadcast alert to WebSocket clients
                        from app.core.websocket import manager
                        alert_payload = {
                            "type": "risk_alert",
                            "shipment_id": str(shipment_id),
                            "level": new_level,
                            "message": new_alert["message"],
                            "timestamp": new_alert["timestamp"].isoformat()
                        }
                        await manager.broadcast(alert_payload)
                    
                    await collection.update_one({"_id": shipment_id}, updates)
                except Exception as e:
                    print(f"⚠️ Error updating shipment {shipment_id}: {e}")
                    
            print("✅ Monitoring job completed successfully.")
        except Exception as e:
            print(f"❌ Fatal error in monitoring job: {e}")
