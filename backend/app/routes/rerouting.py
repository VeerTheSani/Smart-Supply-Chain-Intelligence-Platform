from fastapi import APIRouter, HTTPException, status
from app.schemas.rerouting import ReroutingResponse
from app.services.rerouting import ReroutingService

router = APIRouter(prefix="/api/reroute", tags=["Rerouting Engine"])

@router.get("/{shipment_id}", response_model=ReroutingResponse)
async def get_shipment_reroute_options(shipment_id: str):
    """
    Run full analytics smart-rerouting algorithm.
    Retrieves current shipment status, assesses alternatives, and scores safety vs ETA metrics.
    """
    try:
        response = await ReroutingService.evaluate_reroute(shipment_id)
        if not response:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")
        return response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate rerouting data: {str(e)}"
        )
