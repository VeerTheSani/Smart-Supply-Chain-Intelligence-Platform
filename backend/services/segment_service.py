# services/segment_service.py
# Reverse geocodes each waypoint to get the actual city/town name.
# Called once at shipment creation — results stored in MongoDB.
# Provides real place names for route analysis.

import httpx
import asyncio
import logging

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
HEADERS = {"User-Agent": "SmartSupplyChain/1.0"}


async def _reverse_geocode(lat: float, lng: float) -> str:
    """
    Convert a coordinate to the nearest city/town name.
    Returns city name string, or None on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={
                    "lat": lat,
                    "lon": lng,
                    "format": "json",
                    "zoom": 7,
                    "addressdetails": 1,
                },
                headers=HEADERS,
            )
            resp.raise_for_status()
            data = resp.json()

        address = data.get("address", {})

        # Fallback chain: try progressively broader location names
        name = (
           address.get("city") or
           address.get("town") or
           address.get("suburb") or
           address.get("district") or
           address.get("village") or
           address.get("county") or
           address.get("state_district") or
           data.get("display_name", "").split(",")[0]
        )
        return name.strip() if name else None

    except Exception as e:
        logger.warning(f"Reverse geocode failed for ({lat}, {lng}): {e}")
        return None


async def get_named_waypoints(waypoints: list[dict]) -> list[dict]:
    """
    Take raw waypoints (lat/lng) and add city names via reverse geocoding.
    Runs all reverse geocode calls concurrently for speed.

    Input:  [{"lat": 21.49, "lng": 72.92}, ...]
    Output: [{"lat": 21.49, "lng": 72.92, "city": "Bharuch"}, ...]
    """
    async def enrich(wp, delay: float = 0):
        if delay:
            await asyncio.sleep(delay)
        city = await _reverse_geocode(wp["lat"], wp["lng"])
        return {**wp, "city": city or f"{wp['lat']:.2f},{wp['lng']:.2f}"}

    results = await asyncio.gather(*[
        enrich(wp, delay=i * 0.5)   # 0.5s stagger to respect Nominatim rate limits
        for i, wp in enumerate(waypoints)
    ])

    return list(results)


def get_city_names(named_waypoints: list[dict]) -> list[str]:
    """
    Extract unique city names from named waypoints for Gemini.
    Removes duplicates while preserving order.
    """
    seen = set()
    cities = []
    for wp in named_waypoints:
        city = wp.get("city", "")
        if city and city not in seen:
            seen.add(city)
            cities.append(city)
    return cities


def get_cities_ahead(
    named_waypoints: list[dict],
    current_location: dict,
) -> list[dict]:
    """
    Return only waypoints that are AHEAD of the current truck location.
    Compares by index — waypoints are already ordered origin → destination.
    """
    if not current_location:
        return named_waypoints

    import math

    def dist(wp):
        d_lat = math.radians(wp["lat"] - current_location["lat"])
        d_lng = math.radians(wp["lng"] - current_location["lng"])
        a = (math.sin(d_lat / 2) ** 2 +
             math.cos(math.radians(current_location["lat"])) *
             math.cos(math.radians(wp["lat"])) *
             math.sin(d_lng / 2) ** 2)
        return 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    # Find the closest waypoint to current location
    if not named_waypoints:
        return []

    closest_idx = min(range(len(named_waypoints)), key=lambda i: dist(named_waypoints[i]))

    # Return everything after the closest waypoint
    return named_waypoints[closest_idx + 1:]


# ── Self test ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio
    import sys
    sys.path.append("..")
    from services.mappls_service import get_route

    async def test():
        origin = {"lat": 21.1702, "lng": 72.8311}  # Surat
        dest   = {"lat": 23.2452, "lng": 72.4966}  # Kalol

        print("Fetching route Surat → Kalol...")
        route = await get_route(origin, dest)
        waypoints = route["waypoints"]

        print(f"\nRaw waypoints: {len(waypoints)}")
        print("Reverse geocoding to get city names...\n")

        named = await get_named_waypoints(waypoints)

        print("Named waypoints:")
        for wp in named:
            print(f"  ({wp['lat']:.4f}, {wp['lng']:.4f}) → {wp['city']}")

        print(f"\nCity names for Gemini: {get_city_names(named)}")

    asyncio.run(test())