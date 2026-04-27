"""
simulate_load.py — Load testing script for Smart Supply Chain platform.

Creates N dummy shipments and triggers the scheduler to exercise:
- GPS position updates
- Risk assessments
- Decision creation + countdown
- Auto-reroute execution

Usage:
    python simulate_load.py --shipments 50
    python simulate_load.py --shipments 100 --high-risk-pct 30

This script uses the REAL API endpoints — no logic is bypassed.
"""

import argparse
import asyncio
import random
import sys
import time
import httpx

# Default backend URL
BASE_URL = "http://localhost:8000"

# Indian city pairs for realistic routes
CITY_PAIRS = [
    ("Mumbai", "Delhi"),
    ("Bangalore", "Chennai"),
    ("Kolkata", "Hyderabad"),
    ("Pune", "Ahmedabad"),
    ("Jaipur", "Lucknow"),
    ("Surat", "Nagpur"),
    ("Indore", "Bhopal"),
    ("Vadodara", "Rajkot"),
    ("Coimbatore", "Madurai"),
    ("Visakhapatnam", "Vijayawada"),
    ("Chandigarh", "Amritsar"),
    ("Patna", "Ranchi"),
    ("Guwahati", "Shillong"),
    ("Thiruvananthapuram", "Kochi"),
    ("Dehradun", "Haridwar"),
]


async def create_shipments(client: httpx.AsyncClient, count: int, high_risk_pct: int) -> list[str]:
    """Create N shipments via the real API. Returns list of created shipment IDs."""
    created_ids = []
    
    print(f"\n{'='*60}")
    print(f"  Creating {count} shipments...")
    print(f"{'='*60}\n")
    
    for i in range(count):
        origin, destination = random.choice(CITY_PAIRS)
        # Randomize to avoid duplicates
        name = f"LOAD-{i+1:04d}-{random.randint(1000,9999)}"
        auto_reroute = random.random() < (high_risk_pct / 100)
        
        payload = {
            "shipment_name": name,
            "origin_name": origin,
            "destination_name": destination,
            "auto_reroute_enabled": auto_reroute,
        }
        
        try:
            resp = await client.post(f"{BASE_URL}/api/shipments", json=payload, timeout=30.0)
            if resp.status_code == 201:
                sid = resp.json().get("id", "?")
                created_ids.append(sid)
                status = "✓" if auto_reroute else "·"
                sys.stdout.write(f"\r  [{status}] {i+1}/{count} — {name} ({origin} → {destination})")
                sys.stdout.flush()
            else:
                print(f"\n  [✗] Failed {name}: HTTP {resp.status_code}")
        except Exception as e:
            print(f"\n  [✗] Error creating {name}: {e}")
        
        # Small delay to avoid overwhelming geocoding APIs
        await asyncio.sleep(0.3)
    
    print(f"\n\n  Created {len(created_ids)}/{count} shipments")
    return created_ids


async def activate_shipments(client: httpx.AsyncClient, ids: list[str]):
    """Transition shipments from 'planned' to 'in_transit' so scheduler picks them up."""
    print(f"\n  Activating {len(ids)} shipments to in_transit...")
    
    activated = 0
    for sid in ids:
        try:
            resp = await client.patch(
                f"{BASE_URL}/api/shipments/{sid}",
                json={"status": "in_transit"},
                timeout=10.0
            )
            if resp.status_code == 200:
                activated += 1
        except Exception:
            pass
    
    print(f"  Activated {activated}/{len(ids)}")


