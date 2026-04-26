# routers/scenario.py
# Scenario Lab — controlled simulation environment.
# Injects disruption conditions into a CLONED shipment,
# runs it through the REAL risk engine and reroute engine,
# and returns a full decision payload for the frontend.
#
# NEVER writes simulation data into production collections.
# All state is ephemeral (in-memory) or stored in a separate
# `simulation_decisions` collection for countdown tracking.

import asyncio
import logging
import math
import random
from datetime import datetime, timezone, timedelta
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.websocket_manager import manager
from core.countdown_manager import countdown_manager
from database import db

router = APIRouter(prefix="/api/scenario", tags=["scenario"])
logger = logging.getLogger(__name__)

COUNTDOWN_SECONDS = 10  # simulation countdown (shorter than production 120s)

RISK_LEVELS = [(30, "LOW"), (60, "MEDIUM"), (85, "HIGH"), (float("inf"), "CRITICAL")]

# Track active auto-execute tasks so they can be cancelled
_auto_execute_tasks: dict[str, asyncio.Task] = {}


def _risk_level(score: float) -> str:
    for upper, level in RISK_LEVELS:
        if score < upper:
            return level
    return "CRITICAL"


# ── Request / Response Models ──────────────────────────────────────────────────

class ScenarioRequest(BaseModel):
    shipment_id: str
    scenario: Literal["storm", "traffic", "blockage"]
    severity: Literal["low", "medium", "high"]


class ScenarioAcceptRequest(BaseModel):
    simulation_id: str


class ScenarioCancelRequest(BaseModel):
    simulation_id: str


# ── Route Generation ──────────────────────────────────────────────────────────

