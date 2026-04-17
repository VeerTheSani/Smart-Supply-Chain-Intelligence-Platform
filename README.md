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

### 📍 Real-Time Tracking

* Live shipment movement
* Route visualization
* Checkpoint detection

### ⚠️ Risk Engine

* Risk score (0–100)
* Factors:

  * Weather (50%)
  * Traffic (30%)
  * Route congestion (20%)

### 🔮 Prediction Engine

* ETA prediction
* Delay forecasting
* Confidence scoring

### 🧭 Routing Engine

* Multiple route options:

  * Fast (risky)
  * Balanced
  * Safe (longer)

### 🧠 Decision Engine (CORE)

* Smart scoring system:

```
Score = (0.5 × On-Time Probability)
      - (0.3 × Delay Penalty)
      - (0.2 × Distance Penalty)
```

👉 Selects the best route automatically

### ⚡ Auto-Rerouting (Key Innovation)

* Triggered when risk = CRITICAL
* Automatically:

  * Selects safer route
  * Updates shipment
  * Sends alert

---

## 📊 Dashboard

* Active shipments
* High-risk alerts
* Live map tracking
* Risk visualization (Green / Yellow / Red)

---

## 📈 Results (Simulated)

* On-Time Delivery: **82% → 92%**
* Avg Delay: **2.3 hrs → 1.1 hrs**
* Early Risk Detection: **75%**

---

## 🧪 Demo Scenario

Simulate:

* Storm on route
* Traffic congestion

System:

* Detects risk
* Predicts delay
* Suggests better route
* Auto-reroutes (if critical)

---

## 📌 Implementation Status

### ✅ Completed

* Real-time simulation tracking
* Risk engine
* Prediction logic
* Routing + decision engine
* WebSocket alerts
* Dashboard UI

### 🔄 In Progress

* ML-based prediction
* Real GPS integration
* Multi-route scaling

---

## 💡 Key Innovation

👉 **Risk-Aware Routing (Not just shortest path)**

Instead of:

> “Fastest route”

System chooses:

> “Lowest risk route with acceptable delivery time”

---

## 🏁 Final Statement

> This system transforms supply chains from passive tracking tools into intelligent, predictive, and self-optimizing logistics platforms. 

---

## 📂 Project Structure

```
frontend/   → React app
backend/    → FastAPI server
ml-model/   → Prediction logic
data/       → Sample datasets
```

---

## ⚡ How to Run

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\Activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 🤝 Contributors

* You + Team 🚀

---

## 📜 License

MIT License
