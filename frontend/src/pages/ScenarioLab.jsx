import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Play, TrendingDown, ShieldCheck, Activity,
  Route, AlertTriangle, Timer, Check, X, Zap, Loader2,
  Plus, Minus, Info, AlertCircle, Cpu, Radio, RefreshCw,
  CheckCircle2, Circle as LucideCircle
} from 'lucide-react';
import { useShipments } from '../hooks/useShipments';
import { useShipmentStore } from '../stores/shipmentStore';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle } from 'react-leaflet';
import { useTheme } from '../context/ThemeContext';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import apiClient from '../api/apiClient';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';

// ─── Leaflet icon fix ──────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ─── Constants ─────────────────────────────────────────────────────────────────
const SCENARIOS = [
  { id: 'storm', label: 'Severe Storm', icon: '🌩️', desc: 'Weather disruption along route' },
  { id: 'traffic', label: 'Traffic Jam', icon: '🚗', desc: 'High congestion on arterials' },
  { id: 'blockage', label: 'Route Blockage', icon: '🚧', desc: 'Physical road obstruction' },
];
const SEVERITIES = [
  { id: 'low', label: 'Low', color: 'text-emerald-500' },
  { id: 'medium', label: 'Med', color: 'text-yellow-500' },
  { id: 'high', label: 'High', color: 'text-red-500' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** BUG FIX #4: fmtDelay — was returning '+0.5h' when v===0 because !0 is truthy */
const fmtDelay = (v) =>
  v == null ? '—' : v === 0 ? '+0h' : `+${Number(v).toFixed(1)}h`;

const riskClass = (l) =>
  l === 'CRITICAL' || l === 'HIGH' ? 'text-red-500'
    : l === 'MEDIUM' ? 'text-yellow-500'
      : 'text-emerald-500';

const riskBg = (l) =>
  l === 'CRITICAL' || l === 'HIGH' ? 'bg-red-500/10 border-red-500/20'
    : l === 'MEDIUM' ? 'bg-yellow-500/10 border-yellow-500/20'
      : 'bg-emerald-500/10 border-emerald-500/20';

/** Convert waypoint array to Leaflet LatLng pairs */
const toPos = (arr) =>
  (arr || []).filter(w => w?.lat != null && w?.lng != null).map(w => [w.lat, w.lng]);

/**
 * BUG FIX #2 helper: Interpolate a position along a waypoint array by progress [0–1].
 * Returns {lat, lng} or null. Used for the SIMULATED truck — not the real shipment location.
 */
function interpolateRoute(waypoints, progress) {
  const pts = (waypoints || []).filter(w => w?.lat != null && w?.lng != null);
  if (!pts.length) return null;
  if (pts.length === 1) return pts[0];

  const clamped = Math.max(0, Math.min(1, progress));
  const idx = clamped * (pts.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, pts.length - 1);
  const t = idx - lo;

  return {
    lat: pts[lo].lat + (pts[hi].lat - pts[lo].lat) * t,
    lng: pts[lo].lng + (pts[hi].lng - pts[lo].lng) * t,
  };
}

/** Bearing in degrees between two {lat,lng} points */
function getAngle(from, to) {
  if (!from || !to) return 0;
  return (Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180) / Math.PI;
}

/** Individual step in the simulation loading sequence */
const LoadingStep = memo(({ label, active, completed }) => (
  <div className={cn(
    "flex items-center gap-3 transition-all duration-500",
    active || completed ? "opacity-100 translate-x-0" : "opacity-30 -translate-x-2"
  )}>
    <div className="relative flex items-center justify-center">
      {completed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      ) : active ? (
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      ) : (
        <LucideCircle className="w-4 h-4 text-theme-tertiary" />
      )}
    </div>
    <span className={cn(
      "text-[10px] font-bold tracking-tight",
      completed ? "text-emerald-500" : active ? "text-theme-primary" : "text-theme-secondary"
    )}>
      {label}
    </span>
  </div>
));
LoadingStep.displayName = 'LoadingStep';

// ─── Map sub-components ────────────────────────────────────────────────────────

/**
 * BUG FIX #5 + #9: FitBounds now accepts a `runId` prop to force refit on each
 * new simulation, regardless of whether the first waypoints are the same as before.
 * Also includes disruption zone coords in the bounds calculation.
 */
function FitBounds({ points, runId }) {
  const map = useMap();
  const lastRunId = useRef(null);

  useEffect(() => {
    if (!points?.length) return;
    if (lastRunId.current === runId) return; // already fitted for this run

    try {
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) {
        setTimeout(() => {
          try {
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10 });
            lastRunId.current = runId;
          } catch (_) { /* map might be unmounted */ }
        }, 350);
      }
    } catch (_) { /* noop */ }
  }, [points, runId, map]);

  return null;
}

