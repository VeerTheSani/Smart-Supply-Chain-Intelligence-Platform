# main.py
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.scheduler import start_scheduler, stop_scheduler
from database import db
from routers import shipments, risk, reroute, websocket, dashboard, incidents, notifications, scenario, cascade


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Create indexes on startup for dedup + query performance
    await db.shipments.create_index("tracking_number", unique=True, sparse=True)
    await db.notifications.create_index(
        [("shipment_id", 1), ("type", 1), ("timestamp", -1)]
    )
    await db.decisions.create_index(
        [("shipment_id", 1), ("status", 1)]
    )
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="Smart Supply Chain API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS — env-configurable, defaults to localhost dev origins ─────────────────
_cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=True,
)

# ── Rate limiting — 120 requests/min per IP, sliding window ───────────────────
_req_log: dict[str, list] = defaultdict(list)
_RATE_LIMIT = 120
_RATE_WINDOW = 60  # seconds


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if request.url.path.startswith("/ws"):
        return await call_next(request)
    ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    now = time.monotonic()
    _req_log[ip] = [t for t in _req_log[ip] if now - t < _RATE_WINDOW]
    if len(_req_log[ip]) >= _RATE_LIMIT:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Try again shortly."},
        )
    _req_log[ip].append(now)
    return await call_next(request)


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(scenario.router, prefix="/api/scenario")
app.include_router(dashboard.router)
app.include_router(shipments.router)
app.include_router(risk.router)
app.include_router(reroute.router)
app.include_router(websocket.router)
app.include_router(incidents.router)
app.include_router(notifications.router)
app.include_router(cascade.router)


@app.get("/")
async def root():
    return {"status": "ok", "message": "Smart Supply Chain API is running bruhhh"}