from fastapi import APIRouter, HTTPException, status
from app.services.dashboard import DashboardService

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("")
async def get_dashboard_overview():
    """Get system-wide analytics overview for the dashboard."""
    try:
        return await DashboardService.get_overview()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dashboard analytics: {str(e)}"
        )