function CustomZoom() {
  const map = useMap();
  return (
    <div className="absolute top-4 right-4 z-[500] flex flex-col gap-1">
      <button
        onClick={() => map.zoomIn()}
        className="w-8 h-8 rounded-lg bg-theme-primary/90 backdrop-blur-md border border-theme shadow-lg flex items-center justify-center text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        onClick={() => map.zoomOut()}
        className="w-8 h-8 rounded-lg bg-theme-primary/90 backdrop-blur-md border border-theme shadow-lg flex items-center justify-center text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer"
      >
        <Minus className="w-4 h-4" />
      </button>
    </div>
  );
}

const truckSvg = (color = '#3b82f6', stroke = '#1e40af') => `
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="6" width="15" height="10" rx="2" fill="${color}" stroke="${stroke}" stroke-width="1.2"/>
    <rect x="16" y="8" width="6" height="8" rx="1.5" fill="#60a5fa" stroke="${stroke}" stroke-width="1.2"/>
    <circle cx="6" cy="17" r="2" fill="#1e293b" stroke="#94a3b8" stroke-width="0.8"/>
    <circle cx="18" cy="17" r="2" fill="#1e293b" stroke="#94a3b8" stroke-width="0.8"/>
    <rect x="3" y="8" width="5" height="4" rx="0.5" fill="#93c5fd" opacity="0.7"/>
  </svg>`;