async def poll_metrics(client: httpx.AsyncClient, duration: int):
    """Poll /metrics every 5s for the specified duration."""
    print(f"\n{'='*60}")
    print(f"  Monitoring metrics for {duration}s...")
    print(f"{'='*60}\n")
    
    start = time.time()
    prev_counters = {}
    
    while time.time() - start < duration:
        try:
            resp = await client.get(f"{BASE_URL}/metrics", timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                counters = data.get("counters", {})
                ws_conns = data.get("websocket_connections", 0)
                uptime = data.get("uptime_seconds", 0)
                
                # Show delta since last poll
                deltas = {}
                for k, v in counters.items():
                    prev = prev_counters.get(k, 0)
                    if v != prev:
                        deltas[k] = f"+{v - prev}"
                
                elapsed = int(time.time() - start)
                print(f"  [{elapsed:3d}s] ws={ws_conns} | ", end="")
                
                # Key metrics on one line
                print(
                    f"reroutes={counters.get('total_reroutes', 0)} "
                    f"retries={counters.get('total_retries', 0)} "
                    f"lock_fail={counters.get('total_lock_failures', 0)} "
                    f"ws_msgs={counters.get('websocket_messages_sent', 0)} "
                    f"alerts={counters.get('risk_alerts_sent', 0)} "
                    f"delivered={counters.get('shipments_delivered', 0)}"
                )
                
                if deltas:
                    delta_str = " ".join(f"{k}={v}" for k, v in deltas.items())
                    print(f"         Δ {delta_str}")
                
                prev_counters = dict(counters)
        except Exception as e:
            print(f"  [!] Metrics fetch failed: {e}")
        
        await asyncio.sleep(5)


async def run_load_test(args):
    """Main load test orchestrator."""
    print(f"\n{'='*60}")
    print(f"  SUPPLY CHAIN LOAD TEST")
    print(f"  Shipments: {args.shipments}")
    print(f"  High-risk %: {args.high_risk_pct}")
    print(f"  Monitor duration: {args.monitor}s")
    print(f"  Backend: {args.url}")
    print(f"{'='*60}")
    
    global BASE_URL
    BASE_URL = args.url
    
    async with httpx.AsyncClient() as client:
        # 1. Verify backend is up
        try:
            resp = await client.get(f"{BASE_URL}/health", timeout=5.0)
            health = resp.json()
            print(f"\n  Backend: {health.get('status', '?')} | DB: {health.get('database', '?')}")
        except Exception as e:
            print(f"\n  [FATAL] Cannot reach backend at {BASE_URL}: {e}")
            return
        
        # 2. Create shipments
        ids = await create_shipments(client, args.shipments, args.high_risk_pct)
        if not ids:
            print("  [FATAL] No shipments created. Aborting.")
            return
        
        # 3. Activate shipments
        await activate_shipments(client, ids)
        
        # 4. Monitor metrics
        print("\n  Waiting 10s for scheduler to pick up shipments...")
        await asyncio.sleep(10)
        
        await poll_metrics(client, args.monitor)
        
        # 5. Final metrics snapshot
        try:
            resp = await client.get(f"{BASE_URL}/metrics", timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                print(f"\n{'='*60}")
                print(f"  FINAL METRICS")
                print(f"{'='*60}")
                for k, v in data.get("counters", {}).items():
                    if v > 0:
                        print(f"  {k:35s} = {v}")
                print(f"  {'uptime_seconds':35s} = {data.get('uptime_seconds', 0)}")
                print(f"  {'websocket_connections':35s} = {data.get('websocket_connections', 0)}")
        except Exception:
            pass
        
        print(f"\n  Load test complete.\n")


def main():
    parser = argparse.ArgumentParser(description="Smart Supply Chain Load Tester")
    parser.add_argument("--shipments", type=int, default=50, help="Number of shipments to create (default: 50)")
    parser.add_argument("--high-risk-pct", type=int, default=40, help="Percentage with auto_reroute_enabled (default: 40)")
    parser.add_argument("--monitor", type=int, default=120, help="Seconds to monitor metrics after creation (default: 120)")
    parser.add_argument("--url", type=str, default="http://localhost:8000", help="Backend URL (default: http://localhost:8000)")
    args = parser.parse_args()
    
    asyncio.run(run_load_test(args))


if __name__ == "__main__":
    main()
