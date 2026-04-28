
# services/gemini_service.py
# Uses Gemini 2.5 Flash with Google Search grounding to find
# real-time disruptions along the route.
# Called by risk_engine.py for the "events" factor.

import httpx
import os
import json
import re
import logging
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

def _get_api_key():
    # Dynamically reload from .env so user changes take effect immediately without restarting the backend
    load_dotenv(override=True)
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        logger.error("GEMINI_API_KEY not set in .env")
    return key


async def get_route_events(
    origin: str,
    destination: str,
    segment_cities: list[str],
    eta_hours: float,
    road_names: list[str] = None,   # ← NH48, SH17 etc
) -> dict:
    """
    Ask Gemini to search for any disruptions along the route.
    """
    api_key = _get_api_key()
    if not api_key:
        return _default_response("Gemini API key not configured")

    cities_str = ", ".join(segment_cities) if segment_cities else "route"
    roads_str  = ", ".join(road_names) if road_names else "highway route"

    prompt = f"""You are a logistics risk analyst for an Indian supply chain company.

Search for ANY current disruptions affecting this truck route:
Route: {origin} → {destination}
Roads: {roads_str}
Passing through: {cities_str}
Journey time: {eta_hours} hours

Search for:
- Road closures or blockages on {roads_str}
- Strikes, protests, bandh affecting transport
- Floods, landslides, or weather disasters
- Major accidents blocking highways
- Political events causing road disruptions
- Religious gatherings causing congestion

Time window: next {int(eta_hours) + 2} hours from now.

Respond ONLY with this exact JSON format, nothing else:
{{
    "severity_score": <number 0-100, 0=no disruptions, 100=route completely blocked>,
    "events_found": [
        {{
            "type": "<protest/flood/accident/closure/strike/gathering/other>",
            "location": "<city or highway name>",
            "description": "<one sentence description>",
            "impact": "<HIGH/MEDIUM/LOW>"
        }}
    ],
    "primary_concern": "<one sentence summary, or 'No disruptions found' if none>",
    "confidence": "<HIGH/MEDIUM/LOW>"
}}

If no disruptions found, return severity_score 0 and empty events_found array."""

    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "tools": [
            {"googleSearch": {}}   # enables web grounding
        ],
        "generationConfig": {
            "temperature": 0.1,     # low temp for factual accuracy
            "maxOutputTokens":4048,
        }
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                GEMINI_URL,
                params={"key": api_key},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        # Extract all text parts since Search Grounding may return prose or citations alongside the JSON
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        combined_text = "".join([p.get("text", "") for p in parts if p.get("text")])

        if not combined_text:
            logger.warning("Gemini returned empty response")
            return _default_response("Empty response from Gemini")

        # Extract JSON using Regex in case it is wrapped in prose
        import re
        json_match = re.search(r'\{.*\}', combined_text, re.DOTALL)
        if json_match:
            text = json_match.group(0)
        else:
            text = combined_text

        # Fix newlines inside JSON string values — Gemini sometimes does this
        import re
        text = re.sub(r':\s*"([^"]*)\n([^"]*)"', lambda m: ': "' + m.group(1).strip() + ' ' + m.group(2).strip() + '"', text)

        result = json.loads(text)
        # Validate required fields
        result.setdefault("severity_score", 0)
        result.setdefault("events_found", [])
        result.setdefault("primary_concern", "No disruptions found")
        result.setdefault("confidence", "LOW")

        logger.info(
            f"Gemini events: score={result['severity_score']} | "
            f"{len(result['events_found'])} events | "
            f"{result['primary_concern'][:60]}"
        )
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Gemini JSON parse error: {e} | text: {text[:200]}")
        return _default_response("Could not parse Gemini response")
    except httpx.TimeoutException:
        logger.error("Gemini request timed out")
        return _default_response("Gemini timed out")
    except httpx.HTTPError as e:
        logger.error(f"Gemini HTTP error: {e}")
        return _default_response(f"Gemini API error: {e}")
    except Exception as e:
        logger.error(f"Gemini unexpected error: {e}")
        return _default_response(str(e))

def _default_response(reason: str) -> dict:
    """Safe fallback when Gemini fails — neutral score, don't crash risk engine."""
    return {
        "severity_score": 0,
        "events_found":   [],
        "primary_concern": f"Event analysis unavailable: {reason}",
        "confidence":     "LOW",
    }


# ── Road disturbance score (historical factor) ─────────────────────────────────

