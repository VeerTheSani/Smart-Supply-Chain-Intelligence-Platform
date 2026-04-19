
import httpx
import logging

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "SmartSupplyChain/1.0"}  # Nominatim requires a User-Agent

## givs coordinates of orign and destination by names

async def geocode(place_name: str) -> dict:

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={
                    "q": place_name,
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "in",  # restrictng to ind for now , maybe wehen in q=wfaam we vaplafmaew f brainrot is caching up
                },
                headers=HEADERS,
            )
            resp.raise_for_status()
            data = resp.json()

        if not data:
            raise ValueError(f"Could not geocode '{place_name}' — place not found")

        return {
            "lat": float(data[0]["lat"]),
            "lng": float(data[0]["lon"]),
            "display_name": data[0]["display_name"],
        }

    except ValueError:
        raise
    except httpx.TimeoutException:
        logger.error(f"Nominatim timeout for '{place_name}'")
        raise RuntimeError(f"Geocoding timed out for '{place_name}'")
    except httpx.HTTPError as e:
        logger.error(f"Nominatim HTTP error for '{place_name}': {e}")
        raise RuntimeError(f"Geocoding failed for '{place_name}'")


if __name__ == "__main__":
    import asyncio

    async def test():
        for place in ["Mumbai", "Delhi", "Ahmedabad", "Bangalore"]:
            result = await geocode(place)
            print(f"{place:12} → lat={result['lat']:.4f}, lng={result['lng']:.4f}")
            print(f"             {result['display_name'][:60]}")

    asyncio.run(test())