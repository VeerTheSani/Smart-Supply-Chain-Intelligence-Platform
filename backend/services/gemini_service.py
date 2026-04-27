
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