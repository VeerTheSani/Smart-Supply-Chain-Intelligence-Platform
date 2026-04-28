import asyncio
import json
import logging
from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.DEBUG)

async def test():
    try:
        from core.scheduler import _should_call_gemini
        # I just need to import calculate_risk and mock a dummy doc!
        from routers.risk_engine import calculate_risk
        import datetime
        doc = {
            "origin_coords": {"lat": 28, "lng": 77},
            "destination_coords": {"lat": 28, "lng": 77},
            "current_location": {"lat": 28, "lng": 77},
            "route_waypoints": [{"lat": 28, "lng": 77}],
            "expected_travel_seconds": 1000,
            "distance_km": 10,
            "road_names": ["NH 48"],
            "created_at": datetime.datetime.now()
        }
        res = await calculate_risk(doc)
        print("STAGE 2 SUCCESS:", res["breakdown"]["historical"])
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