const makeTruckIcon = (angle = 0, rerouted = false) =>
  new L.DivIcon({
    className: 'scenario-truck-icon',
    html: `<div style="transform:rotate(${Math.round(angle)}deg)">
      ${truckSvg(rerouted ? '#10b981' : '#3b82f6', rerouted ? '#065f46' : '#1e40af')}
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  });

/**
 * BUG FIX #2 + #10: SimulatedTruck renders at an INTERPOLATED position along the
 * simulated route — NOT from activeShipment.current_location (the real system).
 * Color changes to green after rerouting is accepted.
 */
function SimulatedTruck({ position, prevPosition, shipmentName, rerouted }) {
  const angle = useMemo(
    () => getAngle(prevPosition, position),
    [position?.lat, position?.lng, prevPosition?.lat, prevPosition?.lng]
  );

  if (!position?.lat || !position?.lng) return null;

  return (
    <Marker
      position={[position.lat, position.lng]}
      icon={makeTruckIcon(angle, rerouted)}
      zIndexOffset={1000}
    >
      <Popup>
        <div className="font-bold text-sm">
          🚛 {shipmentName || 'Shipment'} <span className="text-xs font-normal text-gray-500">[SIM]</span>
        </div>
        <div className="text-xs mt-1">
          {rerouted
            ? '✅ Rerouted — Moving on optimized route'
            : '⚡ Simulation — Projected position'}
        </div>
      </Popup>
    </Marker>
  );
}

// ─── Status badge config ───────────────────────────────────────────────────────
const STATUS_CONFIG = {
  accepted: { label: 'Route Accepted', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  auto_executed: { label: 'Auto-Rerouted', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  cancelled: { label: 'Dismissed', cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════
const ScenarioLab = memo(function ScenarioLab() {
  const { theme } = useTheme();
  useShipments();
  const shipments = useShipmentStore(s => s.shipments);

  // ── Config state ────────────────────────────────────────────────────────────
  const [shipmentId, setShipmentId] = useState('');
  const [scenario, setScenario] = useState('storm');
  const [severity, setSeverity] = useState('medium');

  // ── Simulation state ────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0); // [0, 1, 2, 3]
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [runId, setRunId] = useState(null); // unique per simulation run

  // ── Decision state ──────────────────────────────────────────────────────────
  const [simId, setSimId] = useState(null);
  const [decided, setDecided] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [countdownActive, setCountdownActive] = useState(false);
  const [execStatus, setExecStatus] = useState(null); // 'accepted' | 'auto_executed' | 'cancelled'
  const [decisionLoading, setDecisionLoading] = useState(false);

  // ── Simulated truck state (BUG FIX #2) ─────────────────────────────────────
  const [truckProgress, setTruckProgress] = useState(0.3);
  const truckAnimRef = useRef(null);

  // ── Map key for forced remount on theme change ──────────────────────────────
  const [mapKey, setMapKey] = useState(0);

  // ── Timer ref ───────────────────────────────────────────────────────────────
  const timerRef = useRef(null);

  // ── Set default shipment ────────────────────────────────────────────────────
  useEffect(() => {
    if (shipments.length > 0 && !shipmentId) setShipmentId(shipments[0].id);
  }, [shipments, shipmentId]);

  // ── Remap on theme change ───────────────────────────────────────────────────
  useEffect(() => { setMapKey(k => k + 1); }, [theme]);

  // ── Simulated truck animation (BUG FIX #2) ─────────────────────────────────
  // Moves the truck slowly along the route waypoints, completely independent
  // of the real shipment's live location.
  useEffect(() => {
    clearInterval(truckAnimRef.current);
    if (!result) return;

    setTruckProgress(0.2); // Start truck at 20% of route in the simulation

    truckAnimRef.current = setInterval(() => {
      setTruckProgress(p => {
        if (p >= 0.92) {
          clearInterval(truckAnimRef.current);
          return p;
        }
        return p + 0.0015; // Slow crawl — visual only
      });
    }, 250);

    return () => clearInterval(truckAnimRef.current);
  }, [runId]); // Only restart animation when a new run begins

  // Switch truck to AI route when reroute is accepted
  useEffect(() => {
    if (execStatus === 'accepted' || execStatus === 'auto_executed') {
      setTruckProgress(0.2); // Reset progress on the new (AI) route
    }
  }, [execStatus]);

  // ── BUG FIX #1: Single stable countdown interval ────────────────────────────
  // Old code included `countdown` in deps → new interval created every second.
  // Fix: only depend on `countdownActive` and `decided`. Use functional updater
  // inside setInterval so we always read the latest countdown without it being a dep.
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!countdownActive || decided) return;

    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [countdownActive, decided]); // ← countdown intentionally NOT here

  // ── BUG FIX #3: Auto-execute when countdown hits 0 ─────────────────────────
  // Was calling handleAccept() via autoExecRef which always set 'accepted'.
  // Now a dedicated effect fires with the correct 'auto_executed' status.
  useEffect(() => {
    if (countdown !== 0) return;
    if (!countdownActive || decided || !simId) return;

    setCountdownActive(false);

    const doAutoExec = async () => {
      setDecisionLoading(true);
      try {
        await apiClient.post('/api/scenario/accept', { simulation_id: simId });
        setDecided(true);
        setExecStatus('auto_executed');
        toast.success('Auto-rerouted — Countdown expired', { icon: '🤖' });
      } catch (e) {
        // If already executed by backend, just sync the UI state
        if (e.response?.status === 400 && e.response?.data?.detail?.includes('already')) {
          setDecided(true);
          setExecStatus('auto_executed');
        } else {
          toast.error(e.response?.data?.detail || 'Auto-reroute failed');
        }
      } finally {
        setDecisionLoading(false);
      }
    };

    doAutoExec();
  }, [countdown]); // Fires when countdown reaches 0

  // ── Decision handlers ───────────────────────────────────────────────────────
  const handleAccept = useCallback(async () => {
    if (!simId || decided || decisionLoading) return;
    setDecisionLoading(true);
    setCountdownActive(false);
    clearInterval(timerRef.current);
    try {
      await apiClient.post('/api/scenario/accept', { simulation_id: simId });
      setDecided(true);
      setExecStatus('accepted');
      toast.success('Route optimized — applied', { icon: '✅' });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Accept failed');
    } finally {
      setDecisionLoading(false);
    }
  }, [simId, decided, decisionLoading]);

  const handleCancel = useCallback(async () => {
    if (!simId || decided || decisionLoading) return;
    setDecisionLoading(true);
    setCountdownActive(false);
    clearInterval(timerRef.current);
    try {
      await apiClient.post('/api/scenario/cancel', { simulation_id: simId });
      setDecided(true);
      setExecStatus('cancelled');
      toast.success('Decision dismissed', { icon: '❌' });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cancel failed');
    } finally {
      setDecisionLoading(false);
    }
  }, [simId, decided, decisionLoading]);

  // ── Run simulation ──────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!shipmentId || loading) return;

    setLoading(true);
    setLoadStep(0);
    setResult(null);
    setError(null);
    setCountdown(0);
    setDecided(false);
    setSimId(null);
    setCountdownActive(false);
    setExecStatus(null);
    setDecisionLoading(false);
    setTruckProgress(0.2);
    clearInterval(timerRef.current);
    clearInterval(truckAnimRef.current);

    const newRunId = crypto.randomUUID();
    setRunId(newRunId);

    // Dynamic progress sequence
    const stepTimer = setInterval(() => {
      setLoadStep(s => (s < 3 ? s + 1 : s));
    }, 300);

    try {
      const { data } = await apiClient.post('/api/scenario/run', {
        shipment_id: shipmentId,
        scenario,
        severity,
      });

      clearInterval(stepTimer);
      setLoadStep(4);
      await new Promise(r => setTimeout(r, 100)); // UX delay to see complete state

      setResult({
        ...data,
        loadingPreview: false
      });
      setSimId(data.simulation_id);

      // Start countdown only for reroute decisions on HIGH/CRITICAL risk
      if (
        data.decision?.action === 'reroute' &&
        data.decision?.countdown > 0 &&
        ['HIGH', 'CRITICAL'].includes(data.risk?.level)
      ) {
        setCountdown(data.decision.countdown);
        setCountdownActive(true);
      }
    } catch (e) {
      clearInterval(stepTimer);
      const msg = e.response?.data?.detail || e.message || 'Simulation failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived map data ────────────────────────────────────────────────────────
  const activeShipment = shipments.find(s => s.id === shipmentId);

  // BUG FIX #2: Simulated truck position — interpolated along route, NOT real location
  const activeRoute = useMemo(() => {
    if (!result) return null;
    // After accepting reroute, truck moves along AI route
    if ((execStatus === 'accepted' || execStatus === 'auto_executed') && result.map?.ai_route?.length) {
      return result.map.ai_route;
    }
    return result.map?.original_route;
  }, [result, execStatus]);

  const prevTruckPos = useMemo(() => {
    const pts = (activeRoute || []).filter(w => w?.lat != null && w?.lng != null);
    if (!pts.length) return null;
    const prevProgress = Math.max(0, truckProgress - 0.02);
    return interpolateRoute(pts, prevProgress);
  }, [activeRoute, truckProgress]);

  const simulatedTruckPos = useMemo(
    () => interpolateRoute(activeRoute, truckProgress),
    [activeRoute, truckProgress]
  );

  // BUG FIX #5: Include disruption zone in fit bounds
  const fitPoints = useMemo(() => {
    const orig = toPos(result?.map?.original_route);
    const ai = toPos(result?.map?.ai_route);
    const combined = [...orig, ...ai];

    if (result?.map?.disruption_zone?.lat) {
      combined.push([result.map.disruption_zone.lat, result.map.disruption_zone.lng]);
    }

    if (combined.length > 1) return combined;
    if (combined.length === 1) return combined;

    // Fall back to shipment last-known location (from store — display only, not sim driving)
    if (activeShipment?.current_location?.lat) {
      return [[activeShipment.current_location.lat, activeShipment.current_location.lng]];
    }
    return [];
  }, [result, activeShipment]);

  // BUG FIX #7: Map visual state based on decision
  // We keep baseline visible as a "ghost" even after reroute is accepted
  const showOriginalRoute = !!result;
  const showAiRoute = result && (
    (result.decision?.action === 'reroute' && !decided) ||
    execStatus === 'accepted' ||
    execStatus === 'auto_executed'
  );
  const showDisruption = !!(result?.map?.disruption_zone?.lat) && !decided;

  const countdownPct = useMemo(() => {
    if (!result?.decision?.countdown || !countdownActive) return 0;
    return (countdown / result.decision.countdown) * 100;
  }, [countdown, result?.decision?.countdown, countdownActive]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen lg:h-[calc(100vh-80px)] flex flex-col gap-4 md:gap-6 lg:overflow-hidden p-4 md:p-6 bg-theme-primary/30">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-sm">
            <FlaskConical className="w-4 h-4 md:w-5 md:h-5" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-theme-primary tracking-tight">Scenario Lab</h1>
            <p className="text-[9px] font-bold text-theme-secondary uppercase tracking-[0.2em]">
              Predictive Logistics Simulation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Simulator isolation badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-tertiary border border-theme text-[9px] font-black text-theme-secondary uppercase tracking-widest">
            <Cpu className="w-3 h-3" />
            Isolated Simulator
          </div>

          {/* Execution status */}
          <AnimatePresence>
            {execStatus && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={cn(
                  "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-sm",
                  STATUS_CONFIG[execStatus]?.cls
                )}
              >
                {STATUS_CONFIG[execStatus]?.label}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Main layout — stacks on mobile, side-by-side on lg ── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 min-h-0">

        {/* ── Left Sidebar ── */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar lg:pr-2">

          {/* Configuration panel */}
          <section className="bg-theme-secondary dark:bg-[#0f172a] border border-theme dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-[10px] font-black text-theme-primary uppercase tracking-[0.2em] mb-5 pb-2 border-b border-theme/50 flex items-center gap-2">
              <Radio className="w-3 h-3 text-accent" />
              Configuration
            </h3>

            <div className="space-y-5">
              {/* Shipment selector */}
              <div>
                <label className="text-[9px] font-black text-theme-secondary uppercase tracking-widest mb-2 block">
                  Target Shipment
                </label>
                <select
                  value={shipmentId}
                  onChange={(e) => setShipmentId(e.target.value)}
                  className="w-full bg-theme-tertiary dark:bg-slate-900 border border-theme dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-theme-primary focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                >
                  {shipments.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.tracking_number} — {s.shipment_name || 'Unnamed'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Disruption type */}
              <div>
                <label className="text-[9px] font-black text-theme-secondary uppercase tracking-widest mb-2 block">
                  Disruption Type
                </label>
                <div className="grid grid-cols-1 gap-2">
                    {SCENARIOS.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setScenario(s.id)}
                        className={cn(
                          "flex items-center gap-3 px-3.5 py-3 rounded-xl border text-[11px] font-bold transition-all cursor-pointer text-left group relative overflow-hidden",
                          scenario === s.id
                            ? "bg-accent/10 border-accent/40 text-accent shadow-sm shadow-accent/10"
                            : "bg-theme-tertiary dark:bg-slate-900/50 border-theme dark:border-slate-800 text-theme-secondary hover:bg-theme-tertiary/80"
                        )}
                      >
                        {scenario === s.id && (
                          <motion.div layoutId="active-scenario" className="absolute inset-0 bg-accent/5" />
                        )}
                        <span className="text-lg shrink-0 group-hover:scale-125 transition-transform duration-300">{s.icon}</span>
                        <div className="relative z-10">
                          <div className="leading-none mb-0.5">{s.label}</div>
                          <div className="text-[10px] font-medium opacity-60 group-hover:opacity-100 transition-opacity">{s.desc}</div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              {/* Severity */}
              <div>
                <label className="text-[9px] font-black text-theme-secondary uppercase tracking-widest mb-2 block">
                  Severity Profile
                </label>
                <div className="flex p-1 bg-theme-tertiary dark:bg-slate-900 rounded-xl border border-theme dark:border-slate-800">
                  {SEVERITIES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSeverity(s.id)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                        severity === s.id
                          ? cn("bg-theme-secondary dark:bg-slate-800 shadow-sm border border-theme dark:border-slate-700", s.color)
                          : "text-theme-secondary hover:text-theme-primary"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Run button */}
              <button
                onClick={handleRun}
                disabled={loading || !shipmentId}
                className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-white rounded-xl py-3 text-xs font-black uppercase tracking-[0.15em] shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer active:scale-95"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : result
                    ? <RefreshCw className="w-4 h-4" />
                    : <Play className="w-4 h-4" />}
                {loading ? 'Simulating…' : result ? 'Re-run Simulation' : 'Initiate Simulation'}
              </button>
            </div>
          </section>

          {/* Integrated Error Display */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Simulation Failed</p>
                    <p className="text-[10px] text-red-500/80 truncate">{error}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Impact Analysis */}
          <AnimatePresence>
            {result && !error && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-theme-secondary dark:bg-[#0f172a] border border-theme dark:border-slate-800 rounded-2xl p-5 shadow-sm"
              >
                <h3 className="text-[10px] font-black text-theme-primary uppercase tracking-[0.2em] mb-4 pb-2 border-b border-theme/50">
                  Impact Analysis
                </h3>

                <div className="space-y-4">
                  {/* Risk level */}
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-theme-secondary uppercase tracking-widest">Risk Level</span>
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border",
                      riskBg(result.risk?.level),
                      riskClass(result.risk?.level)
                    )}>
                      {result.risk?.level}
                    </span>
                  </div>

                  {/* Confidence */}
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[9px] font-black text-theme-secondary uppercase tracking-widest">Confidence</span>
                      <span className="text-[10px] font-black text-theme-primary">{result.risk?.confidence}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-theme-tertiary overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${result.risk?.confidence}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full rounded-full bg-accent"
                      />
                    </div>
                  </div>

                  {/* Key anomalies */}
                  <div className="pt-1">
                    <div className="text-[9px] font-black text-theme-secondary uppercase tracking-widest mb-2">
                      Key Anomalies
                    </div>
                    <div className="space-y-1.5">
                      {(result.risk?.factors || []).slice(0, 3).map((f, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-[10px] text-theme-primary font-medium leading-tight"
                        >
                          <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Decision */}
                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[9px] font-black text-theme-secondary uppercase tracking-widest">
                      AI Decision
                    </span>
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest",
                      result.decision?.action === 'reroute' ? 'text-accent' : 'text-theme-secondary'
                    )}>
                      {result.decision?.action === 'reroute' ? '⚡ Reroute' : '👁️ Monitor'}
                    </span>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right: Map + Metrics ── */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto custom-scrollbar lg:pr-1">

          {/* Metric cards */}
          <AnimatePresence>
            {result && !error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 shrink-0"
              >
                <MetricCard
                  label="Latency Shift"
                  value={fmtDelay(result.impact?.delay_hours)}
                  sub="Est. Arrival"
                  icon={TrendingDown}
                  color="red"
                />
                <MetricCard
                  label="Reliability"
                  value={result.risk?.level === 'LOW' ? '98%' : result.risk?.level === 'MEDIUM' ? '82%' : '74%'}
                  sub="Score"
                  icon={ShieldCheck}
                  color="green"
                />
                <MetricCard
                  label="Risk Score"
                  value={result.comparison?.human?.risk_score?.toFixed(1) ?? '—'}
                  sub="/ 100"
                  icon={Activity}
                  color="blue"
                />
                <MetricCard
                  label="Strategy"
                  value={result.decision?.action === 'reroute' ? 'Optimize' : 'Monitor'}
                  sub="Proposed"
                  icon={Route}
                  color="purple"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Map Section - Isolated to prevent total page re-renders */}
          <div className="flex-1 relative bg-theme-secondary border border-theme dark:border-slate-800 rounded-2xl overflow-hidden shadow-inner min-h-[450px] lg:min-h-0">
            <SimulatorMap
              theme={theme}
              loading={loading}
              result={result}
              runId={runId}
              fitPoints={fitPoints}
              showOriginalRoute={showOriginalRoute}
              showAiRoute={showAiRoute}
              showDisruption={showDisruption}
              decided={decided}
              execStatus={execStatus}
              simulatedTruckPos={simulatedTruckPos}
              prevTruckPos={prevTruckPos}
              activeShipment={activeShipment}
              // Overlay props
              countdown={countdown}
              countdownActive={countdownActive}
              countdownPct={countdownPct}
              decisionLoading={decisionLoading}
              handleAccept={handleAccept}
              handleCancel={handleCancel}
            />
          </div>


          {/* ── Comparison Results ── */}
          <AnimatePresence>
            {result && !error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 shrink-0 mb-4"
              >
                <ComparisonCard title="Human Baseline" data={result.comparison?.human} variant="neutral" />
                <ComparisonCard title="AI Optimized" data={result.comparison?.ai} variant="accent" />
                <ImpactSummaryCard impact={result.impact} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
});

// ─── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon: Icon, color }) {
  const colors = {
    red: "bg-red-500/10 text-red-500 border-red-500/20",
    green: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-theme-secondary dark:bg-[#0f172a] border border-theme dark:border-slate-800 rounded-2xl p-3.5 md:p-4 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-all duration-300 group"
    >
      <div className={cn("w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center border shadow-inner shrink-0 group-hover:scale-110 transition-transform duration-300", colors[color])}>
        <Icon className="w-5 h-5 md:w-6 md:h-6" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-bold text-theme-secondary uppercase tracking-[0.1em] mb-0.5 truncate">
          {label}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-base md:text-lg font-black text-theme-primary">{value}</span>
          <span className="text-[10px] font-bold text-theme-secondary uppercase opacity-70">{sub}</span>
        </div>
      </div>
    </motion.div>
  );
}

function ComparisonCard({ title, data, variant }) {
  if (!data) return (
    <div className="p-5 rounded-2xl border border-theme bg-theme-secondary dark:bg-[#0f172a] flex items-center justify-center">
      <p className="text-[10px] text-theme-secondary uppercase tracking-widest">No data</p>
    </div>
  );

  return (
    <div className={cn(
      "p-5 rounded-2xl border relative overflow-hidden transition-all duration-300",
      variant === 'accent'
        ? "bg-accent/[0.03] border-accent/30 shadow-lg shadow-accent/5"
        : "bg-theme-secondary dark:bg-[#0f172a] border-theme dark:border-slate-800 shadow-sm"
    )}>
      <div className="flex items-center justify-between mb-5">
        <h3 className={cn(
          "text-[10px] font-black uppercase tracking-[0.2em]",
          variant === 'accent' ? "text-accent" : "text-theme-secondary"
        )}>
          {title}
        </h3>
        {variant === 'accent' && (
          <div className="px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-[9px] font-black text-accent uppercase tracking-tighter">
            AI Choice
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-theme-secondary uppercase tracking-wider opacity-60">Risk Score</p>
          <div className="flex items-baseline gap-1">
            <p className={cn("text-2xl font-black", riskClass(data.risk_level))}>
              {data.risk_score?.toFixed(1) ?? '—'}
            </p>
            <span className="text-[9px] font-bold text-theme-secondary opacity-40 uppercase">/ 100</span>
          </div>
          <p className={cn("text-[9px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-md inline-block", riskBg(data.risk_level), riskClass(data.risk_level))}>
            {data.risk_level ?? '—'}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-theme-secondary uppercase tracking-wider opacity-60">Est. Delay</p>
          <p className="text-2xl font-black text-theme-primary tracking-tight">
            {fmtDelay(data.delay)}
          </p>
          <div className="flex items-center gap-1.5">
            <Timer className="w-3 h-3 text-theme-secondary opacity-50" />
            <span className="text-[9px] font-medium text-theme-secondary">Projected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImpactSummaryCard({ impact }) {
  if (!impact) return (
    <div className="bg-emerald-500/5 border border-emerald-500/20 p-5 rounded-2xl flex items-center justify-center">
      <p className="text-[10px] text-theme-secondary uppercase tracking-widest">No impact data</p>
    </div>
  );

  return (
    <div className="bg-emerald-500/[0.03] border border-emerald-500/20 p-5 rounded-2xl flex flex-col justify-center gap-4 relative overflow-hidden shadow-sm">
      <div className="absolute top-0 right-0 p-4 opacity-[0.05]">
        <Zap className="w-16 h-16 text-emerald-500" />
      </div>
      <div className="relative z-10 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black flex items-center gap-2 uppercase tracking-widest mb-1">
            <TrendingDown className="w-3 h-3" /> Delay Reduction
          </p>
          <p className="text-2xl font-black text-theme-primary tracking-tighter">
            {impact.delay_reduction_percent ?? 0}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black flex items-center gap-2 uppercase tracking-widest mb-1">
            <ShieldCheck className="w-3 h-3" /> Risk Reduction
          </p>
          <p className="text-2xl font-black text-theme-primary tracking-tighter">
            {impact.risk_reduction ?? 0} <span className="text-xs opacity-40">pts</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Isolated Map Component to prevent the heavy config UI from re-rendering during animations
 */
const SimulatorMap = memo(function SimulatorMap({
  theme, loading, loadStep, result, runId, fitPoints, showOriginalRoute,
  showAiRoute, showDisruption, decided, execStatus,
  simulatedTruckPos, prevTruckPos, activeShipment,
  countdown, countdownActive, countdownPct, decisionLoading,
  handleAccept, handleCancel
}) {
  return (
    <div className="w-full h-full relative" style={{ minHeight: '450px' }}>
      {/* Enhanced Simulation Loading Overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[600] bg-theme-primary/80 backdrop-blur-md flex flex-col items-center justify-center p-6"
          >
            <div className="w-[300px] flex flex-col items-center">
              <div className="relative mb-8">
                <Loader2 className="w-12 h-12 text-accent animate-spin" />
                <div className="absolute inset-0 bg-accent/20 blur-xl rounded-full" />
              </div>

              <div className="text-center mb-10">
                <h3 className="text-[12px] font-black text-theme-primary uppercase tracking-[0.25em] mb-2">Deploying Scenario</h3>
                <p className="text-[10px] text-theme-secondary font-medium tracking-wide">Establishing systemic connections</p>
              </div>

              <div className="w-full space-y-4">
                <LoadingStep label="Cloning Shipment Digital Twin" active={loadStep === 0} completed={loadStep > 0} />
                <LoadingStep label="Injecting Disruption Vectors" active={loadStep === 1} completed={loadStep > 1} />
                <LoadingStep label="Executing AI Risk Engine" active={loadStep === 2} completed={loadStep > 2} />
                <LoadingStep label="Generating Optimized Alternatives" active={loadStep === 3} completed={loadStep > 3} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decision overlay */}
      <AnimatePresence>
        {result && result.decision?.action === 'reroute' && !decided && countdownActive && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-[340px] z-[500]"
          >
            <div className="bg-theme-secondary border border-theme rounded-2xl overflow-hidden shadow-xl">
              <div className="px-5 py-4 bg-theme-tertiary/50 border-b border-theme flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Route className="w-4 h-4 text-accent" />
                  </div>
                  <span className="text-[10px] font-black text-theme-primary uppercase tracking-[0.2em]">Decision Intel</span>
                </div>
                {countdown > 0 && (
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-red-500/5 border border-red-500/20 shadow-inner">
                    <Timer className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                    <span className="text-[11px] font-mono font-bold text-red-500 leading-none">{countdown}s</span>
                  </div>
                )}
              </div>
              <div className="h-1 bg-theme-tertiary">
                <motion.div className="h-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]" animate={{ width: `${countdownPct}%` }} transition={{ duration: 0.5 }} />
              </div>
              <div className="p-5 space-y-4">
                <p className="text-[11px] font-bold text-theme-primary leading-relaxed opacity-90">
                  Autonomous System recommends <span className="text-accent underline decoration-accent/30 underline-offset-4 font-black tracking-tight">Active Rerouting</span>.
                </p>
                <div className="flex gap-2.5">
                  <button onClick={handleAccept} disabled={decisionLoading} className="flex-1 py-3.5 rounded-xl bg-accent hover:bg-accent/90 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent/20 active:scale-[0.96] transition-all flex items-center justify-center gap-2 cursor-pointer">
                    {decisionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept Now
                  </button>
                  <button onClick={handleCancel} disabled={decisionLoading} className="flex-1 py-3.5 rounded-xl border border-theme hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.96] cursor-pointer">
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post-decision overlay */}
      <AnimatePresence>
        {decided && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="absolute bottom-6 right-6 z-[500]">
            <div className={cn("px-6 py-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-center gap-3.5", STATUS_CONFIG[execStatus]?.cls)}>
              {execStatus === 'cancelled' ? <X className="w-4 h-4" /> : <Check className="w-4 h-4 shadow-sm" />}
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em]">{STATUS_CONFIG[execStatus]?.label}</div>
                <div className="text-[9px] opacity-70 font-medium">{execStatus === 'cancelled' ? 'Original route maintained' : 'Optimized route applied'}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map legend - Solid theme background to match UI cards */}
      {result && (
        <div className="absolute top-5 left-4 z-[500]">
          <div className="bg-theme-secondary border border-theme rounded-xl px-4 py-3 flex flex-col gap-3.5 shadow-xl">
            {showOriginalRoute && (
              <div className="flex items-center gap-3">
                <div className="w-6 border-t-[3px] border-dashed border-slate-500/70" />
                <span className="text-[9px] font-black text-theme-primary uppercase tracking-widest">Baseline</span>
              </div>
            )}
            {showAiRoute && (
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-5 h-1.5 rounded-full",
                  execStatus === 'accepted' || execStatus === 'auto_executed' ? 'bg-emerald-500' : 'bg-blue-500'
                )} />
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-widest",
                  execStatus === 'accepted' || execStatus === 'auto_executed' ? 'text-emerald-500' : 'text-blue-500'
                )}>
                  {execStatus === 'accepted' || execStatus === 'auto_executed' ? 'Active' : 'Simulated'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <MapContainer
        // key={`${theme}-${runId}`}
        key={runId}
        center={[20, 78]}
        zoom={5}
        style={{ height: '100%', width: '100%', minHeight: '450px' }}
        className="z-0"
        zoomControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapInvalidator />
        <CustomZoom />
        <FitBounds points={fitPoints} runId={runId} />

        {result && (
          <>
            {showOriginalRoute && (
              <Polyline positions={toPos(result.map?.original_route)} color="#64748b" weight={4} dashArray="8, 12" opacity={decided ? 0.4 : 0.8} />
            )}
            {showAiRoute && (
              <Polyline positions={toPos(result.map?.ai_route)} color={execStatus === 'accepted' || execStatus === 'auto_executed' ? '#10b981' : '#3b82f6'} weight={5} opacity={0.85} />
            )}
            <SimulatedTruck position={simulatedTruckPos} prevPosition={prevTruckPos} shipmentName={activeShipment?.shipment_name} rerouted={execStatus === 'accepted' || execStatus === 'auto_executed'} />
            {showDisruption && (
              <Circle center={[result.map.disruption_zone.lat, result.map.disruption_zone.lng]} radius={15000} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.12, weight: 2, dashArray: '4, 6' }} />
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
});

/**
 * Ensures Leaflet detects the container size correctly even after CSS transitions
 */
function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

export default ScenarioLab;
