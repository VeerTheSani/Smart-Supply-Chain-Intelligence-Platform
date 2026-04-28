import asyncio
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from database import db
from models import DecisionCreate, RiskSnapshot, CascadeImpact

async def test_insert():
    now = datetime.now(timezone.utc)
    decision_data = DecisionCreate(
        shipment_id=str(ObjectId()),
        type="auto_reroute",
        status="pending",
        risk_snapshot=RiskSnapshot(
            score=85.5,
            level="HIGH",
            primary_driver="weather",
            factors=[{"factor": "weather", "score": 90, "weight": 0.5}]
        ),
        cascade_impact=CascadeImpact(
            nodes_affected=4,
            total_delay_hours=12.5
        ),
        reason_summary="Severe weather delay on primary route.",
        confidence_score=0.92,
        proposed_route_id=str(ObjectId()),
        countdown_expires_at=now + timedelta(seconds=120)
    )

    doc = decision_data.model_dump()
    doc["created_at"] = now
    
    result = await db.decisions.insert_one(doc)
    print(f"Inserted Decision Document ID: {result.inserted_id}")
    
    inserted_doc = await db.decisions.find_one({"_id": result.inserted_id})
    print(inserted_doc)

if __name__ == "__main__":
    asyncio.run(test_insert())
