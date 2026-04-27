
# services/gemini_service.py
# Uses Gemini 2.5 Flash with Google Search grounding to find
# real-time disruptions along the route.
# Called by risk_engine.py for the "events" factor.

import httpx
import os
import json
import logging
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"


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
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not set in .env")
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
            {"google_search": {}}   # enables web grounding
        ],
        "generationConfig": {
            "temperature": 0.1,     # low temp for factual accuracy
            "maxOutputTokens":4048,
        }
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                GEMINI_URL,
                params={"key": GEMINI_API_KEY},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        # Extract text from response
        text = (
            data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
        )

        if not text:
            logger.warning("Gemini returned empty response")
            return _default_response("Empty response from Gemini")

        # Clean up response — remove markdown fences if present
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

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
    planned_date: str,          # "YYYY-MM-DD"
    risk_level: str = "low",    # used only to pick cache TTL
) -> dict:
    """
    Search for disturbances on specific highway numbers near a planned date.
    Returns {"score": float 0-100, "reason": str}
    Score guide: 0=clear, 20=minor works, 40=moderate, 60=significant, 80+=blocked
    Falls back to {"score": 0, "reason": "unavailable"} on any error.
    """
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not set in .env")
        return {"score": 0, "reason": "unavailable"}

    if not road_names:
        return {"score": 0, "reason": "No road names available"}

    from services.cache import road_disturbance_cache
    import re as _re

    ttl       = 600 if risk_level in ("high", "critical") else 1800
    cache_key = f"road_dist:{'|'.join(sorted(road_names))}:{planned_date}"

    cached = road_disturbance_cache.get(cache_key)
    if cached is not None:
        logger.debug(f"Road disturbance cache hit for {cache_key}")
        return cached

    roads_str = ", ".join(road_names)
    prompt = f"""You are a road intelligence analyst for Indian logistics.

Search for disturbances on these specific highways on or near {planned_date}:
Roads: {roads_str}

Look for:
- Road closures or construction blocks on these highway numbers
- Flooding or landslides affecting these corridors
- Protests, bandh, or strikes specifically on these roads
- Major accident-based closures reported in news

Respond ONLY with this exact JSON, nothing else:
{{
  "score": <0-100, 0=no issues, 20=minor works, 40=moderate disruption, 60=significant, 80=major blockage>,
  "reason": "<one concise sentence, or 'No road disturbances found' if clear>"
}}"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 256},
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                GEMINI_URL,
                params={"key": GEMINI_API_KEY},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        text = (
            data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
        )

        if not text:
            logger.warning("Gemini road disturbance: empty response")
            return {"score": 0, "reason": "unavailable"}

        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()
        text = _re.sub(r':\s*"([^"]*)\n([^"]*)"', lambda m: ': "' + m.group(1).strip() + ' ' + m.group(2).strip() + '"', text)

        result = json.loads(text)
        result.setdefault("score", 0)
        result.setdefault("reason", "No road disturbances found")
        result["score"] = float(max(0, min(100, result["score"])))

        logger.info(f"Road disturbance: score={result['score']} | {result['reason'][:80]}")
        road_disturbance_cache.set(cache_key, result, ttl=ttl)
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Road disturbance JSON parse error: {e} | text: {text[:200]}")
        return {"score": 0, "reason": "unavailable"}
    except httpx.TimeoutException:
        logger.error("Road disturbance Gemini request timed out")
        return {"score": 0, "reason": "unavailable"}
    except httpx.HTTPError as e:
        logger.error(f"Road disturbance Gemini HTTP error: {e}")
        return {"score": 0, "reason": "unavailable"}
    except Exception as e:
        logger.error(f"Road disturbance unexpected error: {e}")
        return {"score": 0, "reason": "unavailable"}


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