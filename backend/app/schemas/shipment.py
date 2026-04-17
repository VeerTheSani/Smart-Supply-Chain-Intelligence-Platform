from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Any

class LatLng(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None

class RouteInfo(BaseModel):
    waypoints: List[Any] = []
    expected_travel_seconds: Optional[int] = None
    polyline: Optional[str] = None

class ConditionsInfo(BaseModel):
    weather: str = "clear"
    traffic: str = "low"

class RiskAssessment(BaseModel):
    timestamp: datetime
    risk_score: float
    risk_level: str
    reason: str

class RiskInfo(BaseModel):
    current: Optional[RiskAssessment] = None
    history: List[RiskAssessment] = []

class SettingsInfo(BaseModel):
    auto_reroute_enabled: bool = False

class AlertInfo(BaseModel):
    timestamp: datetime
    message: str
    level: str

class ShipmentBase(BaseModel):
    tracking_number: str = Field(..., description="Unique tracking number for the shipment")
    origin: str = Field(..., description="Starting location")
    destination: str = Field(..., description="Final destination")
    status: str = Field(default="pending", description="Current status: pending, in_transit, delivered, delayed")
    
    current_location: Optional[LatLng] = None
    route: Optional[RouteInfo] = None
    conditions: Optional[ConditionsInfo] = None
    settings: Optional[SettingsInfo] = None
    risk: Optional[RiskInfo] = None
    alerts: List[AlertInfo] = []

class ShipmentCreate(BaseModel):
    tracking_number: str
    origin: str
    destination: str
    status: str = "pending"
    conditions: Optional[ConditionsInfo] = None

class ShipmentOut(ShipmentBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
