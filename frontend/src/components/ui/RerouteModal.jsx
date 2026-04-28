import { memo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Polyline, Marker, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, ActivitySquare, Clock, Route, ShieldAlert,
  Zap, Shield, Star, CloudRain, CheckCircle2, TrendingUp, MapPin, AlertTriangle, Navigation, RefreshCw, Sparkles
} from 'lucide-react';
import { useRerouting, useScoreReroute, useApplyReroute } from '../../hooks/useShipments';
import { useShipmentStore } from '../../stores/shipmentStore';
import { useTheme } from '../../context/ThemeContext';
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
  Avoidance: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    border: 'border-orange-400/30',
    mapColor: '#fb923c',
    weight: 3,
    dash: '4 5',
    glow: '0 0 10px rgba(251,146,60,0.35)',
  },
  'Gemini Route': {
    icon: Sparkles,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    mapColor: '#a78bfa',
    weight: 3,
    dash: '7 4',
    glow: '0 0 14px rgba(167,139,250,0.55)',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodePolyline(encoded) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, b;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

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

const formatEtaModal = (seconds) => {
  if (!seconds) return '0h';
  const hours = seconds / 3600;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  if (d > 0) return `${d}d ${h}h`;
  return `${hours.toFixed(1)}h`;
};

// ── Map sub-components ────────────────────────────────────────────────────────

function FitAlts({ alternatives, primaryWaypoints }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    const pts = [];
    primaryWaypoints?.forEach(wp => pts.push([wp.lat, wp.lng]));
    alternatives?.forEach(alt => {
      if (alt.geometry_encoded) {
        decodePolyline(alt.geometry_encoded).forEach(p => pts.push(p));
      } else {
        alt.waypoints?.forEach(wp => pts.push([wp.lat, wp.lng]));
      }
    });
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 9 });
      fitted.current = true;
    }
  }, [map, alternatives, primaryWaypoints]);

  return null;
}

const INCIDENT_COLOR = {
  ROAD_CLOSED: '#ef4444',
  ACCIDENT:    '#ef4444',
  JAM:         '#f97316',
  ROAD_WORKS:  '#f97316',
};

const SEVERITY_LABELS = ['Unknown', 'Minor', 'Moderate', 'Major', 'Critical'];

