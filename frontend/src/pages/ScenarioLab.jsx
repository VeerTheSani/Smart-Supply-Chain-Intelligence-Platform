import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Play, TrendingDown, ShieldCheck, Activity,
  Route, AlertTriangle, Timer, Check, X, Zap, Loader2,
  Plus, Minus, MapPin, Navigation, Info, Clock, AlertCircle
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
  return (Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180 / Math.PI);
}

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

const riskClass = (l) => l === 'CRITICAL' || l === 'HIGH' ? 'text-red-500' : l === 'MEDIUM' ? 'text-yellow-500' : 'text-emerald-500';
const fmtDelay = (v) => (!v || v === 0) ? '+0.5h' : `+${v}h`;
const toPos = (arr) => (arr || []).filter(w => w?.lat && w?.lng).map(w => [w.lat, w.lng]);

const ScenarioLab = memo(function ScenarioLab() {
  const { theme } = useTheme();
  useShipments();
  const shipments = useShipmentStore(s => s.shipments);

  const [shipmentId, setShipmentId] = useState('');
  const [scenario, setScenario] = useState('storm');
  const [severity, setSeverity] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [mapKey, setMapKey] = useState(0);

  const [countdown, setCountdown] = useState(0);
  const [simId, setSimId] = useState(null);
  const [decided, setDecided] = useState(false);
  const [countdownActive, setCountdownActive] = useState(false);
  const [execStatus, setExecStatus] = useState(null);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const timerRef = useRef(null);
  const autoExecRef = useRef(null);

  useEffect(() => { if (shipments.length > 0 && !shipmentId) setShipmentId(shipments[0].id); }, [shipments, shipmentId]);
  useEffect(() => { setMapKey(k => k + 1); }, [theme]);

  const handleAccept = useCallback(async () => {
    if (!simId || decided || decisionLoading) return;
    setDecisionLoading(true); setCountdownActive(false);
    clearInterval(timerRef.current);
    try {
      await apiClient.post('/api/scenario/accept', { simulation_id: simId });
      setDecided(true); setExecStatus('accepted');
      toast.success('Route optimized — applied');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Accept failed');
    } finally { setDecisionLoading(false); }
  }, [simId, decided, decisionLoading]);

  const handleCancel = useCallback(async () => {
    if (!simId || decided || decisionLoading) return;
    setDecisionLoading(true); setCountdown(0); setCountdownActive(false);
    clearInterval(timerRef.current);
    try {
      await apiClient.post('/api/scenario/cancel', { simulation_id: simId });
      setDecided(true); setExecStatus('cancelled');
      toast.success('Countdown cancelled');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cancel failed');
    } finally { setDecisionLoading(false); }
  }, [simId, decided, decisionLoading]);

  useEffect(() => {
    autoExecRef.current = () => {
      if (simId && !decided && !decisionLoading && countdownActive && result?.decision?.action === 'reroute') handleAccept();
    };
  });

  useEffect(() => {
    if (!countdownActive || decided) { clearInterval(timerRef.current); return; }
    if (countdown <= 0) { clearInterval(timerRef.current); autoExecRef.current?.(); return; }
    timerRef.current = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [countdown, decided, countdownActive]);

  const handleRun = async () => {
    if (!shipmentId) return;
    setLoading(true); setResult(null); setError(null); setCountdown(0); setDecided(false);
    setSimId(null); setCountdownActive(false); setExecStatus(null); setDecisionLoading(false);
    try {
      const { data } = await apiClient.post('/api/scenario/run', {
        shipment_id: shipmentId, scenario, severity,
      });
      setResult(data); setSimId(data.simulation_id);
      if (data.decision?.action === 'reroute' && data.decision?.countdown > 0 && ['HIGH', 'CRITICAL'].includes(data.risk?.level)) {
        setCountdown(data.decision.countdown);
        setCountdownActive(true);
      }
      setMapKey(k => k + 1);
      toast.success('Simulation complete');
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || 'Simulation failed';
      setError(msg);
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const activeShipment = shipments.find(s => s.id === shipmentId);
  const fitPoints = (() => {
    const orig = toPos(result?.map?.original_route);
    if (orig.length > 1) return orig;
    const ai = toPos(result?.map?.ai_route);
    if (ai.length > 1) return ai;
    if (activeShipment?.current_location?.lat) return [[activeShipment.current_location.lat, activeShipment.current_location.lng]];
    return [];
  })();

  const showDisruption = result?.map?.disruption_zone?.lat && !decided;

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col gap-6 overflow-hidden">
      {/* Header Info */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-sm">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-theme-primary tracking-tight">Scenario Lab</h1>
            <p className="text-[10px] font-bold text-theme-secondary uppercase tracking-[0.2em]">Predictive Logistics Simulation</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {execStatus && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-sm",
                execStatus === 'accepted' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                  execStatus === 'auto_executed' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                    "bg-red-500/10 text-red-500 border-red-500/20"
              )}
            >
              {execStatus.replace('_', ' ')}
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left: Configuration Sidebar */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2">
          <section className="bg-theme-secondary dark:bg-[#0f172a] border border-theme dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-[10px] font-black text-theme-primary uppercase tracking-[0.2em] mb-5 pb-2 border-b border-theme/50">Configuration</h3>

            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-theme-secondary uppercase tracking-widest mb-2 block">Target Shipment</label>
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

              <div>
                <label className="text-[9px] font-black text-theme-secondary uppercase tracking-widest mb-2 block">Disruption Type</label>
                <div className="grid grid-cols-1 gap-2">
                  {SCENARIOS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setScenario(s.id)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer",
                        scenario === s.id
                          ? "bg-accent/10 border-accent/40 text-accent"
                          : "bg-theme-tertiary dark:bg-slate-900/50 border-theme dark:border-slate-800 text-theme-secondary hover:bg-theme-tertiary/80"
                      )}
                    >
                      <span className="text-base">{s.icon}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-theme-secondary uppercase tracking-widest mb-2 block">Severity Profile</label>
                <div className="flex p-1 bg-theme-tertiary dark:bg-slate-900 rounded-xl border border-theme dark:border-slate-800">
                  {SEVERITIES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSeverity(s.id)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                        severity === s.id
                          ? "bg-theme-secondary dark:bg-slate-800 text-theme-primary shadow-sm border border-theme dark:border-slate-700"
                          : "text-theme-secondary hover:text-theme-primary"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleRun}
                disabled={loading || !shipmentId}
                className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 text-white rounded-xl py-3 text-xs font-black uppercase tracking-[0.15em] shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer active:scale-95"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Initiate Simulation
              </button>
            </div>
          </section>

          <AnimatePresence>
            {result && !error && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-theme-secondary dark:bg-[#0f172a] border border-theme dark:border-slate-800 rounded-2xl p-5 shadow-sm"
              >
                <h3 className="text-[10px] font-black text-theme-primary uppercase tracking-[0.2em] mb-4 pb-2 border-b border-theme/50">Impact Analysis</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-theme-secondary uppercase tracking-widest">Risk Level</span>
                    <span className={cn("text-[10px] font-black uppercase tracking-widest", riskClass(result.risk?.level))}>
                      {result.risk?.level}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-theme-secondary uppercase tracking-widest">Confidence</span>
                    <span className="text-[10px] font-black text-theme-primary">{result.risk?.confidence}%</span>
                  </div>
                  <div className="pt-2">
                    <div className="text-[9px] font-black text-theme-secondary uppercase tracking-widest mb-2">Key Anomalies</div>
                    <div className="space-y-1.5">
                      {result.risk?.factors?.slice(0, 3).map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] text-theme-primary font-medium leading-tight">
                          <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Map & Results Area */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <AnimatePresence>
            {result && !error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="grid grid-cols-4 gap-4 shrink-0"
              >
                <MetricCard label="Latency Shift" value={fmtDelay(result.impact?.delay_hours)} sub="Estimated Arrival" icon={TrendingDown} color="red" />
                <MetricCard label="Reliability" value={result.risk?.level === 'LOW' ? '98%' : '74%'} sub="Score" icon={ShieldCheck} color="green" />
                <MetricCard label="Impact" value="Simulation" sub="Analysis" icon={Activity} color="blue" />
                <MetricCard label="Strategy" value={result.decision?.action === 'reroute' ? 'Optimize' : 'Monitor'} sub="Proposed" icon={Route} color="purple" />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 relative bg-theme-secondary border border-theme dark:border-slate-800 rounded-2xl overflow-hidden shadow-inner group">
            {loading && (
              <div className="absolute inset-0 z-[600] bg-theme-primary/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-10 h-10 text-accent animate-spin" />
                <p className="text-theme-primary font-bold text-sm">Running Simulation…</p>
                <p className="text-theme-secondary text-xs">Analyzing risk & generating routes</p>
              </div>
            )}

            {result && <CustomZoom />}

            <MapContainer
              key={`${theme}-${mapKey}`}
              center={[20, 78]}
              zoom={5}
              className="w-full h-full grayscale-[0.2] dark:invert-[0.9] dark:hue-rotate-[180deg] z-0"
              zoomControl={false}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitBounds points={fitPoints} />

              {result && (
                <>
                  <Polyline positions={toPos(result.map?.original_route)} color="#94a3b8" weight={3} dashArray="5, 8" opacity={0.6} />
                  <Polyline positions={toPos(result.map?.ai_route)} color="#3b82f6" weight={5} opacity={0.8} />

                  <RealTimeTruck
                    position={activeShipment?.current_location}
                    shipmentName={activeShipment?.shipment_name}
                    rerouted={decided && execStatus !== 'cancelled'}
                  />

                  {showDisruption && (
                    <Circle center={[result.map.disruption_zone.lat, result.map.disruption_zone.lng]} radius={15000} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.1, weight: 2 }} />
                  )}
                </>
              )}
            </MapContainer>

            {/* Decision Logic Overlay */}
            <AnimatePresence>
              {result && result.decision?.action === 'reroute' && !decided && countdownActive && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="absolute bottom-6 right-6 w-[340px] z-[500]"
                >
                  <div className="bg-theme-secondary dark:bg-[#0f172a] border border-theme dark:border-slate-800 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl">
                    <div className="px-5 py-4 bg-gradient-to-r from-accent/20 to-transparent border-b border-theme dark:border-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Route className="w-4 h-4 text-accent" />
                        <span className="text-[10px] font-black text-theme-primary uppercase tracking-[0.15em]">Decision Intel</span>
                      </div>
                      {countdown > 0 && (
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
                          <Timer className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                          <span className="text-[11px] font-mono font-bold text-red-500">{countdown}s</span>
                        </div>
                      )}
                    </div>

                    <div className="p-5 space-y-4">
                      <p className="text-[11px] font-bold text-theme-primary leading-snug">
                        Autonomous System recommends <span className="text-accent underline decoration-accent/30 underline-offset-2">Active Rerouting</span> due to predicted risk cascade.
                      </p>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="p-2 rounded-xl bg-theme-tertiary dark:bg-slate-900 border border-theme dark:border-slate-800 text-center">
                          <div className="text-[8px] font-black text-theme-secondary uppercase mb-1">Time Delta</div>
                          <div className="text-xs font-bold text-theme-primary font-mono">{fmtDelay(result.impact?.delay_hours)}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-theme-tertiary dark:bg-slate-900 border border-theme dark:border-slate-800 text-center">
                          <div className="text-[8px] font-black text-theme-secondary uppercase mb-1">Reliability</div>
                          <div className="text-xs font-bold text-emerald-500 font-mono">+12.4%</div>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleAccept}
                          disabled={decisionLoading}
                          className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                        >
                          {decisionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Accept
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={decisionLoading}
                          className="flex-1 py-2.5 rounded-xl border border-theme text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Map Legend */}
            {result && (
              <div className="absolute bottom-6 left-6 z-[500] flex flex-col gap-2">
                <div className="bg-theme-secondary dark:bg-[#0f172a]/90 backdrop-blur-md border border-theme dark:border-slate-800 rounded-xl px-3 py-2 flex items-center gap-4 shadow-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-slate-400 opacity-50 border-t border-dashed" />
                    <span className="text-[9px] font-bold text-theme-secondary uppercase tracking-widest">Baseline</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-1 bg-blue-500 rounded-full" />
                    <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">Simulation</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comparison Results */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
            <ComparisonCard title="Human Baseline" data={result.comparison?.human} variant="neutral" />
            <ComparisonCard title="AI Optimized" data={result.comparison?.ai} variant="accent" />
            <ImpactSummaryCard impact={result.impact} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

function MetricCard({ label, value, sub, icon: Icon, color }) {
  const colors = {
    red: "bg-red-500/10 text-red-500 border-red-500/20 shadow-red-500/5",
    green: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-emerald-500/5",
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-blue-500/5",
    purple: "bg-purple-500/10 text-purple-500 border-purple-500/20 shadow-purple-500/5",
  };
  return (
    <motion.div className="bg-theme-secondary dark:bg-[#0f172a] border border-theme dark:border-slate-800 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner", colors[color])}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] font-black text-theme-secondary uppercase tracking-[0.15em] mb-1">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-black text-theme-primary">{value}</span>
          <span className="text-[10px] font-bold text-theme-secondary uppercase">{sub}</span>
        </div>
      </div>
    </motion.div>
  );
}

function ComparisonCard({ title, data, variant }) {
  if (!data) return null;
  return (
    <div className={cn(
      "p-5 rounded-2xl border relative overflow-hidden",
      variant === 'accent' ? "bg-accent/5 border-accent/20" : "bg-theme-secondary dark:bg-[#0f172a] border-theme dark:border-slate-800"
    )}>
      <h3 className={cn("text-[10px] font-black uppercase tracking-[0.2em] mb-4", variant === 'accent' ? "text-accent" : "text-theme-secondary")}>{title}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-theme-secondary mb-1">Risk Score</p>
          <p className={cn("text-xl font-black", riskClass(data.risk_level))}>{data.risk_score?.toFixed(1)}</p>
          <p className={cn("text-[10px] font-black uppercase", riskClass(data.risk_level))}>{data.risk_level}</p>
        </div>
        <div>
          <p className="text-xs text-theme-secondary mb-1">Est. Delay</p>
          <p className="text-xl font-black text-theme-primary">{fmtDelay(data.delay)}</p>
        </div>
      </div>
    </div>
  );
}

function ImpactSummaryCard({ impact }) {
  if (!impact) return null;
  return (
    <div className="bg-emerald-500/5 border border-emerald-500/20 p-5 rounded-2xl flex flex-col justify-center gap-4">
      <div>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-2 uppercase tracking-widest"><TrendingDown className="w-4 h-4" /> Delay Reduced</p>
        <p className="text-3xl font-black text-theme-primary">{impact.delay_reduction_percent}%</p>
      </div>
      <div>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-2 uppercase tracking-widest"><ShieldCheck className="w-4 h-4" /> Risk Reduction</p>
        <p className="text-3xl font-black text-theme-primary">{impact.risk_reduction} pts</p>
      </div>
    </div>
  );
}

export default ScenarioLab;