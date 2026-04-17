"""
Health check route — verifies API and MongoDB status.
"""

from fastapi import APIRouter
from app.core.database import Database

router = APIRouter(prefix="/api/health", tags=["Health"])


@router.get("")
async def health_check():
    """Basic health check endpoint."""
    db_status = "connected"
    try:
        if Database.client:
            await Database.client.admin.command("ping")
        else:
            db_status = "disconnected"
    except Exception:
        db_status = "error"

    return {
        "status": "healthy",
        "database": db_status,
        "service": "smart-supply-chain-api",
    }
