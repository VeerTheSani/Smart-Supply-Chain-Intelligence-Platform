# services/geocoding_service - converting place names to coordinates and vice versa using TomTom API
import os
import httpx
import logging
from urllib.parse import quote
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

TOMTOM_KEY = os.getenv("TOMTOM_KEY")
if not TOMTOM_KEY:
    logger.error("TOMTOM_KEY missing! Geocoding will fail.")

async def geocode(place_name: str) -> dict:
    """Convert a place name (city, address) into latitude and longitude using TomTom."""
    if not TOMTOM_KEY:
        raise RuntimeError("TomTom API key not configured")

    try:
        # TomTom Geocode API: /search/2/geocode/{query}.json
        url = f"https://api.tomtom.com/search/2/geocode/{quote(place_name)}.json"
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                url,
                params={
                    "key": TOMTOM_KEY,
                    "limit": 1,
                    "countrySet": "IN", # Restrict to India for relevance
                }
            )
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])
        if not results:
            raise ValueError(f"Could not geocode '{place_name}' — place not found")

        pos = results[0]["position"]
        return {
            "lat": float(pos["lat"]),
            "lng": float(pos["lon"]),
            "display_name": results[0].get("address", {}).get("freeformAddress", place_name),
        }

    except ValueError:
        raise
    except httpx.TimeoutException:
        logger.error(f"TomTom timeout for '{place_name}'")
        raise RuntimeError(f"Geocoding timed out for '{place_name}'")
    except httpx.HTTPError as e:
        logger.error(f"TomTom HTTP error for '{place_name}': {e}")
        raise RuntimeError(f"Geocoding failed for '{place_name}'")


async def reverse_geocode(lat: float, lng: float) -> str:
    """Return a short place name for coordinates (city or district level) using TomTom."""
    if not TOMTOM_KEY:
        return f"{lat:.2f},{lng:.2f}"

    try:
        # TomTom Reverse Geocode API: /search/2/reverseGeocode/{position}.json
        url = f"https://api.tomtom.com/search/2/reverseGeocode/{lat},{lng}.json"
        
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                url,
                params={"key": TOMTOM_KEY}
            )
            resp.raise_for_status()
            data = resp.json()
        
        addresses = data.get("addresses", [])
        if not addresses:
            return f"{lat:.2f},{lng:.2f}"
            
        addr = addresses[0].get("address", {})
        
        # Priority for display: Municipality (City) > Submunicipality > CountrySecondarySubdivision (District)
        name = (
            addr.get("municipality")
            or addr.get("municipalitySubdivision")
            or addr.get("countrySecondarySubdivision")
            or addr.get("countrySubdivision")
            or f"{lat:.2f},{lng:.2f}"
        )
        return name
    except Exception as e:
        logger.warning(f"Reverse geocode failed for {lat},{lng}: {e}")
        return f"{lat:.2f},{lng:.2f}"


if __name__ == "__main__":
    import asyncio

    async def test():
        for place in ["Mumbai", "Delhi", "Ahmedabad", "Bangalore"]:
            try:
                result = await geocode(place)
                print(f"{place:12} \u2192 lat={result['lat']:.4f}, lng={result['lng']:.4f}")
                print(f"             {result['display_name']}")
            except Exception as e:
                print(f"Error for {place}: {e}")

    asyncio.run(test())