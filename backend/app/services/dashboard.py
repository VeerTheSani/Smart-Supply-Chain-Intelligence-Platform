from app.core.database import Database

class DashboardService:
    @classmethod
    async def get_overview(cls) -> dict:
        """Calculate system-wide analytics overview."""
        shipments = Database.get_collection("shipments")

        total = await shipments.count_documents({})
        
        # Risk level high and status not delivered
        active_disruptions = await shipments.count_documents({
            "risk.current.risk_level": "high",
            "status": {"$ne": "delivered"}
        })

        # Calculate average risk score
        pipeline = [
            {"$match": {"risk.current.risk_score": {"$exists": True}}},
            {"$group": {"_id": None, "avgRisk": {"$avg": "$risk.current.risk_score"}}}
        ]
        
        cursor = shipments.aggregate(pipeline)
        avg_risk = 0.0
        async for result in cursor:
            avg_risk = result.get("avgRisk", 0.0)

        optimized_routes = 0 # Placeholder for Route Optimization phase

        return {
            "total_shipments": total,
            "active_disruptions": active_disruptions,
            "optimized_routes": optimized_routes,
            "avg_risk_score": round(avg_risk, 1)
        }
