from pydantic import BaseModel, Field

class RiskInput(BaseModel):
    weather: str = Field(..., description="Current weather conditions (e.g., clear, rain, snow, storm)")
    traffic: str = Field(..., description="Current traffic conditions (e.g., light, moderate, heavy)")

class RiskOutput(BaseModel):
    risk_score: float = Field(..., description="Calculated risk score from 0 to 100")
    risk_level: str = Field(..., description="Risk level category: low, medium, or high")
    reason: str = Field(..., description="Explanation of the assigned risk score")
