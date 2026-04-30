import time
from datetime import datetime, timezone
from fastapi import APIRouter
from core.websocket_manager import manager
from core.scheduler import scheduler
from database import client

router = APIRouter(prefix="/api/system", tags=["system"])

_app_start = time.monotonic()


@router.get("/status")
async def get_system_status():
    uptime_seconds = round(time.monotonic() - _app_start, 1)
    try:
        await client.admin.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "error"

    return {
        "uptime_seconds": uptime_seconds,
        "ws_connections": manager.connection_count,
        "scheduler_running": scheduler.running,
        "db_status": db_status,
        "snapshot_at": datetime.now(timezone.utc).isoformat(),
    }