function RouteMapInner({ alternatives, primaryWaypoints, primaryGeometryEncoded, originCoords, destCoords, currentRoute, hoveredId, incidents, shipment }) {
  const currentPositions = primaryGeometryEncoded
    ? decodePolyline(primaryGeometryEncoded)
    : primaryWaypoints?.length > 1
      ? primaryWaypoints.map(wp => [wp.lat, wp.lng])
      : (originCoords && destCoords)
        ? [[originCoords.lat, originCoords.lng], [destCoords.lat, destCoords.lng]]
        : null;

  const [liveLocation, setLiveLocation] = useState(null);

  useEffect(() => {
    if (!shipment?.created_at || !shipment?.expected_travel_seconds || !currentPositions || currentPositions.length < 2) return;

    // Fast euclidean coordinate interpolator for visual map placement
    const getInterpolatedPoint = (positions, progressFrac) => {
      if (progressFrac <= 0) return positions[0];
      if (progressFrac >= 1) return positions[positions.length - 1];
      let totalDist = 0;
      const dists = [];
      for (let i = 0; i < positions.length - 1; i++) {
         const dx = positions[i+1][1] - positions[i][1];
         const dy = positions[i+1][0] - positions[i][0];
         const d = Math.sqrt(dx*dx + dy*dy);
         dists.push(d);
         totalDist += d;
      }
      const targetDist = totalDist * progressFrac;
      let currDist = 0;
      for (let i = 0; i < positions.length - 1; i++) {
         if (currDist + dists[i] >= targetDist) {
            const segmentFrac = dists[i] === 0 ? 0 : (targetDist - currDist) / dists[i];
            const lat = positions[i][0] + (positions[i+1][0] - positions[i][0]) * segmentFrac;
            const lng = positions[i][1] + (positions[i+1][1] - positions[i][1]) * segmentFrac;
            return [lat, lng];
         }
         currDist += dists[i];
      }
      return positions[positions.length - 1];
    };

    const updatePosition = () => {
      if (shipment.status === 'planned') {
         setLiveLocation(getInterpolatedPoint(currentPositions, 0));
         return;
      }
      if (shipment.status === 'delivered') {
         setLiveLocation(getInterpolatedPoint(currentPositions, 1));
         return;
      }

      const created = new Date(shipment.created_at).getTime();
      const elapsedSec = (Date.now() - created) / 1000;
      const progress = Math.min((elapsedSec * 5) / shipment.expected_travel_seconds, 1);
      setLiveLocation(getInterpolatedPoint(currentPositions, progress));
    };

    updatePosition();
    const interval = setInterval(updatePosition, 1000); 
    return () => clearInterval(interval);
  }, [shipment, currentPositions]);

  return (
    <>
      <FitAlts alternatives={alternatives} primaryWaypoints={primaryWaypoints} />

      {/* ── Live Moving Truck Marker ── */}
      {liveLocation && (
        <Marker 
          position={liveLocation}
          zIndexOffset={999}
          icon={L.divIcon({
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            html: `
              <div class="relative w-full h-full flex items-center justify-center">
                <div class="absolute inset-0 rounded-full bg-indigo-500 opacity-50 animate-ping"></div>
                <div class="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center border-2 border-theme shadow-[0_0_15px_rgba(79,70,229,0.9)] z-10">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="1" y="3" width="15" height="13"></rect>
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                    <circle cx="5.5" cy="18.5" r="2.5"></circle>
                    <circle cx="18.5" cy="18.5" r="2.5"></circle>
                  </svg>
                </div>
              </div>
            `
          })}
        >
          <Tooltip direction="top" className="font-bold text-xs">Simulated Live Location</Tooltip>
        </Marker>
      )}

      {/* ── Current route — white/slate, clearly labelled ── */}
      {currentPositions && (
        <>
          <Polyline
            positions={currentPositions}
            pathOptions={{ color: '#ffffff', weight: 6, opacity: 0.06, dashArray: null }}
          />
          <Polyline
            positions={currentPositions}
            pathOptions={{ color: '#94a3b8', weight: 3, opacity: 0.85, dashArray: '6 9', lineCap: 'round' }}
          >
            <Tooltip sticky direction="top">
              <span style={{ fontSize: 11, fontWeight: 700 }}>
                Current Route
                {currentRoute?.distance ? ` · ${currentRoute.distance.toFixed(0)} km` : ''}
                {currentRoute?.eta ? ` · ${formatEtaModal(currentRoute.eta)}` : ''}
              </span>
            </Tooltip>
          </Polyline>
        </>
      )}

      {/* ── Alternative routes ── */}
      {alternatives.map((alt, i) => {
        const meta = ROUTE_META[alt.label] ?? ROUTE_META.Avoidance;
        const positions = alt.geometry_encoded
          ? decodePolyline(alt.geometry_encoded)
          : alt.waypoints?.map(wp => [wp.lat, wp.lng]);
        if (!positions?.length) return null;

        const isHovered = hoveredId === alt.route_id;

        return (
          <Polyline
            key={alt.route_id ?? i}
            positions={positions}
            pathOptions={{
              color: meta.mapColor,
              weight: isHovered ? meta.weight + 2 : meta.weight,
              opacity: isHovered ? 1 : 0.55,
              dashArray: meta.dash,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          >
            <Tooltip sticky direction="top">
              <span style={{ fontSize: 11, fontWeight: 700 }}>
                {alt.label} · {alt.distance?.toFixed(0)} km · {formatEtaModal(alt.eta ?? alt.duration_seconds)}
              </span>
            </Tooltip>
          </Polyline>
        );
      })}

      {/* ── Origin marker ── */}
      {originCoords && (
        <Marker
          position={[originCoords.lat, originCoords.lng]}
          icon={L.icon({
            iconUrl: '/stoppointIcon.webp',
            iconSize: [28, 28],
            iconAnchor: [14, 28] // assumes a pin-style icon, anchors bottom-center
          })}
        >
          <Tooltip direction="top" permanent={false}>
            <span style={{ fontSize: 11, fontWeight: 'bold' }}>📦 Origin</span>
          </Tooltip>
        </Marker>
      )}

      {/* ── Destination marker ── */}
      {destCoords && (
        <Marker
          position={[destCoords.lat, destCoords.lng]}
          icon={L.icon({
            iconUrl: '/stoppointIcon.webp',
            iconSize: [28, 28],
            iconAnchor: [14, 28] // anchors bottom-center
          })}
        >
          <Tooltip direction="top" permanent={false}>
            <span style={{ fontSize: 11, fontWeight: 'bold' }}>🏁 Destination</span>
          </Tooltip>
        </Marker>
      )}

      {/* ── Incidents on current route — banner style ── */}
      {incidents?.map((inc, i) => {
        const color = INCIDENT_COLOR[inc.type] ?? '#facc15';
        const label = inc.type.replace(/_/g, ' ');
        const emoji = inc.type === 'ROAD_CLOSED' ? '🚧'
          : inc.type === 'ACCIDENT' ? '💥'
          : inc.type === 'JAM' ? '🚦'
          : inc.type === 'FLOODING' ? '🌊'
          : inc.type === 'HIGH_WINDS' ? '🌬️'
          : inc.type === 'ROAD_WORKS' ? '👷'
          : '⚠️';
        const icon = L.divIcon({
          className: '',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          html: `<div style="font-size:18px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.7))">${emoji}</div>`,
        });
        return (
          <Marker key={`inc-${i}`} position={[inc.lat, inc.lng]} icon={icon}>
            <Tooltip direction="top" offset={[0, -4]}>
              <div style={{ fontSize: 11, maxWidth: 200 }}>
                <strong style={{ color, display: 'block', marginBottom: 2 }}>
                  {label}
                </strong>
                {inc.description && <span style={{ color: '#334155' }}>{inc.description}</span>}
                {inc.severity > 0 && (
                  <span style={{ display: 'block', color: '#64748b', fontSize: 10, marginTop: 2 }}>
                    Severity: {SEVERITY_LABELS[inc.severity] ?? 'Unknown'}
                  </span>
                )}
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

function RouteMap({ alternatives, primaryWaypoints, primaryGeometryEncoded, originCoords, destCoords, currentRoute, hoveredId, incidents, theme }) {
  if (!alternatives?.length) return null;

  return (
    <div className="relative rounded-xl overflow-hidden border border-theme shadow-inner" style={{ height: 240 }}>
      <MapContainer
        center={[22, 79]}
        zoom={5}
        scrollWheelZoom
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        <TileLayer url={theme === "light" ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"} />
        <RouteMapInner
          alternatives={alternatives}
          primaryWaypoints={primaryWaypoints}
          primaryGeometryEncoded={primaryGeometryEncoded}
          originCoords={originCoords}
          destCoords={destCoords}
          incidents={incidents}
          currentRoute={currentRoute}
          hoveredId={hoveredId}
        />
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-[800] flex flex-col gap-1 bg-theme-secondary/80 backdrop-blur-sm px-2.5 py-2 rounded-lg border border-theme pointer-events-none">
        <div className="flex items-center gap-1.5">
          <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 7" /></svg>
          <span className="text-[9px] text-theme-secondary font-bold uppercase tracking-wider">Your route</span>
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

      <div className="absolute top-2 right-2 z-[800] text-[9px] text-theme-secondary bg-theme-secondary/80 px-2 py-1 rounded-md border border-theme pointer-events-none">
        Hover routes · scroll to zoom
      </div>
    </div>
  );
}

// ── Current route comparison card ─────────────────────────────────────────────

function CurrentRouteCard({ currentRoute, isScored }) {
  if (!currentRoute) return null;
  const etaHrs = formatEtaModal(currentRoute.eta ?? 0);
  const level  = currentRoute.risk_level ?? 'unknown';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-theme bg-theme-tertiary/60 p-4 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-theme-tertiary/60 border border-theme flex items-center justify-center shrink-0">
          <Route className="w-4 h-4 text-theme-secondary" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-theme-secondary">Current Route</p>
          <p className="text-xs text-theme-primary font-bold mt-0.5 truncate">Active path</p>
        </div>
      </div>

      <div className="flex items-center gap-5 shrink-0">
        <div className="text-center">
          <p className="text-[10px] text-theme-secondary uppercase tracking-wide">ETA</p>
          <p className="text-sm font-bold text-theme-primary tabular-nums">{etaHrs}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-theme-secondary uppercase tracking-wide">Distance</p>
          <p className="text-sm font-bold text-theme-primary tabular-nums">{currentRoute.distance?.toFixed(0) ?? '—'} km</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-theme-secondary uppercase tracking-wide">Risk</p>
          <p className={cn('text-sm font-black tabular-nums', riskColor(level))}>
            {isScored
              ? `${currentRoute.risk_score?.toFixed(0) ?? '—'}/100`
              : level.toUpperCase()}
          </p>
        </div>
        <div className="h-6 w-px bg-theme-tertiary/60" />
        <div className="flex items-center gap-1.5 text-[10px] text-theme-secondary">
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
      <span className="text-theme-secondary flex items-center gap-1.5">
        <Icon className="w-3 h-3 opacity-60" /> {label}
      </span>
      {children}
    </div>
  );
}

function RouteCard({ alt, isScoring, index, onHover, onApply, isApplying }) {
  const meta   = ROUTE_META[alt.label] ?? ROUTE_META.Avoidance;
  const Icon   = meta.icon;
  const etaHrs = formatEtaModal(alt.eta ?? alt.duration_seconds ?? 0);
  const hasRisk = alt.risk_assessed;
  const isRec  = alt.label === 'Recommended';

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => onHover?.(alt.route_id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        'relative rounded-2xl border flex flex-col overflow-hidden cursor-default transition-shadow',
        meta.bg,
        isRec ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/20' : 'border-theme'
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

      {!isRec && alt.is_avoidance && alt.label !== 'Gemini Route' && (
        <motion.div
          initial={{ opacity: 0, x: 5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute top-2.5 right-3 text-[9px] font-black tracking-[0.12em] text-orange-400 uppercase flex items-center gap-1"
        >
          <AlertTriangle className="w-2.5 h-2.5" /> Avoids Closure
        </motion.div>
      )}

      {alt.label === 'Gemini Route' && (
        <motion.div
          initial={{ opacity: 0, x: 5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute top-2.5 right-3 text-[9px] font-black tracking-[0.12em] text-violet-400 uppercase flex items-center gap-1"
        >
          <Sparkles className="w-2.5 h-2.5" /> AI Bypass
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
            <p className="text-theme-secondary text-[10px] font-mono">Route {alt.route_id}</p>
            {alt.label_reason && (
              <p className="text-theme-secondary text-[10px] leading-tight mt-0.5">{alt.label_reason}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-2">
          <StatRow icon={Clock} label="ETA">
            <span className="text-theme-primary font-bold tabular-nums">{etaHrs}</span>
          </StatRow>
          <StatRow icon={Route} label="Distance">
            <span className="text-theme-primary font-bold tabular-nums">
              {alt.distance?.toFixed(0) ?? '—'} km
            </span>
          </StatRow>
          <StatRow icon={TrendingUp} label="Extra time">
            {alt.extra_time_minutes > 0
              ? <span className="text-yellow-400 font-bold tabular-nums">+{alt.extra_time_minutes} min</span>
              : <span className="text-emerald-400 font-bold">Same time</span>
            }
          </StatRow>
        </div>

        {/* Risk */}
        <div className="border-t border-theme pt-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
            <span className="text-theme-secondary flex items-center gap-1">
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
                <motion.span key="pending" className="text-theme-secondary italic text-[9px] font-normal normal-case">
                  Not assessed
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="h-[3px] w-full bg-theme-tertiary/60 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: hasRisk ? riskBarColor(alt.risk_level) : 'transparent' }}
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
                className="text-theme-secondary text-[10px] italic leading-relaxed overflow-hidden"
              >
                <CloudRain className="w-2.5 h-2.5 inline mr-1 opacity-50" />
                {alt.reason}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Apply Reroute CTA */}
        <button
          onClick={() => onApply(alt)}
          disabled={isApplying}
          className="mt-3 w-full py-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-bold text-xs rounded-xl transition-all hover:scale-[1.02] active:scale-95 border border-indigo-500/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isApplying ? <LoadingSpinner size="sm" color="bg-indigo-400" /> : <Navigation className="w-3.5 h-3.5" />}
          Accept Route
        </button>
      </div>
    </motion.div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

const RerouteModal = memo(function RerouteModal({ shipmentId, onClose }) {
  const { theme } = useTheme();
  const { data, isLoading, error, refetch, isFetching } = useRerouting(shipmentId);
  const scoreMutation = useScoreReroute();
  const applyMutation = useApplyReroute();
  const [scoredAlts, setScoredAlts] = useState(null);
  const [hoveredAlt, setHoveredAlt] = useState(null);

  const shipment = useShipmentStore(
    state => state.shipments.find(s => s.id === shipmentId)
  );
  const primaryWaypoints       = shipment?.route_waypoints;
  const primaryGeometryEncoded = shipment?.route_geometry_encoded;
  const originCoords           = shipment?.origin_coords;
  const destCoords             = shipment?.destination_coords;
  const routeIncidents         = shipment?.route_incidents ?? [];

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
      // Merge scored fields back by route_id, preserving geometry and other fields
      const merged = (data.alternatives ?? []).map(orig => {
        const scored = result.scored_alternatives?.find(s => s.route_id === orig.route_id);
        return scored ? { ...orig, ...scored } : orig;
      });
      setScoredAlts(merged);
      toast.success('Risk assessment complete.');
    } catch {
      toast.error('Risk assessment failed. Try again.');
    }
  };

  const handleApplyRoute = async (alt) => {
    try {
      await applyMutation.mutateAsync({
        id: shipmentId,
        payload: {
          geometry_encoded: alt.geometry_encoded,
          distance_km: alt.distance,
          duration_seconds: alt.duration_seconds,
          waypoints: alt.waypoints
        }
      });
      toast.success(`Route ${alt.route_id} activated! Diverting trajectory.`);
      onClose();
    } catch {
      toast.error('Failed to commit alternative route. Server busy.');
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
            className="absolute inset-0 bg-theme-primary/70 backdrop-blur-lg"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative bg-theme-secondary rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl border border-theme flex flex-col max-h-[92vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Top shimmer line */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

            {/* Header */}
            <div className="px-6 py-4 border-b border-theme flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="p-2 bg-indigo-500/15 rounded-xl border border-indigo-500/25">
                  <ActivitySquare className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-theme-primary tracking-tight">
                    Reroute Intelligence
                  </h2>
                  <p className="text-[11px] text-theme-secondary mt-0.5">
                    Shipment&nbsp;
                    <span className="font-mono text-theme-secondary">{shipmentId?.slice(-8)}</span>
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setScoredAlts(null); refetch(); }}
                  disabled={isFetching || isScoring}
                  className="p-1.5 text-theme-secondary hover:text-theme-primary rounded-lg hover:bg-theme-tertiary transition-colors cursor-pointer disabled:opacity-50"
                  title="Recalculate Routes"
                >
                  <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 text-theme-secondary hover:text-theme-primary rounded-lg hover:bg-theme-tertiary transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {isLoading ? (
                <div className="py-32 flex flex-col items-center gap-5">
                  <LoadingSpinner size="lg" label="Computing alternative corridors…" />
                  <p className="text-theme-secondary text-[10px] tracking-widest uppercase font-bold animate-pulse">
                    Mappls routing · traffic analysis
                  </p>
                </div>
              ) : error ? (
                <div className="py-24 text-center space-y-3">
                  <ShieldAlert className="w-10 h-10 text-red-400 mx-auto opacity-40" />
                  <p className="text-theme-primary font-bold">Failed to load routes</p>
                  <p className="text-theme-secondary text-sm">{error.message}</p>
                  <button
                    onClick={onClose}
                    className="mt-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-theme-primary rounded-xl text-sm font-bold cursor-pointer transition-colors"
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
                          <p className="text-theme-secondary text-[13px] leading-snug">{data.reason}</p>
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
                    <p className="text-[10px] text-theme-secondary font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> Live corridor comparison
                    </p>
                    <RouteMap
                      alternatives={alternatives}
                      primaryWaypoints={primaryWaypoints}
                      primaryGeometryEncoded={primaryGeometryEncoded}
                      originCoords={originCoords}
                      destCoords={destCoords}
                      currentRoute={data?.current_route}
                      hoveredId={hoveredAlt}
                      incidents={routeIncidents}
                      theme={theme}
                    />
                  </motion.div>

                  {/* Current route comparison strip */}
                  <CurrentRouteCard currentRoute={data?.current_route} isScored={isScored} />

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-theme-tertiary/60" />
                    <span className="text-[9px] text-theme-secondary font-bold uppercase tracking-widest">Alternatives</span>
                    <div className="flex-1 h-px bg-theme-tertiary/60" />
                  </div>

                  {/* Route cards — dynamic grid based on count */}
                  <div className={cn(
                    'grid gap-3',
                    alternatives.length <= 2 ? 'md:grid-cols-2' :
                    alternatives.length === 4 ? 'md:grid-cols-4' :
                    'md:grid-cols-3'
                  )}>
                    {alternatives.map((alt, i) => (
                      <RouteCard
                        key={alt.route_id ?? i}
                        alt={alt}
                        isScoring={isScoring}
                        index={i}
                        onHover={setHoveredAlt}
                        onApply={handleApplyRoute}
                        isApplying={applyMutation.isPending}
                      />
                    ))}
                  </div>

                  {/* Assess Risk CTA */}
                  <div className="border-t border-theme pt-4">
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
                              : 'bg-indigo-600 hover:bg-indigo-500 text-theme-primary shadow-lg shadow-indigo-950/60'
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
                      <p className="text-center text-theme-secondary text-[11px] mt-2">
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
