from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Literal, Any
from datetime import datetime


class Coordinates(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class RiskAssessment(BaseModel):
    final_score: float = Field(..., ge=0, le=100)
    risk_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    primary_driver: str
    breakdown: dict
    computed_at: datetime


class ShipmentCreate(BaseModel):
    shipment_name: str = Field(..., min_length=1, max_length=200)
    origin_name: str = Field(..., min_length=1, max_length=200)
    destination_name: str = Field(..., min_length=1, max_length=200)
    auto_reroute_enabled: bool = False
    # deadline removed — ETA comes from Mappls routing


class ShipmentUpdate(BaseModel):
    current_location: Optional[Coordinates] = None
    status: Optional[Literal["planned", "in_transit", "rerouting", "delivered", "delayed"]] = None
    auto_reroute_enabled: Optional[bool] = None


class ShipmentResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    shipment_name: str
    origin_name: str
    origin_resolved: str
    origin_coords: Coordinates
    destination_name: str
    destination_resolved: str
    destination_coords: Coordinates
    current_location: Optional[Coordinates] = None

    # Route data
    route_waypoints: List[dict] = []
    named_waypoints: List[dict] = []      # with city names
    road_names: List[str] = []            # NH48, SH17 etc
    distance_km: Optional[float] = None
    expected_travel_seconds: Optional[int] = None
    eta_hours: Optional[float] = None

    status: Literal["planned", "in_transit", "rerouting", "delivered", "delayed"]
    auto_reroute_enabled: bool

    # Risk
    last_risk_assessment: Optional[RiskAssessment] = None
    risk_history: List[RiskAssessment] = []
    alerts_triggered: List[dict] = []

    created_at: datetime
    updated_at: datetime


class RiskSnapshot(BaseModel):
    score: float
    level: str
    primary_driver: str
    factors: List[dict]


class CascadeImpact(BaseModel):
    nodes_affected: int
    total_delay_hours: float


class DecisionCreate(BaseModel):
    shipment_id: str
    type: Literal["auto_reroute", "manual_reroute"]
    status: Literal["pending", "executed", "cancelled"]
    risk_snapshot: RiskSnapshot
    cascade_impact: CascadeImpact
    reason_summary: str
    confidence_score: float
    proposed_route_id: str
    countdown_expires_at: Optional[datetime] = None


class DecisionResponse(DecisionCreate):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    created_at: datetime
    executed_at: Optional[datetime] = None

if __name__ == "__main__":
    sample = {
        "shipment_name": "Test Shipment",
        "origin_name": "Surat",
        "destination_name": "Kalol",
    }
    shipment = ShipmentCreate(**sample)
    print(shipment.model_dump())