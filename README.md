# 🚀 Smart Supply Chain Intelligence Platform

A **real-time, AI-powered logistics control tower** that predicts disruptions *before they happen* and dynamically optimizes shipment routes using **risk-aware decision intelligence**.

---

## 🧠 Problem Statement

Modern supply chains operate in highly volatile environments where disruptions like weather, traffic, and bottlenecks are often detected **too late**, leading to delays and financial losses.

This project is built around **Smart Supply Chains (PS3)** — focusing on:

> Proactively detecting risks and optimizing routes before delays occur. 

---

## 🎯 Objective

Transform logistics from:

**Reactive Tracking → Predictive + Autonomous Decision-Making**

---

## ⚙️ Tech Stack

* **Frontend:** React + Leaflet (Map Visualization)
* **Backend:** FastAPI (Python, async)
* **Database:** MongoDB
* **Real-time:** WebSockets
* **APIs:** Weather + Traffic (simulated/live)

---

## 🧱 System Architecture

```
GPS / Simulation
     ↓
FastAPI Backend
     ↓
MongoDB
     ↓
External APIs (Weather, Traffic)
     ↓
Data Aggregation
     ↓
Risk Engine
     ↓
Prediction Engine
     ↓
Routing Engine
     ↓
Decision Engine
     ↓
WebSocket Alerts
     ↓
React Dashboard + Map
```

---

## 👤 Target Users

* Logistics Operations Manager (Primary)
* Dispatcher
* Supply Chain Planner
* Monitoring Teams

---

## 🔄 User Flow

```
Monitor → Detect Risk → Predict → Recommend → Decide → Execute → Analyze
```

---

## ⚠️ Core Features

# 🚚 Smart Supply Chain Intelligence Platform

> **Google Solution Challenge 2026** — Real-time AI-powered logistics control tower that predicts disruptions before they happen and dynamically optimizes routes using live weather, traffic, and event data.

---

## 🧠 What It Does

Traditional supply chains react to problems after they happen. This system flips that — it continuously monitors every active shipment, scores risk across 5 factors in real time, and automatically reroutes trucks before delays occur.

**The core loop:**
```
Create Shipment → Geocode → Mappls Route → Risk Engine → WebSocket Alert → Reroute
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python, async) |
| Database | MongoDB Atlas (Motor async driver) |
| Frontend | React + Leaflet (Nandani) |
| Real-time | WebSockets + APScheduler |
| Routing | Mappls (MapmyIndia) API |
| Weather | Open-Meteo (free, no key) |
| Events | Gemini 2.5 Flash + Google Search grounding |
| Geocoding | Nominatim (free, no key) |

---

## 🏗️ Project Structure

```
backend/
├── main.py                        # FastAPI app, CORS, lifespan
├── database.py                    # MongoDB Motor client
├── models.py                      # Pydantic request/response models
│
├── routers/
│   ├── shipments.py               # CRUD + frontend-compatible serialization
│   ├── dashboard.py               # Single call for all dashboard stats
│   ├── risk.py                    # On-demand risk computation
│   ├── reroute.py                 # 3 alternative routes (A/B/C)
│   ├── reroute_engine.py          # Mappls alternatives + weather scoring
│   ├── risk_engine.py             # 5-factor weighted risk calculation
│   └── websocket.py               # WS /ws/alerts endpoint
│
├── core/
│   ├── scheduler.py               # APScheduler — runs every 5 mins
│   └── websocket_manager.py       # Connection manager + broadcast
│
└── services/
    ├── mappls_service.py          # OAuth2 + routing + traffic
    ├── geocoding_service.py       # Nominatim reverse geocoding
    ├── weather_service.py         # Open-Meteo time-aware forecasts
    ├── gemini_service.py          # Gemini 2.0 Flash event detection
    ├── segment_service.py         # Waypoint → city names for Gemini
    └── scoring_thresholds.py      # Risk weight constants
```

---

## 🚀 Quick Start

### 1. Clone & install

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
```

