"""
Smart Supply Chain API — FastAPI Entry Point.

Production-level, scalable supply chain intelligence backend.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.database import Database
from app.routes.health import router as health_router
from app.routes.dashboard import router as dashboard_router
from app.services.monitoring import MonitoringService

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle — connect/disconnect MongoDB and start schedulers."""
    print("🚀 Starting Smart Supply Chain API...")
    await Database.connect()
    MonitoringService.start()
    yield
    MonitoringService.stop()
    await Database.disconnect()
    print("👋 Smart Supply Chain API shut down.")


# Create FastAPI application
app = FastAPI(
    title="Smart Supply Chain API",
    description="Real-time disruption detection, risk scoring, and route optimization",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENV == "development" else None,
    redoc_url="/redoc" if settings.ENV == "development" else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health_router)
from app.routes.shipments import router as shipments_router
app.include_router(shipments_router)
from app.routes.risk import router as risk_router
app.include_router(risk_router)
app.include_router(dashboard_router)
from app.routes.websockets import router as ws_router
app.include_router(ws_router)
from app.routes.rerouting import router as reroute_router
app.include_router(reroute_router)

print("CORS:", settings.cors_origins_list)
@app.get("/")
async def root():
    """API root — basic info."""
    return {
        "service": "Smart Supply Chain API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs" if settings.ENV == "development" else "disabled",
    }