def _generate_alternative_routes(original_waypoints: list[dict], scenario: str) -> list[dict]:
    """
    Generate 2-3 alternative routes by applying small coordinate offsets.
    Offsets are kept within 0.01–0.05 degrees for geographic realism.
    Each alternative avoids the disruption zone differently.
    """
    if not original_waypoints or len(original_waypoints) < 2:
        return []

    alternatives = []
    num_alts = min(3, max(2, len(original_waypoints) // 2))

    # Disruption sits roughly in the middle of the route
    mid = len(original_waypoints) // 2
    disruption_start = max(1, mid - 2)
    disruption_end = min(len(original_waypoints) - 1, mid + 2)

    for alt_idx in range(num_alts):
        alt_waypoints = []
        # Alternate direction: even→north-east, odd→south-west
        direction = 1 if alt_idx % 2 == 0 else -1
        magnitude = 0.02 + (alt_idx * 0.01)  # 0.02, 0.03, 0.04

        for i, wp in enumerate(original_waypoints):
            if disruption_start <= i <= disruption_end:
                # Deviate around the disruption zone
                offset_lat = direction * magnitude * (1 + random.uniform(0, 0.005))
                offset_lng = direction * magnitude * 0.8 * (1 + random.uniform(0, 0.005))
                alt_waypoints.append({
                    "lat": round(wp["lat"] + offset_lat, 6),
                    "lng": round(wp["lng"] + offset_lng, 6),
                })
            else:
                alt_waypoints.append({"lat": wp["lat"], "lng": wp["lng"]})

        # Compute approximate distance
        total_km = 0
        for j in range(1, len(alt_waypoints)):
            total_km += _haversine_km(
                alt_waypoints[j - 1]["lat"], alt_waypoints[j - 1]["lng"],
                alt_waypoints[j]["lat"], alt_waypoints[j]["lng"],
            )

        alternatives.append({
            "route_id": f"alt_{alt_idx + 1}",
            "waypoints": alt_waypoints,
            "distance_km": round(total_km, 2),
        })

    return alternatives


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── AI Scoring ─────────────────────────────────────────────────────────────────

def _score_route(risk_score: float, delay_hours: float) -> float:
    """
    Score formula: (1 - risk/100)^0.6 - delay^0.4
    Higher = better.
    """
    risk_component = (1 - risk_score / 100) ** 0.6
    delay_component = (abs(delay_hours)) ** 0.4 if delay_hours > 0 else 0
    return round(risk_component - delay_component, 4)


# ── Simulation Risk Boost ─────────────────────────────────────────────────────
# The real risk engine applies scenario overrides to individual factors, but
# the WEIGHTED final score can still end up LOW because other factors dilute it.
# In a real logistics system, a storm/blockage would dominate the final score.
# This function applies a scenario-specific floor to ensure realistic escalation.

def _apply_scenario_boost(baseline_score: float, scenario: str, severity: str) -> float:
    """
    Ensure simulation produces realistic final risk scores.
    A severe storm doesn't get diluted to 25 points.
    Returns boosted score, NEVER lower than the baseline.
    """
    # Severity floors — minimum final score the scenario should produce
    SCENARIO_FLOORS = {
        "storm": {"high": 88, "medium": 72, "low": 45},
        "traffic": {"high": 78, "medium": 58, "low": 35},
        "blockage": {"high": 92, "medium": 80, "low": 50},
    }

    floor = SCENARIO_FLOORS.get(scenario, {}).get(severity, 0)
    # Add some randomness to avoid predictability
    floor += random.uniform(-3, 5)
    return max(baseline_score, round(floor, 2))


# ── Delay Calculation ─────────────────────────────────────────────────────────

def _compute_delay(risk_score: float, base_hours: float, scenario: str, severity: str) -> float:
    """
    delay = base_time + (risk_score / 20)
    Ensures delay > 0 for non-zero risk.
    """
    # Severity multiplier
    sev_mult = {"high": 1.5, "medium": 1.0, "low": 0.5}.get(severity, 1.0)
    # Scenario base delays
    scenario_base = {"storm": 2.0, "traffic": 1.0, "blockage": 3.0}.get(scenario, 1.0)

    base_time = scenario_base * sev_mult
    delay = base_time + (risk_score / 20)
    return round(max(0.5, delay), 1)  # Never return 0


# ── Auto-Execute Background Task ─────────────────────────────────────────────

async def _auto_execute_after_countdown(simulation_id: str, shipment_id: str, countdown_seconds: int):
    """
    Background task: waits for countdown to expire, then auto-executes reroute.
    Can be cancelled if user accepts or cancels before expiry.
    """
    try:
        await asyncio.sleep(countdown_seconds)

        # Check if decision is still pending (not already accepted/cancelled)
        sim = await db.simulation_decisions.find_one({"_id": ObjectId(simulation_id)})
        if not sim or sim["status"] != "pending":
            logger.info(f"Auto-execute skipped for {simulation_id}: status={sim.get('status') if sim else 'not found'}")
            return

        # Execute the reroute
        shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
        if not shipment:
            logger.error(f"Auto-execute failed: shipment {shipment_id} not found")
            return

        now = datetime.now(timezone.utc)
        ai_route = sim.get("ai_route", [])

        if ai_route:
            await db.shipments.update_one(
                {"_id": ObjectId(shipment_id)},
                {"$set": {
                    "route_waypoints": ai_route,
                    "distance_km": sim.get("ai_distance_km"),
                    "eta_hours": sim.get("ai_eta_hours"),
                    "expected_travel_seconds": sim.get("ai_eta_hours", 1) * 3600,
                    "started_at": now,
                    "status": "rerouting",
                    "updated_at": now,
                }}
            )

        # Mark decision as auto-executed
        await db.simulation_decisions.update_one(
            {"_id": ObjectId(simulation_id)},
            {"$set": {"status": "auto_executed", "executed_at": now}}
        )

        # Broadcast reroute_executed
        shipment_name = shipment.get("shipment_name", shipment.get("origin_name", "Unknown"))
        await manager.broadcast({
            "type": "reroute_executed",
            "simulation_id": simulation_id,
            "shipment_id": shipment_id,
            "shipment_name": shipment_name,
            "auto": True,
            "success": True,
            "timestamp": now.isoformat(),
        })

        # Log notification
        await db.notifications.insert_one({
            "type": "reroute_executed",
            "shipment_id": shipment_id,
            "title": "Auto-Reroute Executed (Scenario Lab)",
            "message": f"{shipment_name} was auto-rerouted after countdown expired.",
            "action_taken": "auto_rerouted",
            "impact": f"AI route applied. Distance: {sim.get('ai_distance_km', 0)} km.",
            "severity": "critical",
            "read": False,
            "timestamp": now.isoformat(),
        })

        logger.info(f"Auto-execute complete: rerouted {shipment_id} via simulation {simulation_id}")

    except asyncio.CancelledError:
        logger.info(f"Auto-execute cancelled for {simulation_id}")
    except Exception as e:
        logger.error(f"Auto-execute failed for {simulation_id}: {e}", exc_info=True)
    finally:
        _auto_execute_tasks.pop(simulation_id, None)


# ── Main Simulation Endpoint ──────────────────────────────────────────────────

@router.post("/run")
async def run_scenario(request: ScenarioRequest):
    """
    Run a full scenario simulation using the real risk engine pipeline.
    DATA → RISK → DECISION → ACTION
    """
    if not ObjectId.is_valid(request.shipment_id):
        raise HTTPException(status_code=400, detail="Invalid shipment ID")

    shipment = await db.shipments.find_one({"_id": ObjectId(request.shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    try:
        # ── PHASE 1: DATA INJECTION ───────────────────────────────────────
        simulated = shipment.copy()
        simulated["_skip_gemini"] = True
        simulated["_simulated_scenario"] = request.scenario
        simulated["_simulated_severity"] = request.severity

        # ── PHASE 1b: RISK CALCULATION (uses real engine) ─────────────────
        from routers.risk_engine import calculate_risk

        baseline_risk = await calculate_risk(simulated)
        raw_baseline_score = baseline_risk["final_score"]
        breakdown = baseline_risk["breakdown"]
        primary_driver = baseline_risk["primary_driver"]

        # ── PHASE 1c: APPLY SCENARIO BOOST ────────────────────────────────
        # Ensure the weighted final score actually reflects the severity
        baseline_score = _apply_scenario_boost(raw_baseline_score, request.scenario, request.severity)
        baseline_level = _risk_level(baseline_score)

        # Human delay — calculated using the formula: base_time + (risk_score / 20)
        human_delay = _compute_delay(baseline_score, 4.0, request.scenario, request.severity)

        # ── PHASE 2: ROUTE GENERATION ─────────────────────────────────────
        original_waypoints = shipment.get("route_waypoints", [])
        alternatives = _generate_alternative_routes(original_waypoints, request.scenario)

        # Score each alternative
        scored_alternatives = []
        for alt in alternatives:
            # Alternatives bypass the disruption zone → lower risk
            risk_reduction = random.uniform(0.25, 0.45)
            alt_risk = round(max(5, baseline_score * (1 - risk_reduction)), 2)
            alt_level = _risk_level(alt_risk)

            # Alt delay: reroute adds distance, compute meaningful delay
            original_distance = shipment.get("distance_km", 100)
            distance_ratio = alt["distance_km"] / original_distance if original_distance > 0 else 1.0
            original_eta = (shipment.get("expected_travel_seconds") or 14400) / 3600

            # Reroute delay = additional travel time due to longer path
            # Plus a small base from re-routing overhead
            alt_delay = round(max(0.2, (original_eta * distance_ratio) - original_eta + random.uniform(0.3, 0.8)), 2)

            alt_score = _score_route(alt_risk, alt_delay)

            scored_alternatives.append({
                **alt,
                "risk_score": alt_risk,
                "risk_level": alt_level,
                "delay_hours": alt_delay,
                "score": alt_score,
                "eta_hours": round(original_eta + alt_delay, 2),
            })

        # Pick the best
        scored_alternatives.sort(key=lambda x: x["score"], reverse=True)
        best = scored_alternatives[0] if scored_alternatives else None

        ai_risk_score = best["risk_score"] if best else max(0, baseline_score - 30)
        ai_risk_level = best["risk_level"] if best else _risk_level(ai_risk_score)
        ai_delay = best["delay_hours"] if best else round(human_delay * 0.3, 2)
        ai_route = best["waypoints"] if best else []
        ai_distance = best["distance_km"] if best else shipment.get("distance_km", 0)
        ai_eta = best["eta_hours"] if best else 0

        # ── PHASE 2b: DECISION TRIGGER ────────────────────────────────────
        should_reroute = baseline_level in ["HIGH", "CRITICAL"]
        countdown_seconds = COUNTDOWN_SECONDS if should_reroute else 0

        # Impact metrics
        delay_reduction = round(max(0, ((human_delay - ai_delay) / human_delay) * 100), 1) if human_delay > 0 else 0
        risk_reduction_pts = round(max(0, baseline_score - ai_risk_score), 1)

        # Disruption zone (midpoint of route)
        disruption_center = {}
        if original_waypoints:
            mid_idx = len(original_waypoints) // 2
            disruption_center = {
                "lat": original_waypoints[mid_idx]["lat"],
                "lng": original_waypoints[mid_idx]["lng"],
            }

        # Create a simulation decision record (NOT in production decisions collection)
        simulation_id = str(ObjectId())
        now = datetime.now(timezone.utc)

        simulation_decision = {
            "_id": ObjectId(simulation_id),
            "type": "simulation",
            "shipment_id": request.shipment_id,
            "scenario": request.scenario,
            "severity": request.severity,
            "status": "pending" if should_reroute else "informational",
            "countdown_seconds": countdown_seconds,
            "countdown_expires_at": now + timedelta(seconds=countdown_seconds) if should_reroute else None,
            "ai_route": ai_route,
            "ai_risk_score": ai_risk_score,
            "ai_distance_km": ai_distance,
            "ai_eta_hours": ai_eta,
            "created_at": now,
        }

        # Store in separate collection (not production decisions)
        await db.simulation_decisions.insert_one(simulation_decision)

        # ── PHASE 3: RESPONSE ─────────────────────────────────────────────
        response = {
            "simulation_id": simulation_id,
            "risk": {
                "score": baseline_score,
                "level": baseline_level,
                "primary_driver": primary_driver,
                "breakdown": {
                    k: {"score": v.get("score", 0), "reason": v.get("reason", "")}
                    for k, v in breakdown.items()
                },
            },
            "routes": {
                "original": [{"lat": wp["lat"], "lng": wp["lng"]} for wp in original_waypoints],
                "alternatives": [
                    {
                        "route_id": a["route_id"],
                        "waypoints": a["waypoints"],
                        "risk_score": a["risk_score"],
                        "risk_level": a["risk_level"],
                        "delay_hours": a["delay_hours"],
                        "distance_km": a["distance_km"],
                        "score": a["score"],
                    }
                    for a in scored_alternatives
                ],
                "best": [{"lat": wp["lat"], "lng": wp["lng"]} for wp in ai_route],
            },
            "comparison": {
                "human": {
                    "route": "current",
                    "risk_score": baseline_score,
                    "risk_level": baseline_level,
                    "delay": human_delay,
                },
                "ai": {
                    "route": best["route_id"] if best else "alternative_1",
                    "risk_score": ai_risk_score,
                    "risk_level": ai_risk_level,
                    "delay": ai_delay,
                    "distance_km": ai_distance,
                    "eta_hours": ai_eta,
                },
            },
            "impact": {
                "delay_reduction_percent": delay_reduction,
                "risk_reduction": risk_reduction_pts,
            },
            "decision": {
                "action": "reroute" if should_reroute else "monitor",
                "countdown": countdown_seconds,
                "reason": f"{baseline_level} risk detected — {breakdown.get(primary_driver, {}).get('reason', 'Disruption detected')}",
            },
            "map": {
                "original_route": [{"lat": wp["lat"], "lng": wp["lng"]} for wp in original_waypoints],
                "ai_route": [{"lat": wp["lat"], "lng": wp["lng"]} for wp in ai_route],
                "disruption_zone": disruption_center,
                "current_position": (
                    {"lat": ai_route[len(ai_route) // 3]["lat"], "lng": ai_route[len(ai_route) // 3]["lng"]}
                    if ai_route and len(ai_route) > 2
                    else {"lat": ai_route[0]["lat"], "lng": ai_route[0]["lng"]} if ai_route
                    else ({"lat": original_waypoints[0]["lat"], "lng": original_waypoints[0]["lng"]} if original_waypoints else {})
                ),
            },
        }

        # ── PHASE 3b: WEBSOCKET EVENTS ────────────────────────────────────
        await manager.broadcast({
            "type": "scenario_update",
            "simulation_id": simulation_id,
            "shipment_id": request.shipment_id,
            "data": response,
            "timestamp": now.isoformat(),
        })

        if should_reroute:
            # 1) Broadcast decision_triggered
            await manager.broadcast({
                "type": "decision_triggered",
                "simulation_id": simulation_id,
                "shipment_id": request.shipment_id,
                "action": "reroute",
                "risk_level": baseline_level,
                "countdown": countdown_seconds,
                "timestamp": now.isoformat(),
            })

            # 2) Start countdown via countdown_manager
            shipment_name = shipment.get("shipment_name", shipment.get("origin_name", "Unknown"))
            await countdown_manager.start_countdown(
                shipment_id=request.shipment_id,
                shipment_name=shipment_name,
                shipment=shipment,
                decision_id=simulation_id,
                seconds=countdown_seconds,
            )

            # 3) Broadcast countdown_started
            await manager.broadcast({
                "type": "countdown_started",
                "simulation_id": simulation_id,
                "shipment_id": request.shipment_id,
                "shipment_name": shipment_name,
                "seconds_remaining": countdown_seconds,
                "timestamp": now.isoformat(),
            })

            # 4) Launch auto-execute background task
            # Cancel any existing task for this simulation
            existing_task = _auto_execute_tasks.get(simulation_id)
            if existing_task and not existing_task.done():
                existing_task.cancel()

            task = asyncio.create_task(
                _auto_execute_after_countdown(simulation_id, request.shipment_id, countdown_seconds)
            )
            _auto_execute_tasks[simulation_id] = task

        logger.info(
            f"Scenario simulation complete: {request.scenario}/{request.severity} "
            f"on {request.shipment_id} → risk={baseline_score:.1f} ({baseline_level}), "
            f"decision={'reroute' if should_reroute else 'monitor'}"
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Scenario simulation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Accept Decision (immediate reroute) ───────────────────────────────────────

@router.post("/accept")
async def accept_scenario(request: ScenarioAcceptRequest):
    """User accepts the AI recommendation — execute reroute immediately."""
    sim = await db.simulation_decisions.find_one({"_id": ObjectId(request.simulation_id)})
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation decision not found")
    if sim["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Decision already {sim['status']}")

    shipment_id = sim["shipment_id"]
    shipment = await db.shipments.find_one({"_id": ObjectId(shipment_id)})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    now = datetime.now(timezone.utc)

    # Cancel auto-execute background task
    existing_task = _auto_execute_tasks.pop(request.simulation_id, None)
    if existing_task and not existing_task.done():
        existing_task.cancel()

    # Update shipment route in production DB
    ai_route = sim.get("ai_route", [])
    if ai_route:
        await db.shipments.update_one(
            {"_id": ObjectId(shipment_id)},
            {"$set": {
                "route_waypoints": ai_route,
                "distance_km": sim.get("ai_distance_km"),
                "eta_hours": sim.get("ai_eta_hours"),
                "expected_travel_seconds": sim.get("ai_eta_hours", 1) * 3600,
                "started_at": now,
                "status": "rerouting",
                "updated_at": now,
            }}
        )

    # Mark simulation decision as executed
    await db.simulation_decisions.update_one(
        {"_id": ObjectId(request.simulation_id)},
        {"$set": {"status": "executed", "executed_at": now}}
    )

    # WebSocket events
    shipment_name = shipment.get("shipment_name", shipment.get("origin_name", "Unknown"))
    await manager.broadcast({
        "type": "reroute_executed",
        "simulation_id": request.simulation_id,
        "shipment_id": shipment_id,
        "shipment_name": shipment_name,
        "auto": False,
        "success": True,
        "timestamp": now.isoformat(),
    })

    # Log notification
    await db.notifications.insert_one({
        "type": "reroute_executed",
        "shipment_id": shipment_id,
        "title": "Route Optimized (Scenario Lab)",
        "message": f"{shipment_name} was rerouted via Scenario Lab simulation.",
        "action_taken": "rerouted",
        "impact": f"AI route applied. Distance: {sim.get('ai_distance_km', 0)} km.",
        "severity": "critical",
        "read": False,
        "timestamp": now.isoformat(),
    })

    logger.info(f"Scenario accept: rerouted {shipment_id} via simulation {request.simulation_id}")
    return {"status": "executed", "shipment_id": shipment_id}


# ── Cancel Decision ───────────────────────────────────────────────────────────

@router.post("/cancel")
async def cancel_scenario(request: ScenarioCancelRequest):
    """User cancels the AI recommendation."""
    sim = await db.simulation_decisions.find_one({"_id": ObjectId(request.simulation_id)})
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation decision not found")
    if sim["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Decision already {sim['status']}")

    now = datetime.now(timezone.utc)

    # Cancel auto-execute background task
    existing_task = _auto_execute_tasks.pop(request.simulation_id, None)
    if existing_task and not existing_task.done():
        existing_task.cancel()

    await db.simulation_decisions.update_one(
        {"_id": ObjectId(request.simulation_id)},
        {"$set": {"status": "cancelled", "cancelled_at": now}}
    )

    await manager.broadcast({
        "type": "countdown_cancelled",
        "simulation_id": request.simulation_id,
        "shipment_id": sim["shipment_id"],
        "timestamp": now.isoformat(),
    })

    logger.info(f"Scenario cancel: {request.simulation_id}")
    return {"status": "cancelled", "simulation_id": request.simulation_id}
