# services/segment_service.py
# Reverse geocodes each waypoint to get the actual city/town name.
# Called once at shipment creation — results stored in MongoDB.
# Gives Gemini real place names instead of random coordinates.

import httpx
import asyncio
import logging

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
HEADERS = {"User-Agent": "SmartSupplyChain/1.0"}



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
        enrich(wp, delay=i * 0.5)   # 0.5s between each call ebcause this stupid nomiantion is hititng god damn limit 
        for i, wp in enumerate(waypoints)
    ])


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