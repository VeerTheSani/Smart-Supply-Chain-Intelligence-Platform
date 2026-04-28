# services/scoring_thresholds.py
# All risk scoring thresholds in one place.
# Change values here to tune the engine — nothing else needs to change.

# ── Weather ──────────────────────────────────────────────────────────────────

# Rainfall in mm over the forecast window
RAINFALL_THRESHOLDS = [
    (2,   10),   # 0–2 mm   → score 10
    (10,  30),   # 2–10 mm  → score 30
    (30,  60),   # 10–30 mm → score 60
    (float("inf"), 90),  # 30+ mm → score 90
]

# Wind speed in km/h
WIND_THRESHOLDS = [
    (20,  10),
    (40,  30),
    (60,  50),
    (float("inf"), 80),
]

# Visibility in metres
VISIBILITY_THRESHOLDS = [
    (500,   90),   # <500 m        → score 90
    (1000,  60),   # 500–1000 m    → score 60
    (5000,  30),   # 1000–5000 m   → score 30
    (float("inf"), 0),  # >5000 m  → score 0
]

# ── Traffic ──────────────────────────────────────────────────────────────────
# ratio = current_duration / free_flow_duration (from routing API)
# ORS free tier doesn't give real-time traffic, so we default to NEUTRAL.
# If you upgrade to an API that provides it, plug the ratio in here.
TRAFFIC_THRESHOLDS = [
    (1.1,  10),   # <1.1 ratio  → free flow
    (1.3,  30),   # 1.1–1.3     → light
    (1.5,  50),   # 1.3–1.5     → moderate
    (2.0,  75),   # 1.5–2.0     → heavy
    (float("inf"), 90),  # >2.0 → gridlock
]

TRAFFIC_SCORE_WHEN_UNAVAILABLE = 50  # neutral default

# ── Time buffer ───────────────────────────────────────────────────────────────
# ratio = time_until_deadline / expected_travel_time
TIME_BUFFER_THRESHOLDS = [
    (1.0,  95),   # <1.0  → already late
    (1.2,  60),   # 1.0–1.2 → very tight
    (2.0,  30),   # 1.2–2.0 → normal
    (float("inf"), 10),  # >2.0 → lots of cushion
]

# ── Factor weights (must sum to 1.0) ─────────────────────────────────────────
WEIGHTS = {
    "weather":     0.35,
    "traffic":     0.20,
    "events":      0.25,
    "time_buffer": 0.15,
    "historical":  0.05,
}

# ── Risk level buckets ────────────────────────────────────────────────────────
RISK_LEVELS = [
    (30,  "LOW"),
    (60,  "MEDIUM"),
    (85,  "HIGH"),
    (float("inf"), "CRITICAL"),
]