from fastapi import APIRouter, HTTPException, status
from typing import List
from app.schemas.shipment import ShipmentCreate, ShipmentOut
from app.services.shipment import ShipmentService

router = APIRouter(prefix="/api/shipments", tags=["Shipments"])

@router.get("", response_model=List[ShipmentOut])
async def get_shipments():
    """Get all shipments."""
    try:
        return await ShipmentService.get_all_shipments()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch shipments: {str(e)}"
        )

@router.get("/{shipment_id}", response_model=ShipmentOut)
async def get_shipment(shipment_id: str):
    """Get a single shipment by ID."""
    try:
        shipment = await ShipmentService.get_shipment(shipment_id)
        if not shipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")
        return shipment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch shipment: {str(e)}"
        )

from fastapi import BackgroundTasks

@router.post("", response_model=ShipmentOut, status_code=status.HTTP_201_CREATED)
async def create_shipment(shipment: ShipmentCreate, background_tasks: BackgroundTasks):
    """Create a new shipment and trigger background risk evaluation."""
    try:
        return await ShipmentService.create_shipment(shipment, background_tasks)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create shipment: {str(e)}"
        )
