import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Play, TrendingDown, ShieldCheck, Activity,
  Route, AlertTriangle, Timer, Check, X, Zap, Loader2,
  Plus, Minus,
} from 'lucide-react';
import { useShipments } from '../hooks/useShipments';
import { useShipmentStore } from '../stores/shipmentStore';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle } from 'react-leaflet';
import { useTheme } from '../context/ThemeContext';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { BASE_URL } from '../config/api';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const SCENARIOS = [
  { id: 'storm', label: 'Severe Storm', icon: '🌩️' },
  { id: 'traffic', label: 'Traffic Jam', icon: '🚗' },
  { id: 'blockage', label: 'Route Blockage', icon: '🚧' },
];
const SEVERITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Med' },
  { id: 'high', label: 'High' },
];

/* ── Map helpers ─────────────────────────────────────────────── */

function FitBounds({ points }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!points?.length || fitted.current) return;
    try {
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) {
        setTimeout(() => {
          try { map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10 }); fitted.current = true; }
          catch (_) { /* noop */ }
        }, 350);
      }
    } catch (_) { /* noop */ }
  }, [points, map]);
  useEffect(() => { fitted.current = false; }, [JSON.stringify(points?.slice(0, 2))]);
  return null;
}

function CustomZoom() {
  const map = useMap();
  return (
    <div className="absolute top-4 right-4 z-[500] flex flex-col gap-1">
      <button onClick={() => map.zoomIn()}
        className="w-8 h-8 rounded-lg bg-theme-primary/90 backdrop-blur-md border border-theme shadow-lg flex items-center justify-center text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer">
        <Plus className="w-4 h-4" />
      </button>
      <button onClick={() => map.zoomOut()}
        className="w-8 h-8 rounded-lg bg-theme-primary/90 backdrop-blur-md border border-theme shadow-lg flex items-center justify-center text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer">
        <Minus className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ── Truck icon (rotatable) ─────────────────────────────────── */

const truckIcon = (angle = 0) => new L.DivIcon({
  className: 'scenario-truck-icon',
  html: `<div class="scenario-truck-wrap" style="transform:rotate(${Math.round(angle)}deg)">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="6" width="15" height="10" rx="2" fill="#3b82f6" stroke="#1e40af" stroke-width="1.2"/>
      <rect x="16" y="8" width="6" height="8" rx="1.5" fill="#60a5fa" stroke="#1e40af" stroke-width="1.2"/>
      <circle cx="6" cy="17" r="2" fill="#1e293b" stroke="#94a3b8" stroke-width="0.8"/>
      <circle cx="18" cy="17" r="2" fill="#1e293b" stroke="#94a3b8" stroke-width="0.8"/>
      <rect x="3" y="8" width="5" height="4" rx="0.5" fill="#93c5fd" opacity="0.7"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -20],
});

function getAngle(from, to) {
  if (!from || !to) return 0;
  const dx = to.lng - from.lng;
  const dy = to.lat - from.lat;
  // atan2 gives angle from east; we want bearing from north → rotate -90
  return (Math.atan2(dx, dy) * 180 / Math.PI);
}

/* ── RealTimeTruck: Purely backend-driven GPS tracking ────── */

function RealTimeTruck({ position, shipmentName, rerouted }) {
  const [angle, setAngle] = useState(0);
  const prevPosRef = useRef(position);

  useEffect(() => {
    if (!position || !prevPosRef.current) return;
    if (position.lat === prevPosRef.current.lat && position.lng === prevPosRef.current.lng) return;
    
    setAngle(getAngle(prevPosRef.current, position));
    prevPosRef.current = position;
  }, [position?.lat, position?.lng]);

  if (!position?.lat || !position?.lng) return null;

  return (
    <Marker position={[position.lat, position.lng]} icon={truckIcon(angle)} zIndexOffset={1000}>
      <Popup>
        <div className="font-bold text-sm">🚛 {shipmentName || 'Shipment'}</div>
        <div className="text-xs mt-1">
          {rerouted ? 'Rerouted — Moving on optimized route' : 'Live tracking — Active shipment'}
        </div>
      </Popup>
    </Marker>
  );
}

const riskClass = (l) => l === 'CRITICAL' || l === 'HIGH' ? 'text-danger' : l === 'MEDIUM' ? 'text-warning' : 'text-success';
const fmtDelay = (v) => (!v || v === 0) ? '+0.5h' : `+${v}h`;

const toPos = (arr) => (arr || []).filter(w => w?.lat && w?.lng).map(w => [w.lat, w.lng]);

/* ── Component ───────────────────────────────────────────────── */

const ScenarioLab = memo(function ScenarioLab() {
  const { theme } = useTheme();
  useShipments();
  const shipments = useShipmentStore(s => s.shipments);

  const [shipmentId, setShipmentId] = useState('');
  const [scenario, setScenario]     = useState('storm');
  const [severity, setSeverity]     = useState('medium');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState(null);
  const [mapKey, setMapKey]         = useState(0);

  // Countdown
  const [countdown, setCountdown]           = useState(0);
  const [simId, setSimId]                   = useState(null);
  const [decided, setDecided]               = useState(false);
  const [countdownActive, setCountdownActive] = useState(false);
  const [execStatus, setExecStatus]         = useState(null); // 'accepted'|'auto_executed'|'cancelled'
  const timerRef        = useRef(null);
  const autoExecRef     = useRef(null);

  useEffect(() => { if (shipments.length > 0 && !shipmentId) setShipmentId(shipments[0].id); }, [shipments, shipmentId]);
  useEffect(() => { setMapKey(k => k + 1); }, [theme]);

  // Stable auto-execute ref
  useEffect(() => {
    autoExecRef.current = () => {
      if (simId && !decided && countdownActive && result?.decision?.action === 'reroute') handleAccept();
    };
  });

  // Countdown ticker
  useEffect(() => {
    if (!countdownActive || decided) { clearInterval(timerRef.current); return; }
    if (countdown <= 0) { clearInterval(timerRef.current); autoExecRef.current?.(); return; }
    timerRef.current = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [countdown, decided, countdownActive]);

  /* ── Handlers ──────────────────────────────────────────────── */

  const handleRun = async () => {
    if (!shipmentId) return;
    setLoading(true); setResult(null); setCountdown(0); setDecided(false);
    setSimId(null); setCountdownActive(false); setExecStatus(null);
    try {
      const res = await fetch(`${BASE_URL}/api/scenario/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_id: shipmentId, scenario, severity }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data); setSimId(data.simulation_id);
      if (data.decision?.action === 'reroute' && data.decision?.countdown > 0) {
        setCountdown(data.decision.countdown); setCountdownActive(true);
      }
      setMapKey(k => k + 1);
    } catch (e) { console.error('Simulation failed:', e); }
    finally { setLoading(false); }
  };

  const handleAccept = useCallback(async () => {
    if (!simId || decided) return;
    setDecided(true); setCountdownActive(false); setExecStatus('accepted');
    clearInterval(timerRef.current);
    try { await fetch(`${BASE_URL}/api/scenario/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ simulation_id: simId }) }); }
    catch (e) { console.error(e); }
  }, [simId, decided]);

  const handleCancel = useCallback(async () => {
    if (!simId || decided) return;
    setDecided(true); setCountdown(0); setCountdownActive(false); setExecStatus('cancelled');
    clearInterval(timerRef.current);
    try { await fetch(`${BASE_URL}/api/scenario/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ simulation_id: simId }) }); }
    catch (e) { console.error(e); }
  }, [simId, decided]);

  /* ── Derived ───────────────────────────────────────────────── */

  const active = shipments.find(s => s.id === shipmentId);
  const showDecision = result?.decision?.action === 'reroute' && !decided && countdownActive;

  const fitPoints = (() => {
    const orig = toPos(result?.map?.original_route);
    if (orig.length > 1) return orig;
    const ai = toPos(result?.map?.ai_route);
    if (ai.length > 1) return ai;
    if (active?.current_location?.lat) return [[active.current_location.lat, active.current_location.lng]];
    return [];
  })();

  // Hide disruption after reroute executed
  const showDisruption = result?.map?.disruption_zone?.lat && !decided;

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <motion.h1 initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          className="text-3xl font-bold text-theme-primary tracking-tight flex items-center gap-3">
          <FlaskConical className="w-8 h-8 text-accent" /> Scenario Lab
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="text-theme-secondary mt-1">
          Controlled disruption simulation &amp; autonomous decision validation
        </motion.p>
      </div>

      {/* ═══ TOP SECTION: Controls + Map ═══ */}
      <div className="flex gap-4" style={{ minHeight: 500 }}>

        {/* ── LEFT: Simulator Panel ─────────────────────────────── */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="glass-panel rounded-2xl border border-theme flex flex-col gap-4 p-5"
          style={{ width: 320, minWidth: 320, flexShrink: 0 }}>

          {/* Shipment */}
          <div>
            <label className="block text-[10px] font-bold text-theme-secondary uppercase tracking-widest mb-1.5">Target Shipment</label>
            <select value={shipmentId} onChange={e => setShipmentId(e.target.value)}
              className="w-full bg-theme-tertiary text-theme-primary border border-theme rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent">
              {shipments.map(s => (
                <option key={s.id} value={s.id}>{s.shipment_name} ({s.origin_name} → {s.destination_name})</option>
              ))}
            </select>
          </div>

          {/* Disruption Type */}
          <div>
            <label className="block text-[10px] font-bold text-theme-secondary uppercase tracking-widest mb-1.5">Disruption Type</label>
            <div className="space-y-1.5">
              {SCENARIOS.map(s => (
                <button key={s.id} onClick={() => setScenario(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-sm transition-all flex items-center gap-2 cursor-pointer ${scenario === s.id ? 'border-accent bg-accent/10 text-theme-primary font-bold' : 'border-theme bg-theme-tertiary/50 text-theme-secondary hover:border-theme-secondary/50'}`}>
                  <span>{s.icon}</span> {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-[10px] font-bold text-theme-secondary uppercase tracking-widest mb-1.5">Severity</label>
            <div className="flex gap-2">
              {SEVERITIES.map(s => (
                <button key={s.id} onClick={() => setSeverity(s.id)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${severity === s.id ? 'border-accent bg-accent/10 text-theme-primary' : 'border-theme bg-theme-tertiary/50 text-theme-secondary'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Decision Alert (inline) */}
          <AnimatePresence>
            {showDecision && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-xl border border-danger/30 bg-danger/5 p-3 space-y-3">
                <div className="flex items-center gap-2 text-danger font-black text-[11px] uppercase tracking-widest">
                  <AlertTriangle className="w-4 h-4" /> {result?.risk?.level} Risk Detected
                </div>
                <p className="text-theme-secondary text-xs">Recommended: <span className="text-theme-primary font-bold">REROUTE</span></p>
                <div className="flex items-center gap-2">
                  <Timer className="w-5 h-5 text-warning" />
                  <span className="text-2xl font-black text-theme-primary tabular-nums">{countdown}s</span>
                  <span className="text-theme-secondary text-[10px]">auto-execute</span>
                </div>
                {/* Progress */}
                <div className="w-full h-1.5 bg-theme-tertiary rounded-full overflow-hidden">
                  <motion.div className="h-full bg-danger rounded-full"
                    initial={{ width: '100%' }}
                    animate={{ width: `${(countdown / (result?.decision?.countdown || 10)) * 100}%` }}
                    transition={{ duration: 0.5 }} />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAccept}
                    className="flex-1 py-2 rounded-xl bg-accent text-white text-xs font-bold flex items-center justify-center gap-1 hover:bg-accent/90 transition-colors cursor-pointer">
                    <Check className="w-3.5 h-3.5" /> Accept
                  </button>
                  <button onClick={handleCancel}
                    className="flex-1 py-2 rounded-xl border border-theme text-theme-secondary text-xs font-bold flex items-center justify-center gap-1 hover:bg-theme-tertiary transition-colors cursor-pointer">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Execution toast (inline) */}
          <AnimatePresence>
            {decided && execStatus && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`rounded-xl px-4 py-3 border ${execStatus === 'cancelled' ? 'bg-warning/10 border-warning/30' : 'bg-success/10 border-success/30'}`}>
                <p className={`font-bold text-xs flex items-center gap-2 ${execStatus === 'cancelled' ? 'text-warning' : 'text-success'}`}>
                  <Zap className="w-4 h-4" />
                  {execStatus === 'cancelled' ? 'Cancelled — current route kept'
                    : execStatus === 'auto_executed' ? 'Auto-reroute executed'
                      : 'Route optimized — applied'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Run button */}
          <button onClick={handleRun} disabled={loading || !shipmentId}
            className="w-full py-3 rounded-xl bg-accent text-white font-bold flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-auto">
            {loading
              ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><Play className="w-4 h-4 fill-current" /> Run Simulation</>}
          </button>
        </motion.div>

        {/* ── RIGHT: Map ───────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="flex-1 glass-panel rounded-2xl overflow-hidden border border-theme relative">

          {/* Loading overlay */}
          <AnimatePresence>
            {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-[600] bg-theme-primary/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-10 h-10 text-accent animate-spin" />
                <p className="text-theme-primary font-bold text-sm">Running Simulation…</p>
                <p className="text-theme-secondary text-xs">Analyzing risk & generating routes</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Route legend */}
          <div className="absolute bottom-4 left-4 z-[500] bg-theme-primary/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-theme shadow-xl space-y-1.5">
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-theme-secondary">
              <div className="w-5 h-[3px] rounded-full bg-gray-400 opacity-50" style={{ borderTop: '2px dashed #9ca3af' }} /> Previous Route
            </span>
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-accent">
              <div className="w-5 h-[3px] bg-accent rounded-full" /> Active Route
            </span>
            {showDisruption && (
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-danger">
                <div className="w-3 h-3 rounded-full bg-danger/30 border border-danger" /> Disruption Zone
              </span>
            )}
          </div>

          {/* Execution toast on map */}
          <AnimatePresence>
            {decided && execStatus && execStatus !== 'cancelled' && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute top-4 left-4 z-[500] bg-success/10 border border-success/30 backdrop-blur-lg px-4 py-2.5 rounded-xl shadow-xl">
                <p className="text-success font-bold text-xs flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Route optimized — decision applied
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <MapContainer key={mapKey} center={[23, 72]} zoom={5} scrollWheelZoom zoomControl={false}
            style={{ height: '100%', width: '100%', zIndex: 0 }}>
            <TileLayer
              attribution={theme === 'dark' ? '&copy; CartoDB' : '&copy; OSM'}
              url={theme === 'dark'
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'} />

            <FitBounds points={fitPoints} />
            <CustomZoom />

            {/* Original route — gray dashed (faded) */}
            {toPos(result?.map?.original_route).length > 1 && (
              <Polyline
                positions={toPos(result.map.original_route)}
                pathOptions={{ color: '#9ca3af', weight: 4, opacity: decided ? 0.15 : 0.4, dashArray: '8, 8' }} />
            )}

            {/* Pre-sim route */}
            {!result && toPos(active?.route_waypoints).length > 1 && (
              <Polyline
                positions={toPos(active.route_waypoints)}
                pathOptions={{ color: '#3b82f6', weight: 5, opacity: 1 }} />
            )}

            {/* AI route — blue bold */}
            {toPos(result?.map?.ai_route).length > 1 && (
              <Polyline
                positions={toPos(result.map.ai_route)}
                pathOptions={{ color: '#3b82f6', weight: 6, opacity: 1 }} />
            )}

            {/* Disruption zone — fades after reroute */}
            {result?.map?.disruption_zone?.lat && result?.map?.disruption_zone?.lng && (
              <Circle center={[result.map.disruption_zone.lat, result.map.disruption_zone.lng]}
                radius={15000}
                pathOptions={{
                  color: '#ef4444', fillColor: '#ef4444',
                  fillOpacity: decided ? 0.03 : 0.15,
                  weight: decided ? 1 : 2,
                  dashArray: '6, 4',
                  opacity: decided ? 0.2 : 1,
                }}>
                <Popup><span className="font-bold text-sm">⚠️ Simulated Disruption Zone</span></Popup>
              </Circle>
            )}

            {/* Real-time truck marker */}
            <RealTimeTruck
              position={active?.current_location}
              shipmentName={active?.shipment_name}
              rerouted={decided && execStatus !== 'cancelled'}
            />
          </MapContainer>
        </motion.div>
      </div>

      {/* ═══ BOTTOM SECTION: Results ═══ */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Human Baseline */}
            <div className="glass-panel p-5 rounded-2xl border border-theme relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-5"><Route className="w-20 h-20" /></div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-theme-secondary mb-3">Human Baseline</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-theme-secondary">Strategy</p>
                  <p className="font-bold text-theme-primary text-sm">Current Route (No Action)</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-theme-secondary">Risk</p>
                    <p className={`font-black text-lg ${riskClass(result.comparison.human.risk_level)}`}>
                      {result.comparison.human.risk_score.toFixed(1)}
                    </p>
                    <p className={`text-[10px] font-bold ${riskClass(result.comparison.human.risk_level)}`}>{result.comparison.human.risk_level}</p>
                  </div>
                  <div>
                    <p className="text-xs text-theme-secondary">Delay</p>
                    <p className="font-black text-lg text-danger">{fmtDelay(result.comparison.human.delay)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Optimized */}
            <div className="glass-panel p-5 rounded-2xl border border-accent relative overflow-hidden shadow-[0_0_30px_rgba(59,130,246,0.08)]">
              <div className="absolute top-0 right-0 p-3 opacity-5"><Activity className="w-20 h-20" /></div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-3">AI Optimized</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-accent/70">Strategy</p>
                  <p className="font-bold text-theme-primary text-sm">Dynamic Reroute</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-accent/70">Risk</p>
                    <p className={`font-black text-lg ${riskClass(result.comparison.ai.risk_level)}`}>
                      {result.comparison.ai.risk_score.toFixed(1)}
                    </p>
                    <p className={`text-[10px] font-bold ${riskClass(result.comparison.ai.risk_level)}`}>{result.comparison.ai.risk_level}</p>
                  </div>
                  <div>
                    <p className="text-xs text-accent/70">Delay</p>
                    <p className="font-black text-lg text-theme-primary">{fmtDelay(result.comparison.ai.delay)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Impact */}
            <div className="glass-panel p-5 rounded-2xl border border-theme flex flex-col justify-center gap-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-28 h-28 bg-success/10 blur-3xl rounded-full" />
              <div>
                <p className="text-xs text-theme-secondary flex items-center gap-1.5"><TrendingDown className="w-4 h-4 text-success" /> Delay Reduction</p>
                <p className="text-3xl font-black text-theme-primary tracking-tight">{result.impact.delay_reduction_percent}%</p>
              </div>
              <div>
                <p className="text-xs text-theme-secondary flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-success" /> Risk Reduced By</p>
                <p className="text-3xl font-black text-theme-primary tracking-tight">{result.impact.risk_reduction} pts</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ScenarioLab;