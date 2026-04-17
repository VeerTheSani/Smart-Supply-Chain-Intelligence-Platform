from pydantic import BaseModel, Field
from typing import List, Optional

class RouteAlternative(BaseModel):
    route_id: str
    type: str = Field(..., description="Fast but Risky, Balanced, Safe but Slow")
    risk_level: str
    risk_score: float
    eta: int = Field(..., description="Estimated time of arrival in seconds")
    distance: float = Field(..., description="Distance in km")
    score: float = Field(..., description="Calculated weighted decision score")

class CurrentRouteInfo(BaseModel):
    risk_level: str
    risk_score: float
    eta: Optional[int] = None
    distance: Optional[float] = None

class ReroutingResponse(BaseModel):
    shipment_id: str
    current_route: CurrentRouteInfo
    alternatives: List[RouteAlternative]
    recommended_route: str
    reason: str
    reroute_suggested: bool
