# main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import scenario

from core.scheduler import start_scheduler, stop_scheduler

from routers import shipments, risk, reroute, websocket, dashboard, incidents, notifications

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs on startup
    start_scheduler()
    yield
    # Runs on shutdown
    stop_scheduler()


app = FastAPI(
    title="Smart Supply Chain API",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(scenario.router, prefix="/api/scenario")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
from routers import shipments, risk, reroute, websocket, dashboard, incidents

app.include_router(dashboard.router)
app.include_router(shipments.router)
app.include_router(risk.router)
app.include_router(reroute.router)
app.include_router(websocket.router)
app.include_router(incidents.router)
app.include_router(notifications.router)



@app.get("/")
async def root():
    return {"status": "ok", "message": "Smart Supply Chain API is running bruhhh"}