import { memo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Polyline, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X, ActivitySquare, Clock, Route, ShieldAlert,
  Zap, Shield, Star, CloudRain, CheckCircle2, TrendingUp, MapPin,
} from 'lucide-react';
import { useRerouting, useScoreReroute } from '../../hooks/useShipments';
import { useShipmentStore } from '../../stores/shipmentStore';
import LoadingSpinner from './LoadingSpinner';
import toast from 'react-hot-toast';
import { cn } from '../../lib/utils';

// ── Route metadata ────────────────────────────────────────────────────────────

const ROUTE_META = {
  Recommended: {
    icon: Star,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    mapColor: '#818cf8',
    weight: 4,
    dash: null,
    glow: '0 0 12px rgba(129,140,248,0.5)',
  },
  Fastest: {
    icon: Zap,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    border: 'border-yellow-400/30',
    mapColor: '#facc15',
    weight: 3,
    dash: '10 6',
    glow: '0 0 10px rgba(250,204,21,0.35)',
  },
  Safest: {
    icon: Shield,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/30',
    mapColor: '#34d399',
    weight: 3,
    dash: '6 8',
    glow: null,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const riskColor = (level) => {
  switch (level) {
    case 'high':
    case 'critical': return 'text-red-400';
    case 'medium':   return 'text-yellow-400';
    default:         return 'text-emerald-400';
  }
};

const riskBarColor = (level) => {
  switch (level) {
    case 'high':
    case 'critical': return '#ef4444';
    case 'medium':   return '#eab308';
    default:         return '#34d399';
  }
};

// ── Map sub-components ────────────────────────────────────────────────────────

function FitAlts({ waypoints }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    const pts = waypoints
      .flat()
      .filter(wp => wp?.lat != null && wp?.lng != null)
      .map(wp => [wp.lat, wp.lng]);
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 9 });
      fitted.current = true;
    }
  }, [map, waypoints]);

  return null;
}

