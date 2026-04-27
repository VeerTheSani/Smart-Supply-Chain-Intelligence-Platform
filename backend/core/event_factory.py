# core/event_factory.py
"""
Strict event contract factory.
Ensures EVERY WebSocket message has:
  - type (required)
  - source (required): "REAL_SYSTEM" | "SIMULATOR"
  - timestamp (required)
  - All required fields based on type
"""

from datetime import datetime, timezone
from typing import Literal, Optional, Any
import logging

logger = logging.getLogger(__name__)


def _utc_now() -> str:
    """Get current UTC time as ISO string."""
    return datetime.now(timezone.utc).isoformat()


def create_risk_alert(
    shipment_id: str,
    shipment_name: str,
    level: Literal["low", "medium", "high", "critical"],
    message: str,
    score: float,
    primary_driver: str,
    source: Literal["REAL_SYSTEM", "SIMULATOR"],
    previous_level: Optional[str] = None,
    auto_rerouted: bool = False,
) -> dict:
    """
    Create a risk alert message.
    
    SAFETY: Frontend MUST validate:
      - source == "SIMULATOR" → SIM alerts only
      - source == "REAL_SYSTEM" → REAL alerts only
    """
    return {
        "type": "risk_alert",
        "source": source,
        "timestamp": _utc_now(),
        "shipment_id": shipment_id,
        "shipment_name": shipment_name,
        "level": level.lower(),
        "message": message,
        "score": score,
        "primary_driver": primary_driver,
        "previous_level": (previous_level or "unknown").lower(),
        "auto_rerouted": auto_rerouted,
    }


def create_countdown_started(
    shipment_id: str,
    shipment_name: str,
    seconds_remaining: int,
    source: Literal["REAL_SYSTEM", "SIMULATOR"],
) -> dict:
    """Countdown timer started for auto-reroute decision."""
    return {
        "type": "countdown_started",
        "source": source,
        "timestamp": _utc_now(),
        "shipment_id": shipment_id,
        "shipment_name": shipment_name,
        "seconds_remaining": seconds_remaining,
    }


def create_countdown_update(
    shipment_id: str,
    shipment_name: str,
    seconds_remaining: int,
    source: Literal["REAL_SYSTEM", "SIMULATOR"],
) -> dict:
    """Countdown timer tick."""
    return {
        "type": "countdown_update",
        "source": source,
        "timestamp": _utc_now(),
        "shipment_id": shipment_id,
        "shipment_name": shipment_name,
        "seconds_remaining": seconds_remaining,
    }


def create_countdown_cancelled(
    shipment_id: str,
    source: Literal["REAL_SYSTEM", "SIMULATOR"],
    reason: str = "Risk dropped below threshold",
) -> dict:
    """Countdown cancelled (risk improved or decision taken)."""
    return {
        "type": "countdown_cancelled",
        "source": source,
        "timestamp": _utc_now(),
        "shipment_id": shipment_id,
        "reason": reason,
    }


def create_reroute_executed(
    shipment_id: str,
    shipment_name: str,
    source: Literal["REAL_SYSTEM", "SIMULATOR"],
    success: bool,
    reason: str = "Auto-reroute applied",
) -> dict:
    """Reroute decision executed (auto or manual)."""
    return {
        "type": "reroute_executed",
        "source": source,
        "timestamp": _utc_now(),
        "shipment_id": shipment_id,
        "shipment_name": shipment_name,
        "success": success,
        "reason": reason,
    }


def create_decision_triggered(
    shipment_id: str,
    shipment_name: str,
    source: Literal["REAL_SYSTEM", "SIMULATOR"],
    decision_type: str = "auto_reroute",
    risk_level: str = "high",
) -> dict:
    """Decision engine triggered (SIM scenario or REAL alert)."""
    return {
        "type": "decision_triggered",
        "source": source,
        "timestamp": _utc_now(),
        "shipment_id": shipment_id,
        "shipment_name": shipment_name,
        "decision_type": decision_type,
        "risk_level": risk_level,
    }


def create_scenario_update(
    scenario_id: str,
    scenario_name: str,
    status: Literal["running", "completed", "failed"],
    message: str,
) -> dict:
    """Scenario Lab status update (SIM only)."""
    return {
        "type": "scenario_update",
        "source": "SIMULATOR",
        "timestamp": _utc_now(),
        "scenario_id": scenario_id,
        "scenario_name": scenario_name,
        "status": status,
        "message": message,
    }


def validate_message(msg: dict) -> tuple[bool, Optional[str]]:
    """
    Validate a message has required fields.
    Returns (is_valid, error_message)
    """
    if not isinstance(msg, dict):
        return False, "Message must be a dict"
    
    required = ["type", "source", "timestamp"]
    for field in required:
        if field not in msg:
            return False, f"Missing required field: {field}"
    
    msg_type = msg.get("type")
    source = msg.get("source")
    
    # Validate source
    if source not in ["REAL_SYSTEM", "SIMULATOR"]:
        return False, f"Invalid source: {source} (must be REAL_SYSTEM or SIMULATOR)"
    
    # Validate type
    valid_types = [
        "risk_alert",
        "countdown_started",
        "countdown_update", 
        "countdown_cancelled",
        "reroute_executed",
        "decision_triggered",
        "scenario_update",
    ]
    if msg_type not in valid_types:
        return False, f"Unknown message type: {msg_type}"
    
    # Type-specific validation
    if msg_type == "risk_alert":
        required_fields = ["shipment_id", "shipment_name", "level", "message", "score"]
        for field in required_fields:
            if field not in msg:
                return False, f"risk_alert missing: {field}"
    
    return True, None