async def get_road_disturbance_score(
    road_names: list[str],
    planned_date: str,
    risk_level: str = "low",
    origin: str = "",
    destination: str = "",
    via_points: list[str] = [],
    force_refresh: bool = False,
) -> dict:
    """
    Search for disturbances on specific highway numbers near a planned date.
    Returns {"score", "reason", "incident_location", "safe_waypoint"}
    safe_waypoint is a bypass city name only when score >= 40, else empty string.
    Falls back to {"score": 0, "reason": "unavailable", ...} on any error.
    """
    api_key = _get_api_key()
    if not api_key:
        return _disturbance_fallback("unavailable")

    if not road_names:
        return _disturbance_fallback("No road names available")

    from services.cache import road_disturbance_cache
    import re as _re

    ttl       = 600 if risk_level in ("high", "critical") else 1800
    route_key = f"{origin}>{destination}"
    cache_key = f"road_dist:{'|'.join(sorted(road_names))}:{planned_date}:{route_key}"

    if not force_refresh:
        cached = road_disturbance_cache.get(cache_key)
        if cached is not None:
            logger.debug(f"Road disturbance cache hit for {cache_key}")
            return cached

    roads_str = ", ".join(road_names)
    stops_str = " → ".join(via_points) if via_points else ""
    route_display = f"{origin} → {stops_str} → {destination}" if stops_str else f"{origin} → {destination}"

    prompt = f"""You are a road intelligence analyst for Indian logistics.

Route: {route_display}
Highways: {roads_str}
Travel date: {planned_date}

Search for disturbances on these specific highways:
- Road closures or construction blocks on these highway numbers
- Flooding or landslides affecting these corridors
- Protests, bandh, or strikes specifically on these roads
- Major accident-based closures reported in news

Respond ONLY with this exact JSON, nothing else:
{{
  "score": <0-100, 0=no issues, 20=minor works, 40=moderate disruption, 60=significant, 80=major blockage>,
  "reason": "<one concise sentence, or 'No road disturbances found' if clear>",
  "incident_location": "<city or highway stretch where the problem is, empty string if none>",
  "safe_waypoint": "<nearest real Indian city on a parallel corridor between {origin} and {destination} that avoids the incident, empty string if score < 40>"
}}

If score < 40, safe_waypoint and incident_location must be empty strings."""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"googleSearch": {}}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 8192},
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                GEMINI_URL,
                params={"key": api_key},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        combined_text = "".join([p.get("text", "") for p in parts if p.get("text")])

        if not combined_text:
            logger.warning("Gemini road disturbance: empty response")
            return _disturbance_fallback("unavailable")

        import re
        json_match = re.search(r'\{.*\}', combined_text, re.DOTALL)
        if json_match:
            text = json_match.group(0)
        else:
            text = combined_text
        text = re.sub(r':\s*"([^"]*)\n([^"]*)"', lambda m: ': "' + m.group(1).strip() + ' ' + m.group(2).strip() + '"', text)

        result = json.loads(text)
        result.setdefault("score", 0)
        result.setdefault("reason", "No road disturbances found")
        result.setdefault("incident_location", "")
        result.setdefault("safe_waypoint", "")
        result["score"] = float(max(0, min(100, result["score"])))

        # Guard: clear bypass fields if score is low (prevents hallucinated waypoints)
        if result["score"] < 40:
            result["safe_waypoint"]     = ""
            result["incident_location"] = ""

        logger.info(
            f"Road disturbance: score={result['score']} | {result['reason'][:60]}"
            + (f" | bypass via {result['safe_waypoint']}" if result["safe_waypoint"] else "")
        )
        road_disturbance_cache.set(cache_key, result, ttl=ttl)
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Road disturbance JSON parse error: {e} | text: {text[:200]}")
        return _disturbance_fallback("unavailable")
    except httpx.TimeoutException:
        logger.error("Road disturbance Gemini request timed out")
        return _disturbance_fallback("unavailable")
    except httpx.HTTPError as e:
        logger.error(f"Road disturbance Gemini HTTP error: {e}")
        return _disturbance_fallback("unavailable")
    except Exception as e:
        logger.error(f"Road disturbance unexpected error: {e}")
        return _disturbance_fallback("unavailable")

def _disturbance_fallback(reason: str) -> dict:
    return {"score": 0, "reason": reason, "incident_location": "", "safe_waypoint": ""}


# ── Self test ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio

    async def test():
        print("Testing Gemini events service...")
        print("Searching for disruptions on Ahmedabad → Delhi route...\n")

        result = await get_route_events(
            origin="Ahmedabad",
            destination="Delhi",
            segment_cities=["Vadodara", "Udaipur", "Ajmer", "Jaipur"],
            eta_hours=12.0,
            road_names=["NH48", "NH8"],
        )

        print(f"Severity score  : {result['severity_score']}/100")
        print(f"Primary concern : {result['primary_concern']}")
        print(f"Confidence      : {result['confidence']}")
        print(f"Events found    : {len(result['events_found'])}")
        for event in result["events_found"]:
            print(f"\n  Type     : {event.get('type')}")
            print(f"  Location : {event.get('location')}")
            print(f"  Details  : {event.get('description')}")
            print(f"  Impact   : {event.get('impact')}")

    asyncio.run(test())

    async def test_road_disturbance():
        from datetime import date
        print("\n\nTesting road disturbance score...")
        result = await get_road_disturbance_score(
            road_names=["NH48", "NH8"],
            planned_date=date.today().isoformat(),
            risk_level="low",
        )
        print(f"Score  : {result['score']}/100")
        print(f"Reason : {result['reason']}")

    asyncio.run(test_road_disturbance())