function RouteMapInner({ alternatives, primaryWaypoints, originCoords, destCoords, currentRoute }) {
  // Build current-route positions: prefer full waypoints, fall back to straight O→D line
  const currentPositions = primaryWaypoints?.length > 1
    ? primaryWaypoints.map(wp => [wp.lat, wp.lng])
    : (originCoords && destCoords)
      ? [[originCoords.lat, originCoords.lng], [destCoords.lat, destCoords.lng]]
      : null;

  const allWaypoints = [
    currentPositions?.map(([lat, lng]) => ({ lat, lng })),
    ...alternatives.map(a => a.waypoints),
  ].filter(a => a?.length > 1);

  return (
    <>
      <FitAlts waypoints={allWaypoints} />

      {/* ── Current route — white/slate, clearly labelled ── */}
      {currentPositions && (
        <>
          {/* Outer glow layer */}
          <Polyline
            positions={currentPositions}
            pathOptions={{ color: '#ffffff', weight: 6, opacity: 0.06, dashArray: null }}
          />
          {/* Main line */}
          <Polyline
            positions={currentPositions}
            pathOptions={{ color: '#94a3b8', weight: 3, opacity: 0.85, dashArray: '6 9', lineCap: 'round' }}
          >
            <Tooltip sticky direction="top">
              <span style={{ fontSize: 11, fontWeight: 700 }}>
                Current Route
                {currentRoute?.distance ? ` · ${currentRoute.distance.toFixed(0)} km` : ''}
                {currentRoute?.eta ? ` · ${(currentRoute.eta / 3600).toFixed(1)} hrs` : ''}
              </span>
            </Tooltip>
          </Polyline>
        </>
      )}

      {/* ── Alternative routes ── */}
      {alternatives.map((alt, i) => {
        const meta = ROUTE_META[alt.label] ?? ROUTE_META.Recommended;
        if (!alt.waypoints?.length) return null;
        const positions = alt.waypoints.map(wp => [wp.lat, wp.lng]);

        return (
          <Polyline
            key={alt.route_id ?? i}
            positions={positions}
            pathOptions={{
              color: meta.mapColor,
              weight: meta.weight,
              opacity: alt.label === 'Recommended' ? 0.95 : 0.72,
              dashArray: meta.dash,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          >
            <Tooltip sticky direction="top">
              <span style={{ fontSize: 11, fontWeight: 700 }}>
                {alt.label} · {alt.distance?.toFixed(0)} km · {((alt.eta ?? alt.duration_seconds ?? 0) / 3600).toFixed(1)} hrs
              </span>
            </Tooltip>
          </Polyline>
        );
      })}

      {/* ── Origin marker (green dot) ── */}
      {originCoords && (
        <CircleMarker
          center={[originCoords.lat, originCoords.lng]}
          radius={6}
          pathOptions={{ color: '#22c55e', fillColor: '#0f172a', fillOpacity: 1, weight: 2.5 }}
        >
          <Tooltip direction="top" permanent={false}>
            <span style={{ fontSize: 11 }}>📦 Origin</span>
          </Tooltip>
        </CircleMarker>
      )}

      {/* ── Destination marker (red dot) ── */}
      {destCoords && (
        <CircleMarker
          center={[destCoords.lat, destCoords.lng]}
          radius={6}
          pathOptions={{ color: '#ef4444', fillColor: '#0f172a', fillOpacity: 1, weight: 2.5 }}
        >
          <Tooltip direction="top" permanent={false}>
            <span style={{ fontSize: 11 }}>🏁 Destination</span>
          </Tooltip>
        </CircleMarker>
      )}
    </>
  );
}

function RouteMap({ alternatives, primaryWaypoints, originCoords, destCoords, currentRoute }) {
  if (!alternatives?.length) return null;

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/[0.07] shadow-inner" style={{ height: 240 }}>
      <MapContainer
        center={[22, 79]}
        zoom={5}
        scrollWheelZoom
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <RouteMapInner
          alternatives={alternatives}
          primaryWaypoints={primaryWaypoints}
          originCoords={originCoords}
          destCoords={destCoords}
          currentRoute={currentRoute}
        />
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-[800] flex flex-col gap-1 bg-black/70 backdrop-blur-sm px-2.5 py-2 rounded-lg border border-white/10 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 7" /></svg>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Your route</span>
        </div>
        {Object.entries(ROUTE_META).map(([label, meta]) => (
          <div key={label} className="flex items-center gap-1.5">
            <svg width="20" height="4">
              <line x1="0" y1="2" x2="20" y2="2"
                stroke={meta.mapColor}
                strokeWidth={label === 'Recommended' ? 3 : 2}
                strokeDasharray={meta.dash ?? ''}
              />
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: meta.mapColor }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="absolute top-2 right-2 z-[800] text-[9px] text-slate-600 bg-black/50 px-2 py-1 rounded-md border border-white/[0.06] pointer-events-none">
        Hover routes · scroll to zoom
      </div>
    </div>
  );
}

// ── Current route comparison card ─────────────────────────────────────────────

function CurrentRouteCard({ currentRoute, isScored }) {
  if (!currentRoute) return null;
  const etaHrs = ((currentRoute.eta ?? 0) / 3600).toFixed(1);
  const level  = currentRoute.risk_level ?? 'unknown';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0">
          <Route className="w-4 h-4 text-slate-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Current Route</p>
          <p className="text-xs text-white font-bold mt-0.5 truncate">Active path</p>
        </div>
      </div>

      <div className="flex items-center gap-5 shrink-0">
        <div className="text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-wide">ETA</p>
          <p className="text-sm font-bold text-white tabular-nums">{etaHrs} hrs</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-wide">Distance</p>
          <p className="text-sm font-bold text-white tabular-nums">{currentRoute.distance?.toFixed(0) ?? '—'} km</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-wide">Risk</p>
          <p className={cn('text-sm font-black tabular-nums', riskColor(level))}>
            {isScored
              ? `${currentRoute.risk_score?.toFixed(0) ?? '—'}/100`
              : level.toUpperCase()}
          </p>
        </div>
        <div className="h-6 w-px bg-white/[0.07]" />
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <div className="w-3 h-[2px] rounded bg-slate-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#94a3b8 0,#94a3b8 4px,transparent 4px,transparent 9px)' }} />
          map
        </div>
      </div>
    </motion.div>
  );
}

// ── Route card ────────────────────────────────────────────────────────────────

function StatRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500 flex items-center gap-1.5">
        <Icon className="w-3 h-3 opacity-60" /> {label}
      </span>
      {children}
    </div>
  );
}

