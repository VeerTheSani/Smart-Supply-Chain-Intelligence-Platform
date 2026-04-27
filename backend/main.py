# main.py
import os
import re
import time
import logging
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from core.scheduler import start_scheduler, stop_scheduler
from database import db

logger = logging.getLogger(__name__)

# ── Auth config ───────────────────────────────────────────────────────────────
API_KEY = os.getenv("API_KEY", "sc-dev-key-2026")
_security = HTTPBearer(auto_error=False)

# Paths that do NOT require authentication
_PUBLIC_PATHS = frozenset({"/", "/health", "/docs", "/openapi.json", "/redoc"})

async def verify_api_key(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
):
    """Validate Bearer token against API_KEY. Returns True or raises 401."""
    if not credentials or credentials.credentials != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True


async def _ensure_indexes():
    """Create MongoDB indexes on startup for query performance."""
    try:
        await db.shipments.create_index("status")
        await db.decisions.create_index([("shipment_id", 1), ("status", 1)])
        await db.decisions.create_index([("status", 1), ("executed", 1)])
        await db.shipment_dependencies.create_index("parent_shipment_id")
        await db.shipment_dependencies.create_index("child_shipment_id")
        await db.notifications.create_index([("timestamp", -1)])
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


# ── CORS — use env whitelist, fallback to localhost for dev ────────────────────
_cors_origins_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173")
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=True,
)

from routers import shipments, risk, reroute, websocket, dashboard, cascade, notifications, scenario, incidents

app.include_router(dashboard.router)
app.include_router(shipments.router)
app.include_router(risk.router)
app.include_router(reroute.router)
app.include_router(websocket.router)
app.include_router(cascade.router)
app.include_router(notifications.router)
app.include_router(scenario.router)
app.include_router(incidents.router)


# ── Input validation helper ──────────────────────────────────────────────────
_SAFE_STRING_RE = re.compile(r"^[\w\s\-.,()&/'+#:]{1,300}$", re.UNICODE)

def validate_string(value: str, field_name: str, max_len: int = 200) -> str:
    """Basic input sanitization. Rejects empty, too-long, or suspicious strings."""
    if not value or not value.strip():
        raise HTTPException(400, detail=f"{field_name} cannot be empty")
    value = value.strip()
    if len(value) > max_len:
        raise HTTPException(400, detail=f"{field_name} too long (max {max_len} chars)")
    if not _SAFE_STRING_RE.match(value):
        raise HTTPException(400, detail=f"{field_name} contains invalid characters")
    return value


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
    """List all active countdowns — batch query for shipment names."""
    from datetime import datetime, timezone
    from bson import ObjectId
    now = datetime.now(timezone.utc)
    
    pending = await db.decisions.find({"status": "pending"}).to_list(None)
    
    # Collect valid countdowns first
    valid = []
    shipment_ids = set()
    for d in pending:
        exp = d.get("countdown_expires_at")
        if not exp:
            continue
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        rem = int((exp - now).total_seconds())
        if rem > 0:
            valid.append((d, rem))
            shipment_ids.add(d["shipment_id"])
    
    if not valid:
        return []
    
    # Single batch query for all shipment names
    ship_docs = await db.shipments.find(
        {"_id": {"$in": [ObjectId(sid) for sid in shipment_ids]}},
        {"shipment_name": 1}
    ).to_list(None)
    name_map = {str(s["_id"]): s.get("shipment_name", "Unknown") for s in ship_docs}
    
    return [
        {
            "shipment_id": d["shipment_id"],
            "shipment_name": name_map.get(d["shipment_id"], "Unknown"),
            "seconds_remaining": rem,
            "seconds_total": 120,
        }
        for d, rem in valid
    ]


# ── Decision Panel API ────────────────────────────────────────────────────────

@app.get("/api/decisions")
async def get_decisions(shipment_id: str = None, status: str = None):
    """Fetch decisions, optionally filtered by shipment_id and status."""
    query = {}
    if shipment_id:
        query["shipment_id"] = shipment_id
    if status:
        query["status"] = status
    
    docs = await db.decisions.find(query).sort("created_at", -1).to_list(50)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs

@app.get("/api/decisions/{decision_id}")
async def get_decision(decision_id: str):
    """Fetch a single decision by ID."""
    from bson import ObjectId
    doc = await db.decisions.find_one({"_id": ObjectId(decision_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Decision not found")
    doc["id"] = str(doc.pop("_id"))
    return doc


# ── Manual Reroute Execution ─────────────────────────────────────────────────

@app.post("/api/reroute/{shipment_id}/execute")
async def execute_manual_reroute(shipment_id: str):
    """
    Execute reroute via backend. Called by DecisionPanel and RerouteModal.
    Cancels any pending decision countdown, then triggers the real reroute engine.
    """
    from datetime import datetime, timezone
    from bson import ObjectId
    from bson.errors import InvalidId
    from core.scheduler import _apply_auto_reroute

    now = datetime.now(timezone.utc)

    try:
        oid = ObjectId(shipment_id)
    except (InvalidId, Exception):
        raise HTTPException(400, detail=f"Invalid shipment id: {shipment_id}")

    shipment = await db.shipments.find_one({"_id": oid})
    if not shipment:
        raise HTTPException(404, detail="Shipment not found")

    if shipment.get("status") == "delivered":
        raise HTTPException(400, detail="Cannot reroute a delivered shipment")

    # Cancel any pending countdown decision
    await db.decisions.update_many(
        {"shipment_id": shipment_id, "status": "pending"},
        {"$set": {"status": "executed", "executed": True, "executed_at": now}}
    )

    # Execute the real reroute engine
    reroute_data = await _apply_auto_reroute(shipment)

    shipment_name = shipment.get("shipment_name", shipment.get("origin_name", "Unknown"))

    if reroute_data:
        await countdown_manager.execute_reroute_result(shipment_id, shipment_name, reroute_data, success=True)
        return {"status": "rerouting", "shipment_id": shipment_id, "route": reroute_data.get("label", "Recommended")}
    else:
        await countdown_manager.execute_reroute_result(shipment_id, shipment_name, None, success=False)
        raise HTTPException(503, detail="Reroute engine found no alternatives")


@app.get("/")
async def root():
    return {"status": "ok", "message": "Smart Supply Chain API is running"}


@app.get("/metrics")
async def get_metrics():
    """Return in-memory system metrics for observability."""
    from core.metrics import metrics
    from core.websocket_manager import manager
    data = await metrics.get_metrics()
    data["websocket_connections"] = manager.connection_count
    return data


@app.get("/health")
async def health_check():
    """Basic liveness check with DB connectivity."""
    try:
        await db.command("ping")
        db_status = "ok"
    except Exception:
        db_status = "error"
    from core.websocket_manager import manager
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "database": db_status,
        "websocket_connections": manager.connection_count,
    }