### 2. Create `.env`

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/
DB_NAME=supply_chain
MAPPLS_CLIENT_ID=your_mappls_client_id
MAPPLS_CLIENT_SECRET=your_mappls_client_secret
GEMINI_API_KEY=AIzaSy...
```

### 3. Run

```bash
uvicorn main:app --reload
# API running at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### 4. Run frontend

```bash
cd frontend
npm install
npm run dev
# App running at http://localhost:5173
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/shipments/` | Create shipment — geocodes, routes, stores |
| `GET` | `/api/shipments/` | List all shipments |
| `GET` | `/api/shipments/{id}` | Get one shipment |
| `PATCH` | `/api/shipments/{id}` | Update location / status / auto-reroute |
| `DELETE` | `/api/shipments/{id}` | Delete shipment |
| `GET` | `/api/risk/{id}` | Compute fresh risk score now |
| `GET` | `/api/reroute/{id}` | Get 3 alternative routes (A/B/C) |
| `GET` | `/api/dashboard/` | All stats for dashboard in one call |
| `WS` | `/ws/alerts` | Live risk alerts (connect once, stays open) |

---

## 🧮 Risk Engine

Risk is calculated across **5 weighted factors:**

```
Final Score = (Weather × 35%) + (Traffic × 20%) + (Events × 25%)
            + (Time Buffer × 15%) + (Historical × 5%)
```

| Factor | Source | What it measures |
|--------|--------|-----------------|
| Weather | Open-Meteo | Rain, wind, visibility at each waypoint at truck's arrival time |
| Traffic | Mappls | Live duration vs free-flow ratio |
| Events | Gemini 2.5 Flash + Google Search | Strikes, protests, road closures along route |
| Time Buffer | Calculated | Elapsed time vs expected ETA |
| Historical | MongoDB | Past alerts on this route |

**Risk levels:** `LOW` (0–30) · `MEDIUM` (30–60) · `HIGH` (60–85) · `CRITICAL` (85–100)

---

## ⚡ Scheduler (Background Loop)

Every **5 minutes**, for every active shipment:

1. **GPS simulation** — interpolates truck position along route waypoints based on elapsed time
2. **Risk recompute** — runs full 5-factor risk engine
3. **Gemini TTL** — calls Gemini based on risk level (LOW=30min, MEDIUM=15min, HIGH=5min, CRITICAL=2min) to save tokens
4. **WebSocket broadcast** — sends `risk_alert` to all connected frontends if risk level changed
5. **Auto-reroute** — if `HIGH`/`CRITICAL` and `auto_reroute_enabled=true`, picks the Recommended alternative and updates the route in MongoDB

---

## 🔌 WebSocket

Connect once from the frontend:
```
ws://localhost:8000/ws/alerts
```

Messages you'll receive:
```json
{
  "type": "risk_alert",
  "shipment_id": "68a1b2c3d4e5f6...",
  "level": "high",
  "message": "Storm warning detected on NH48 near Vadodara",
  "score": 78.4,
  "timestamp": "2026-04-19T14:32:00Z"
}
```

Send `"ping"` to check connection — server responds with `{"type": "pong"}`.

---

## 🗺️ External APIs

### Mappls (MapmyIndia)
- Requires OAuth2 (`grant_type=client_credentials`) — **not** a static API key
- Token fetched from `https://outpost.mappls.com/api/security/oauth/token`
- Used for: routing, waypoints every 50km, live traffic ratio, road names (NH48 etc)
- Get credentials: [developer.mappls.com](https://developer.mappls.com)

### Open-Meteo
- Free, no API key needed
- Fetches hourly forecasts — picks value at truck's **estimated arrival time** per waypoint, not current weather

### Gemini 2.0 Flash
- Uses `tools: [{google_search: {}}]` for real web search grounding
- Searches for strikes, road closures, protests, events along route cities
- Get key: [aistudio.google.com](https://aistudio.google.com)

### Nominatim
- Free, no API key needed
- Used for: place name → coordinates (geocoding) and coordinates → city names (reverse geocoding for Gemini context)

---

## 👥 Team

| Name | Role |
|------|------|
| Veer | Backend — FastAPI, risk engine, Mappls, Gemini, scheduler |
| Nandani | Frontend — React, Leaflet map, dashboard, WebSocket |

---

## 📜 License

MIT
