# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Supply Chain Intelligence Platform — a real-time, AI-powered logistics control tower that predicts disruptions before they happen and dynamically optimizes shipment routes.

- **Frontend**: React + Leaflet (map) + Zustand (state) + React Router v6
- **Backend**: FastAPI (Python, async) + MongoDB (Motor async driver)
- **Real-time**: WebSockets via `ConnectionManager` + APScheduler (background loop every 5 mins)
- **External APIs**: Mappls (routing), Open-Meteo (weather), Gemini 2.0 Flash (event detection), Nominatim (geocoding)

## Commands

### Backend
```bash
cd backend
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # dev server on port 5173
npm run build      # production build
```

### Environment Variables (backend/.env)
```
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/
DB_NAME=supply_chain
MAPPLS_CLIENT_ID=your_mappls_client_id
MAPPLS_CLIENT_SECRET=your_mappls_client_secret
GEMINI_API_KEY=your_gemini_key
```

## Architecture

### Backend Request Flow
```
POST /api/shipments/ → shipments router → geocoding_service → mappls_service → MongoDB
```

### Background Scheduler (`core/scheduler.py`)
Runs every 5 minutes for all active shipments (`planned`/`in_transit`/`rerouting`):
1. Advance GPS via `_advance_location()` — interpolates position along `route_waypoints` using **5x hyper-lapse time multiplier** (frontend visual sync)
2. Calculate risk via `routers/risk_engine.py` — 5-factor weighted score
3. Broadcast via WebSocket if risk level changed
4. **2-minute countdown** for HIGH/CRITICAL shipments with `auto_reroute_enabled=true`, then auto-reroute via `_apply_auto_reroute()`
5. Cascade propagation — if newly delayed, recursively update children via `upstream_shipment_id`

### Risk Engine (`routers/risk_engine.py`)
5 weighted factors: `Weather (35%) + Traffic (20%) + Events (25%) + Time Buffer (15%) + Historical (5%)`
Levels: `LOW (0-30)` · `MEDIUM (30-60)` · `HIGH (60-85)` · `CRITICAL (85-100)`

### WebSocket (`core/websocket_manager.py`)
- Single shared `manager` instance — imported in routers and scheduler
- `manager.broadcast(message)` sends to all connected frontends
- `MAX_CONNECTIONS=100`, `MAX_PER_IP=5`
- Frontend connects once at `ws://localhost:8000/ws/alerts`

### Reroute Engine (`routers/reroute_engine.py`)
- `get_alternatives(shipment)` fetches 3 routes (A/B/C) from Mappls + weather scoring
- CRITICAL risk + Gemini flag → prefer "Gemini Route" bypass over "Recommended"

### Cascade System (`core/scheduler.py` `_cascade_propagate`)
- Delay propagates from parent shipment to children via `upstream_shipment_id` field
- Stops at depth 5 to prevent runaway recursion
- Max 50 children per parent per cycle

### Frontend State
- Zustand stores: `alertStore` (unified alerts), `shipmentStore`, `countdownStore`, `uiStore`
- All alerts normalized on ingest — real alerts tagged `source: "REAL_SYSTEM"`, simulator alerts `source: "SIMULATOR"`
- WebSocket hook: `useAlertWebSocket.js` — connects, normalizes, deduplicates, syncs read state to backend

### Notification Persistence
- Backend: MongoDB `notifications` collection (per-notification `read` boolean)
- Frontend: `alertStore` in-memory, calls `POST /api/notifications/{id}/read` on mark-as-read
- "Mark all read" calls `POST /api/notifications/mark-all-read`

## Key Files

| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI app + CORS + lifespan (start/stop scheduler) |
| `backend/core/scheduler.py` | 5-min background loop, GPS sim, countdown, cascade |
| `backend/core/websocket_manager.py` | ConnectionManager singleton |
| `backend/routers/risk_engine.py` | 5-factor risk calculation |
| `backend/routers/reroute_engine.py` | Mappls alternatives + weather scoring |
| `backend/models.py` | Pydantic request/response models |
| `frontend/src/stores/alertStore.js` | Unified alert state + WebSocket integration |
| `frontend/src/hooks/useAlertWebSocket.js` | WebSocket connection hook |
| `frontend/src/router/index.jsx` | React Router v6 with lazy-loaded pages |

## Pages (Frontend Routes)

| Path | Page | Notes |
|------|------|-------|
| `/` | Dashboard | |
| `/shipments` | Shipments | |
| `/disruptions` | Disruptions | |
| `/routes` | Routes | |
| `/analytics` | Analytics | |
| `/scenario-lab` | ScenarioLab | Simulator-only alerts via `source: "SIMULATOR"` |
| `/settings` | Settings | |
