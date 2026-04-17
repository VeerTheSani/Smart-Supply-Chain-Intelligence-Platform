from app.services.shipment import ShipmentService
from app.services.risk_engine import RiskEngine
from app.schemas.rerouting import ReroutingResponse, RouteAlternative, CurrentRouteInfo

class ReroutingService:
    @classmethod
    async def evaluate_reroute(cls, shipment_id: str) -> ReroutingResponse:
        """
        Smart rerouting and decision engine for evaluating route safety.
        Implements a weighted scoring formula favoring safest yet fastest paths.
        """
        shipment = await ShipmentService.get_shipment(shipment_id)
        if not shipment:
            return None

        # Fetch current risk constraints
        current_risk = shipment.risk.current if shipment.risk and shipment.risk.current else None
        current_risk_score = current_risk.risk_score if current_risk else 0.0
        current_risk_level = current_risk.risk_level if current_risk else "low"

        # Safe defaults if no active distance/eta available natively
        base_distance = 1200.0  # km
        base_eta = 86400  # 24 hours in seconds

        # 1. Route Generation Simulated
        routes_data = [
            {
                "route_id": "A",
                "type": "Fast but Risky",
                "conditions": {"weather": "storm", "traffic": "heavy traffic"},
                "eta": int(base_eta * 0.8),
                "distance": base_distance * 0.9
            },
            {
                "route_id": "B",
                "type": "Balanced",
                "conditions": {"weather": "rain", "traffic": "moderate traffic"},
                "eta": int(base_eta * 1.0),
                "distance": base_distance * 1.0
            },
            {
                "route_id": "C",
                "type": "Safe but Slow",
                "conditions": {"weather": "clear", "traffic": "low"},
                "eta": int(base_eta * 1.3),
                "distance": base_distance * 1.1
            }
        ]

        alternatives = []
        for r_data in routes_data:
            # 2. Risk Evaluation via Existing Service
            risk_result = RiskEngine.evaluate(r_data["conditions"]["weather"], r_data["conditions"]["traffic"])
            
            # 3. Scoring System
            # Normalize time: simple percent scaling. Suppose 1.5x base is 100% boundary.
            norm_time = (r_data["eta"] / (base_eta * 1.5)) * 100.0
            
            # Weights defined
            risk_weight = 0.7
            time_weight = 0.3
            
            score = (risk_weight * risk_result["risk_score"]) + (time_weight * norm_time)
            
            alternatives.append(
                RouteAlternative(
                    route_id=r_data["route_id"],
                    type=r_data["type"],
                    risk_level=risk_result["risk_level"],
                    risk_score=risk_result["risk_score"],
                    eta=r_data["eta"],
                    distance=round(r_data["distance"], 1),
                    score=round(score, 2)
                )
            )

        # Output formatting & Decision selection
        # Lowest score is the best combination of safety and speed.
        best_route = min(alternatives, key=lambda x: x.score)

        reroute_suggested = False
        reason = f"Route {best_route.route_id} provides the lowest combined risk and expected travel time."

        if current_risk_level == "high":
            reroute_suggested = True
            reason = f"CRITICAL: Current route risk is HIGH. Reroute mandatory. {reason}"

        return ReroutingResponse(
            shipment_id=shipment_id,
            current_route=CurrentRouteInfo(
                risk_level=current_risk_level,
                risk_score=current_risk_score,
                eta=base_eta,
                distance=base_distance
            ),
            alternatives=alternatives,
            recommended_route=best_route.route_id,
            reason=reason,
            reroute_suggested=reroute_suggested
        )
