# main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.scheduler import start_scheduler, stop_scheduler
from database import db


async def _ensure_indexes():
    """Create MongoDB indexes on startup for query performance."""
    try:
        await db.shipments.create_index("status")
        await db.shipment_dependencies.create_index("parent_shipment_id")
        await db.shipment_dependencies.create_index("child_shipment_id")
    except Exception:
        pass  # indexes may already exist


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs on startup
    await _ensure_indexes()
    start_scheduler()
    yield
    # Runs on shutdown
    stop_scheduler()


app = FastAPI(
    title="Smart Supply Chain API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import shipments, risk, reroute, websocket, dashboard, cascade, notifications, scenario

app.include_router(dashboard.router)
app.include_router(shipments.router)
app.include_router(risk.router)
app.include_router(reroute.router)
app.include_router(websocket.router)
app.include_router(cascade.router)
app.include_router(notifications.router)
app.include_router(scenario.router)


# ── Countdown endpoints (minimal, not a full router) ──────────────────────────
from core.countdown_manager import countdown_manager

@app.post("/api/countdown/{shipment_id}/cancel")
async def cancel_countdown(shipment_id: str):
    """Cancel an active auto-reroute countdown for a shipment."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    
    updated = await db.decisions.update_many(
        {"shipment_id": shipment_id, "status": "pending"},
        {"$set": {"status": "cancelled", "updated_at": now}}
    )
    
    if updated.modified_count == 0:
        return {"status": "no_active_countdown", "shipment_id": shipment_id}
        
    await countdown_manager.cancel_countdown(shipment_id)
    return {"status": "cancelled", "shipment_id": shipment_id}

@app.get("/api/countdowns")
async def get_active_countdowns():
    """List all active countdowns."""
    from datetime import datetime, timezone
    from bson import ObjectId
    now = datetime.now(timezone.utc)
    
    pending = await db.decisions.find({"status": "pending"}).to_list(None)
    result = []
    
    for d in pending:
        exp = d.get("countdown_expires_at")
        if exp:
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            rem = int((exp - now).total_seconds())
            if rem > 0:
                shipment = await db.shipments.find_one({"_id": ObjectId(d["shipment_id"])}, {"shipment_name": 1})
                sname = shipment.get("shipment_name", "Unknown") if shipment else "Unknown"
                result.append({
                    "shipment_id": d["shipment_id"],
                    "shipment_name": sname,
                    "seconds_remaining": rem,
                    "seconds_total": 120,
                })
    return result


@app.get("/")
async def root():
    return {"status": "ok", "message": "Smart Supply Chain API is running"}