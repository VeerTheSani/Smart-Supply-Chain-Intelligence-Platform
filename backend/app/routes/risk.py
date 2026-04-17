from fastapi import APIRouter
from app.schemas.risk import RiskInput, RiskOutput
from app.services.risk_engine import RiskEngine

router = APIRouter(prefix="/api/risk", tags=["Risk Engine"])

@router.post("/evaluate", response_model=RiskOutput)
async def evaluate_risk(data: RiskInput):
    """
    Evaluate shipment disruption risk based on external factors like weather and traffic.
    """
    result = RiskEngine.evaluate(weather=data.weather, traffic=data.traffic)
    return RiskOutput(**result)

from fastapi import HTTPException, status
from app.services.shipment import ShipmentService

@router.get("/{shipment_id}")
async def get_shipment_risk(shipment_id: str):
    """Get the risk assessment history for a specific shipment."""
    try:
        shipment = await ShipmentService.get_shipment(shipment_id)
        if not shipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")
        return {
            "id": shipment.id,
            "tracking_number": shipment.tracking_number,
            "risk": shipment.risk,
            "alerts": shipment.alerts
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch risk assessment: {str(e)}"
        )
