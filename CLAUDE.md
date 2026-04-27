# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Supply Chain Intelligence Platform — a real-time AI-powered logistics control tower that predicts disruptions and dynamically optimizes shipment routes. Backend is FastAPI (Python async), frontend is React with Leaflet maps. MongoDB for storage, WebSockets for real-time alerts.

## Commands

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # dev server at http://localhost:5173 (proxies /api and /ws to backend)
npm run build   # production build
npm run lint    # ESLint
```

## Architecture

### Backend — FastAPI + Motor

- `database.py` — MongoDB Motor async client. All DB access goes through `db` (a `motor.AsyncIOMotorDatabase`). Indexes created on startup in `main.py`.
- `models.py` — Shared Pydantic models. `ShipmentCreate` / `ShipmentResponse` / `DecisionCreate` etc. Used by both API and scheduler.
- `main.py` — App entry, CORS, lifespan (starts/stops scheduler), all routers registered here.
- `routers/` — One file per resource: `shipments.py`, `dashboard.py`, `risk.py`, `reroute.py`, `cascade.py`, `notifications.py`, `scenario.py`, `websocket.py`.
- `core/scheduler.py` — APScheduler with three jobs:
  - `recompute_all_shipments` every **5 min** — advances GPS, recalculates risk, decides on auto-reroute, broadcasts alerts
  - `check_pending_decisions` every **5 s** — checks expired countdowns, executes auto-reroute decisions
  - `update_gps_positions` every **3 s** — simulates real-time truck movement along route waypoints
- `core/websocket_manager.py` — `ConnectionManager` singleton. `manager.broadcast(msg)` sends to all connected frontends. Dead connections are pruned silently.
- `core/countdown_manager.py` — Tracks active countdowns. `start_countdown()` schedules a `countdown_expires_at`; `broadcast_update()` sends remaining seconds to frontend every tick.
- `services/scoring_thresholds.py` — All risk thresholds and weights. `WEIGHTS` dict sums to 1.0, `RISK_LEVELS` defines score buckets. Change here to tune the risk engine.

### Frontend — React + Zustand + React Query

- `src/stores/` — Zustand stores: `shipmentStore`, `alertStore`, `countdownStore`, `uiStore`. Alert store holds WebSocket messages; countdown store holds `seconds_remaining` per shipment.
- `src/services/websocket.js` — WebSocket client. Connects to `/ws/alerts`. Sends `"ping"` on interval to keep alive. Dispatches messages to Zustand alert store.
- `src/api/` — Axios-based API clients. `apiClient.js` is the base instance with interceptors; others (`shipmentApi.js`, `dashboardApi.js`) are resource-specific.
- `src/components/ui/` — `LiveAlertPanel`, `RiskBreakdown`, `RerouteModal`, `DecisionPanel`, `CascadePanel`, `CountdownBar`.
- `src/hooks/` — `useAlertWebSocket` (manages WS lifecycle), `useShipments` (React Query), `useDashboard`.
- Vite proxy: `/api` → `http://localhost:8000`, `/ws` → `ws://localhost:8000`. No CORS issues in dev.

### Risk Engine

`routers/risk_engine.py` calculates 5-factor risk:

```
Final = (Weather × 0.35) + (Traffic × 0.20) + (Events × 0.25)
      + (Time Buffer × 0.15) + (Historical × 0.05)
```

Levels: LOW ≤30, MEDIUM ≤60, HIGH ≤85, CRITICAL >85. Factors use piecewise thresholds defined in `scoring_thresholds.py`.

### Decision / Auto-Reroute Flow

1. Scheduler detects HIGH/CRITICAL risk + `auto_reroute_enabled=true`
2. Creates a `pending` decision in MongoDB `decisions` collection with `countdown_expires_at` = now + 120s
3. Frontend shows countdown bar via `CountdownBar` component driven by `countdownStore`
4. Scheduler `check_pending_decisions` job fires at expiry → calls `_apply_auto_reroute()` → updates shipment route in MongoDB
5. Risk dropping to LOW/MEDIUM cancels pending decisions and the countdown

### External APIs

- **Mappls** — OAuth2 client credentials flow. `mappls_service.py` fetches token, used for routing + traffic. Requires `MAPPLS_CLIENT_ID` / `MAPPLS_CLIENT_SECRET`.
- **Open-Meteo** — Free, no key. Forecasts fetched per waypoint at truck's *estimated arrival time*, not current weather.
- **Gemini 2.0 Flash** — Event detection along route. Called on TTL schedule (2–30 min) to save tokens.
- **Nominatim** — Free geocoding. Used for both forward (place→coords) and reverse (coords→city names for Gemini context).

### MongoDB Collections

- `shipments` — main shipment documents with route, risk, status
- `decisions` — reroute decision records with status (pending/executed/cancelled)
- `notifications` — global notification log for the notification panel
- `shipment_dependencies` — parent/child relationships between shipments (for cascade analysis)

## Non-Obvious Patterns

- The scheduler uses `SIMULATION_SPEED = 50` to accelerate GPS movement for demo purposes. Real-world deployment needs this removed or reduced.
- `GEMINI_TTL` per risk level determines how often Gemini is called. LOW=30min, CRITICAL=2min.
- WebSocket messages use `type` field for frontend dispatch: `risk_alert`, `position_update`, `countdown_tick`, `countdown_expired`, `countdown_cancelled`.
- `reroute_engine.py` sorts alternatives with "Recommended" first. The scheduler auto-selects this label for auto-reroute.
- `countdown_expires_at` is stored as a naive datetime in MongoDB; all code normalizes to UTC aware datetimes.
- `BATCH_SIZE = 10` controls parallelism in `recompute_all_shipments`. Each shipment is error-isolated via `asyncio.gather`.