function RouteCard({ alt, isScoring, index }) {
  const meta   = ROUTE_META[alt.label] ?? ROUTE_META.Recommended;
  const Icon   = meta.icon;
  const etaHrs = ((alt.eta ?? alt.duration_seconds ?? 0) / 3600).toFixed(1);
  const hasRisk = alt.risk_assessed;
  const isRec  = alt.label === 'Recommended';

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative rounded-2xl border flex flex-col overflow-hidden',
        meta.border, meta.bg,
        isRec && 'ring-1 ring-indigo-500/35 shadow-lg shadow-indigo-900/30'
      )}
    >
      {/* Top bar */}
      <div
        className="h-[3px] w-full"
        style={{ backgroundColor: meta.mapColor, boxShadow: meta.glow ?? 'none' }}
      />

      {isRec && (
        <motion.div
          initial={{ opacity: 0, x: 5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute top-2.5 right-3 text-[9px] font-black tracking-[0.14em] text-indigo-400 uppercase flex items-center gap-1"
        >
          <Star className="w-2.5 h-2.5 fill-indigo-400" /> Optimal
        </motion.div>
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Label */}
        <div className="flex items-center gap-2.5">
          <div className={cn('p-1.5 rounded-lg border', meta.bg, meta.border)}>
            <Icon className={cn('w-3.5 h-3.5', meta.color)} />
          </div>
          <div>
            <p className={cn('text-[11px] font-black uppercase tracking-[0.12em]', meta.color)}>
              {alt.label}
            </p>
            <p className="text-slate-600 text-[10px] font-mono">Route {alt.route_id}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-2">
          <StatRow icon={Clock} label="ETA">
            <span className="text-white font-bold tabular-nums">{etaHrs} hrs</span>
          </StatRow>
          <StatRow icon={Route} label="Distance">
            <span className="text-white font-bold tabular-nums">
              {alt.distance?.toFixed(0) ?? '—'} km
            </span>
          </StatRow>
          {alt.extra_time_minutes > 0 && (
            <StatRow icon={TrendingUp} label="Extra time">
              <span className="text-yellow-400 font-bold tabular-nums">+{alt.extra_time_minutes} min</span>
            </StatRow>
          )}
        </div>

        {/* Risk */}
        <div className="border-t border-white/[0.06] pt-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
            <span className="text-slate-500 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" /> Risk
            </span>
            <AnimatePresence mode="wait">
              {isScoring ? (
                <motion.span key="scoring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <LoadingSpinner size="sm" color="bg-slate-600" />
                </motion.span>
              ) : hasRisk ? (
                <motion.span
                  key="scored"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  className={cn('font-black', riskColor(alt.risk_level))}
                >
                  {alt.risk_score?.toFixed(0)}/100 · {alt.risk_level?.toUpperCase()}
                </motion.span>
              ) : (
                <motion.span key="pending" className="text-slate-600 italic text-[9px] font-normal normal-case">
                  Not assessed
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="h-[3px] w-full bg-white/[0.05] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: hasRisk ? riskBarColor(alt.risk_level) : '#1e293b' }}
              initial={{ width: 0 }}
              animate={{ width: hasRisk ? `${Math.max(4, alt.risk_score ?? 0)}%` : '0%' }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            />
          </div>

          <AnimatePresence>
            {hasRisk && alt.reason && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="text-slate-500 text-[10px] italic leading-relaxed overflow-hidden"
              >
                <CloudRain className="w-2.5 h-2.5 inline mr-1 opacity-50" />
                {alt.reason}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

const RerouteModal = memo(function RerouteModal({ shipmentId, onClose }) {
  const { data, isLoading, error } = useRerouting(shipmentId);
  const scoreMutation = useScoreReroute();
  const [scoredAlts, setScoredAlts] = useState(null);

  const shipment = useShipmentStore(
    state => state.shipments.find(s => s.id === shipmentId)
  );
  const primaryWaypoints = shipment?.route_waypoints;
  const originCoords     = shipment?.origin_coords;
  const destCoords       = shipment?.destination_coords;

  const alternatives = scoredAlts ?? data?.alternatives ?? [];
  const isScoring    = scoreMutation.isPending;
  const isScored     = !!scoredAlts;

  useEffect(() => { setScoredAlts(null); }, [shipmentId]);

  const handleAssessRisk = async () => {
    if (!data?.alternatives?.length) return;
    try {
      const result = await scoreMutation.mutateAsync({
        id: shipmentId,
        alternatives: data.alternatives,
      });
      setScoredAlts(result.scored_alternatives);
      toast.success('Risk assessment complete.');
    } catch {
      toast.error('Risk assessment failed. Try again.');
    }
  };

  return (
    <AnimatePresence>
      {shipmentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/72 backdrop-blur-lg"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative bg-[#0d1117] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl border border-white/[0.07] flex flex-col max-h-[92vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Top shimmer line */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="p-2 bg-indigo-500/15 rounded-xl border border-indigo-500/25">
                  <ActivitySquare className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-white tracking-tight">
                    Reroute Intelligence
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Shipment&nbsp;
                    <span className="font-mono text-slate-300">{shipmentId?.slice(-8)}</span>
                    {isScored && (
                      <motion.span
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="ml-2 inline-flex items-center gap-1 text-emerald-400 text-[10px] font-bold"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Risk assessed
                      </motion.span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-600 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {isLoading ? (
                <div className="py-32 flex flex-col items-center gap-5">
                  <LoadingSpinner size="lg" label="Computing alternative corridors…" />
                  <p className="text-slate-600 text-[10px] tracking-widest uppercase font-bold animate-pulse">
                    Mappls routing · traffic analysis
                  </p>
                </div>
              ) : error ? (
                <div className="py-24 text-center space-y-3">
                  <ShieldAlert className="w-10 h-10 text-red-400 mx-auto opacity-40" />
                  <p className="text-white font-bold">Failed to load routes</p>
                  <p className="text-slate-500 text-sm">{error.message}</p>
                  <button
                    onClick={onClose}
                    className="mt-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold cursor-pointer transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : data ? (
                <>
                  {/* Alert banner */}
                  <AnimatePresence>
                    {data.reroute_suggested && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="bg-red-500/[0.06] border border-red-500/20 p-3.5 rounded-xl flex items-start gap-3"
                      >
                        <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-red-400 font-black text-[10px] uppercase tracking-widest mb-1">
                            Reroute Recommended
                          </p>
                          <p className="text-slate-300 text-[13px] leading-snug">{data.reason}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Live map */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                  >
                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> Live corridor comparison
                    </p>
                    <RouteMap
                      alternatives={alternatives}
                      primaryWaypoints={primaryWaypoints}
                      originCoords={originCoords}
                      destCoords={destCoords}
                      currentRoute={data?.current_route}
                    />
                  </motion.div>

                  {/* Current route comparison strip */}
                  <CurrentRouteCard currentRoute={data?.current_route} isScored={isScored} />

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/[0.05]" />
                    <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Alternatives</span>
                    <div className="flex-1 h-px bg-white/[0.05]" />
                  </div>

                  {/* Route cards */}
                  <div className="grid gap-3 md:grid-cols-3">
                    {alternatives.map((alt, i) => (
                      <RouteCard
                        key={alt.route_id ?? i}
                        alt={alt}
                        isScoring={isScoring}
                        index={i}
                      />
                    ))}
                  </div>

                  {/* Assess Risk CTA */}
                  <div className="border-t border-white/[0.05] pt-4">
                    <AnimatePresence mode="wait">
                      {isScored ? (
                        <motion.div
                          key="done"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center justify-center gap-2 py-3 text-emerald-400 font-bold text-sm"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Full risk assessment complete — routes updated above
                        </motion.div>
                      ) : (
                        <motion.button
                          key="assess"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          whileHover={{ scale: 1.005 }}
                          whileTap={{ scale: 0.985 }}
                          onClick={handleAssessRisk}
                          disabled={isScoring}
                          className={cn(
                            'w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm transition-all cursor-pointer',
                            isScoring
                              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 cursor-not-allowed'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/60'
                          )}
                        >
                          {isScoring ? (
                            <>
                              <LoadingSpinner size="sm" color="bg-indigo-400" />
                              <span>Analyzing weather &amp; traffic…</span>
                            </>
                          ) : (
                            <>
                              <CloudRain className="w-4 h-4" />
                              Assess Risk &amp; Weather
                            </>
                          )}
                        </motion.button>
                      )}
                    </AnimatePresence>
                    {!isScored && !isScoring && (
                      <p className="text-center text-slate-700 text-[11px] mt-2">
                        Routes use traffic data only · click above to add live weather scoring
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

export default RerouteModal;
