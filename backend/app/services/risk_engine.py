class RiskEngine:
    """Core logic for calculating supply chain risks based on environmental inputs."""

    @classmethod
    def evaluate(cls, weather: str, traffic: str) -> dict:
        score = 0.0
        reasons = []

        # Weather evaluation
        weather_lower = weather.lower()
        if any(w in weather_lower for w in ["storm", "hurricane", "tornado", "typhoon"]):
            score += 60.0
            reasons.append("Severe weather alerts active")
        elif any(w in weather_lower for w in ["snow", "blizzard", "ice"]):
            score += 40.0
            reasons.append("Hazardous icy/snowy conditions")
        elif "rain" in weather_lower:
            score += 20.0
            reasons.append("Reduced visibility and wet roads due to rain")
        elif "fog" in weather_lower:
            score += 15.0
            reasons.append("Reduced visibility due to fog")

        # Traffic evaluation
        traffic_lower = traffic.lower()
        if any(t in traffic_lower for t in ["heavy", "jam", "standstill", "accident", "closure"]):
            score += 40.0
            reasons.append("Critical traffic congestion or road closure")
        elif "moderate" in traffic_lower:
            score += 15.0
            reasons.append("Moderate traffic delays expected")

        # Cap score at 100
        score = min(score, 100.0)

        # Determine level
        if score < 30:
            level = "low"
        elif score < 70:
            level = "medium"
        else:
            level = "high"

        return {
            "risk_score": score,
            "risk_level": level,
            "reason": " | ".join(reasons) if reasons else "Optimal conditions"
        }
