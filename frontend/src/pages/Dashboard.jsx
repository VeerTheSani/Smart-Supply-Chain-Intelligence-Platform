import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, Navigation, Package } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { useShipments } from '../hooks/useShipments';
import RiskDonutChart from '../components/dashboard/RiskDonutChart';
import StatusFlowBar from '../components/dashboard/StatusFlowBar';
import LiveIntelFeed from '../components/dashboard/LiveIntelFeed';
import RiskRadarChart from '../components/dashboard/RiskRadarChart';
import { MapContainer, TileLayer, Marker, Popup, useMap, Tooltip } from 'react-leaflet';
import { useShipmentStore } from '../stores/shipmentStore';
import { useTheme } from '../context/ThemeContext';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import RoadRoute from '../components/ui/RoadRoute';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';
import { cn } from '../lib/utils';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const StatCard = memo(function StatCard({ title, value, icon: Icon, accent, delay, subtext, bar }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, ease: 'easeOut' }}
      className="card-standard flex flex-col gap-3 group hover:scale-[1.01] transition-transform duration-200"
    >
      {/* Top row: icon pill + title */}
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl shrink-0" style={{ background: `${accent}18` }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <p className="text-[11px] font-bold tracking-widest uppercase text-theme-secondary truncate">{title}</p>
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black text-theme-primary tabular-nums leading-none">{value}</span>
      </div>

      {/* Bar */}
      {bar !== undefined && (
        <div className="h-1 rounded-full bg-theme-tertiary overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: accent }}
            initial={{ width: 0 }}
            animate={{ width: bar > 0 ? `${Math.min(bar, 100)}%` : '4%' }}
            transition={{ duration: 0.8, delay: delay + 0.2, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* Subtext */}
      {subtext && (
        <p className="text-[11px] text-theme-secondary opacity-70 truncate -mt-1">{subtext}</p>
      )}
    </motion.div>
  );
});

function FitBounds({ shipments }) {
  const map = useMap();
  useEffect(() => {
    const points = shipments
      ?.filter(s => s.current_location?.lat && s.current_location?.lng)
      .map(s => [s.current_location.lat, s.current_location.lng]);
    if (points && points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 7 });
    }
  }, [shipments, map]);
  return null;
}

const getMarkerIcon = (risk, isSelected, theme) => {
  const isHigh = risk === "high" || risk === "critical";
  const isMedium = risk === "medium";
  const hex = isHigh ? "#ef4444" : isMedium ? "#eab308" : "#22c55e";
  const pingColor = isHigh ? "bg-red-500" : isMedium ? "bg-yellow-500" : "bg-green-500";
  const glowColor = isHigh ? "rgba(239, 68, 68, 0.8)" : isMedium ? "rgba(234, 179, 8, 0.8)" : "rgba(34, 197, 94, 0.8)";
  const finalGlow = isSelected ? "rgba(59, 130, 246, 0.9)" : glowColor;

  return new L.DivIcon({
    className: "custom-truck-marker",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `
      <div class="relative w-full h-full flex items-center justify-center" style="cursor: pointer;">
        <div class="absolute inset-0 rounded-full ${pingColor} opacity-40 animate-ping" style="animation-duration: 2s;"></div>
        <div style="background:${hex};width:24px;height:24px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 12px ${finalGlow};display:flex;align-items:center;justify-content:center;z-index:10;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="3" width="15" height="13"></rect>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
            <circle cx="5.5" cy="18.5" r="2.5"></circle>
            <circle cx="18.5" cy="18.5" r="2.5"></circle>
          </svg>
        </div>
      </div>
    `
  });
};

const getIncidentIcon = (type) => {
  const color =
    ["ROAD_CLOSED", "ACCIDENT"].includes(type) ? "#ef4444" :
      ["JAM", "ROAD_WORKS"].includes(type) ? "#f97316" : "#facc15";
  const glow = color === "#ef4444" ? "rgba(239, 68, 68, 0.6)" : "rgba(249, 115, 22, 0.6)";
  
  return new L.DivIcon({
    className: "incident-marker-glass",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="
      background:${color}cc; width:26px; height:26px; border-radius:50%;
      border:2px solid rgba(255,255,255,0.8); display:flex; align-items:center;
      justify-content:center; font-size:12px; backdrop-filter:blur(4px);
      box-shadow:0 0 15px ${glow}, 0 4px 8px rgba(0,0,0,0.5);
      animation: pulse 2s infinite">⚠️</div>`
  });
};

const SEVERITY_LABELS = ["Unknown", "Minor", "Moderate", "Major", "Critical"];

const getViaIcon = (type) => {
  const isPickup = type === 'pickup';
  const isDelivery = type === 'delivery';
  const color = isPickup ? 'rgba(139, 92, 246, 0.75)' : isDelivery ? 'rgba(20, 184, 166, 0.75)' : 'rgba(100, 116, 139, 0.75)';
  const iconEmoji = isPickup ? '📦' : isDelivery ? '📍' : '⚙️';
  return new L.DivIcon({
    className: "custom-via-marker",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="
      background:${color};width:30px;height:30px;border-radius:50%;
      border:2px solid rgba(255, 255, 255, 0.6);display:flex;align-items:center;
      justify-content:center;font-size:16px; backdrop-filter:blur(4px);
      box-shadow:0 3px 8px rgba(0,0,0,0.3)">${iconEmoji}</div>`
  });
};

import polyline from '@mapbox/polyline';

const ConnectorLine = ({ selectedShipment, liveLocation }) => {
  const map = useMap();
  const [points, setPoints] = useState(null);

  useEffect(() => {
    if (!selectedShipment || !liveLocation) {
      setPoints(null);
      return;
    }

    const updatePoints = () => {
      const markerPoint = map.latLngToContainerPoint(liveLocation);
      
      // Sidebar is 288px wide (w-72) + 16px left (left-4) = 304px
      const panelX = 304;
      // Vertically center on the panel's "Focus Active" header (~60px from top)
      const panelY = 60; 

      // Create a "circuit board" style stepped path
      // 1. Horizontal out from panel
      // 2. Vertical to match marker Y
      // 3. Horizontal to marker
      const midX = (panelX + markerPoint.x) / 2;

      setPoints(`M ${panelX} ${panelY} H ${midX} V ${markerPoint.y} H ${markerPoint.x}`);
    };

    updatePoints();
    map.on('move zoom', updatePoints);
    const interval = setInterval(updatePoints, 50); // High frequency for smooth truck tracking

    return () => {
      map.off('move zoom', updatePoints);
      clearInterval(interval);
    };
  }, [selectedShipment, liveLocation, map]);

  if (!points) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none z-[1000] w-full h-full overflow-visible">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <path
        d={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeOpacity="0.4"
        style={{ filter: 'url(#glow)' }}
        className="animate-pulse"
      />
      <circle
        cx={304}
        cy={60}
        r="3"
        fill="var(--accent)"
      />
    </svg>
  );
};

const AnimatedLiveTruck = memo(function AnimatedLiveTruck({ shipment, isSelected, theme, riskLevel, isHigh, isMed, etaDelay, delayClass, onClick }) {
  const [liveLocation, setLiveLocation] = useState(null);

  useEffect(() => {
    // If no geometry is available, fall back to default backend location snap
    const defaultLoc = shipment.current_location && [shipment.current_location.lat, shipment.current_location.lng];
    if (!shipment?.created_at || !shipment?.expected_travel_seconds || !shipment.route_geometry_encoded) {
      setLiveLocation(defaultLoc || [0, 0]);
      return;
    }

    let positions;
    try {
      positions = polyline.decode(shipment.route_geometry_encoded); // [[lat, lng], ...]
    } catch {
      setLiveLocation(defaultLoc || [0, 0]);
      return;
    }

    if (positions.length < 2) {
      setLiveLocation(defaultLoc || [0, 0]);
      return;
    }

    // Euclidean Interpolator Engine
    const getInterpolatedPoint = (positions, progressFrac) => {
      if (progressFrac <= 0) return positions[0];
      if (progressFrac >= 1) return positions[positions.length - 1];
      let totalDist = 0;
      const dists = [];
      for (let i = 0; i < positions.length - 1; i++) {
        const dx = positions[i + 1][1] - positions[i][1];
        const dy = positions[i + 1][0] - positions[i][0];
        const d = Math.sqrt(dx * dx + dy * dy);
        dists.push(d);
        totalDist += d;
      }
      const targetDist = totalDist * progressFrac;
      let currDist = 0;
      for (let i = 0; i < positions.length - 1; i++) {
        if (currDist + dists[i] >= targetDist) {
          const segmentFrac = dists[i] === 0 ? 0 : (targetDist - currDist) / dists[i];
          const lat = positions[i][0] + (positions[i + 1][0] - positions[i][0]) * segmentFrac;
          const lng = positions[i][1] + (positions[i + 1][1] - positions[i][1]) * segmentFrac;
          return [lat, lng];
        }
        currDist += dists[i];
      }
      return positions[positions.length - 1];
    };

    const updatePosition = () => {
      if (shipment.status === 'planned') {
        setLiveLocation(getInterpolatedPoint(positions, 0));
        return;
      }
      if (shipment.status === 'delivered') {
        setLiveLocation(getInterpolatedPoint(positions, 1));
        return;
      }

      // We rely on front-end mathematical geometry riding to perfectly stick to roads 60fps
      const created = new Date(shipment.created_at).getTime();
      const elapsedSec = (Date.now() - created) / 1000;
      // 5x simulation!
      const progress = Math.min((elapsedSec * 5) / shipment.expected_travel_seconds, 1);
      setLiveLocation(getInterpolatedPoint(positions, progress));
    };

    updatePosition();
    const interval = setInterval(updatePosition, 1000); // Ride highway polyline every 1s visually
    return () => clearInterval(interval);
  }, [shipment]);

  if (!liveLocation) return null;
  const opacity = isSelected === null ? 1 : isSelected ? 1 : 0.4;

  return (
    <Marker
      position={liveLocation}
      icon={getMarkerIcon(riskLevel, isSelected, theme)}
      opacity={opacity}
      eventHandlers={{ click: onClick }}
      zIndexOffset={isSelected ? 1000 : 0}
    >
      {isSelected && <ConnectorLine selectedShipment={shipment} liveLocation={liveLocation} />}
      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
        <div className="text-xs font-bold">
          🚚 {shipment.tracking_number}
          <br />
          <span className="text-[10px] opacity-70">
            {shipment.origin_name} → {shipment.destination_name}
          </span>
        </div>
      </Tooltip>

    </Marker>
  );
});

import { AnimatePresence } from 'framer-motion';
import { X, CloudRain, Clock, MapPin, ShieldAlert, Sparkles, AlertCircle } from 'lucide-react';

const Dashboard = memo(function Dashboard() {
  const { theme } = useTheme();
  const [selectedId, setSelectedId] = useState(null);
  const [incidentOverride, setIncidentOverride] = useState({});
  const [fetchingIncidents, setFetchingIncidents] = useState(0);

  const selectedShipment = useShipmentStore(state => state.shipments.find(s => s.id === selectedId));

  const { data, isLoading, error } = useDashboard();
  const { isLoading: shipmentsLoading } = useShipments();
  const shipments = useShipmentStore(state => state.shipments);

  const highRiskCount = shipments.filter(
    s => s.risk?.current?.risk_level === 'high'
  ).length;

  // For every shipment with no stored incidents, fire a background fetch once.
  // This covers: newly created shipments where TomTom hasn't returned yet,
  // and old shipments that predate the incident storage feature.
  useEffect(() => {
    shipments.forEach(s => {
      if ((s.route_incidents?.length ?? 0) > 0) return;  // already have data
      if (incidentOverride[s.id] !== undefined) return;   // already fetched this session

      // Mark as attempted immediately so concurrent renders don't double-fire
      setIncidentOverride(prev => ({ ...prev, [s.id]: prev[s.id] ?? null }));
      setFetchingIncidents(n => n + 1);

      fetch(`/api/shipments/${s.id}/incidents`)
        .then(r => r.json())
        .then(json => {
          if (json.incidents?.length > 0) {
            setIncidentOverride(prev => ({ ...prev, [s.id]: json.incidents }));
          }
        })
        .catch(() => { })
        .finally(() => setFetchingIncidents(n => Math.max(0, n - 1)));
    });
  }, [shipments]);

  const handleMarkerClick = (shipmentId) => {
    setSelectedId(prev => prev === shipmentId ? null : shipmentId);
  };

  if (isLoading) return (
    <div className="py-24 flex flex-col items-center justify-center gap-4">
      <LoadingSpinner />
      <p className="text-theme-secondary text-sm tracking-widest uppercase font-bold animate-pulse">
        Loading Live Intelligence...
      </p>
    </div>
  );
  if (error) return <ErrorFallback error={error} />;

  const isLowRisk = data?.avg_risk_score < 40;

  return (
    <div className="space-y-8 bg-theme-primary">
      <div>
        <motion.h1
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-xl sm:text-2xl md:text-3xl font-bold text-theme-primary tracking-tight"
        >
          Control Center
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="text-theme-secondary mt-1"
        >
          Real-time systemic intelligence and global network visualization
        </motion.p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          title="Total Shipments" value={data?.total_shipments || 0} icon={Package}
          accent="#a78bfa" delay={0.1}
          bar={data?.total_shipments ? Math.min(data.total_shipments * 10, 100) : 0}
          subtext={`${data?.risk_counts?.critical || 0} critical · ${data?.risk_counts?.high || 0} high`}
        />
        <StatCard
          title="Active Disruptions" value={data?.active_disruptions || 0} icon={AlertTriangle}
          accent={data?.active_disruptions > 0 ? '#ff5555' : '#22c55e'} delay={0.2}
          bar={data?.total_shipments ? Math.round((data.active_disruptions / Math.max(data.total_shipments, 1)) * 100) : 0}
          subtext={`${data?.status_counts?.rerouting || 0} rerouting now`}
        />
        <StatCard
          title="Avg Risk Score" value={data?.avg_risk_score ? data.avg_risk_score.toFixed(1) : '0'} icon={Activity}
          accent={isLowRisk ? '#22c55e' : '#facc15'} delay={0.3}
          bar={data?.avg_risk_score || 0}
          subtext={isLowRisk ? 'Fleet is safe' : 'Elevated network risk'}
        />
        <StatCard
          title="Optimized Routes" value={data?.optimized_routes || 0} icon={Navigation}
          accent="#e53935" delay={0.4}
          bar={data?.total_shipments ? Math.round((data.optimized_routes / Math.max(data.total_shipments, 1)) * 100) : 0}
          subtext={`${data?.status_counts?.delivered || 0} delivered`}
        />
      </div>

      {/* Live Shipment Tracking Map */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-panel rounded-2xl md:rounded-3xl overflow-hidden border border-theme shadow-2xl flex flex-col"
      >
        <div className="px-3 sm:px-4 md:px-6 py-3 md:py-4 border-b border-theme bg-theme-secondary/30 flex flex-wrap justify-between items-center z-10 relative gap-2">
          <h2 className="text-lg font-bold text-theme-primary flex items-center gap-2">
            <Navigation className="w-4 h-4 md:w-5 md:h-5 text-accent" /> <span className="text-sm md:text-lg">Live Shipment Tracking</span>
          </h2>
          <div className="hidden sm:flex gap-4 text-[10px] uppercase font-bold tracking-widest bg-theme-primary/50 px-3 py-1.5 rounded-lg border border-theme">
            <span className="flex items-center gap-1.5 text-success"><div className="w-2.5 h-2.5 rounded-full bg-success"></div> Safe</span>
            <span className="flex items-center gap-1.5 text-warning"><div className="w-2.5 h-2.5 rounded-full bg-warning"></div> Warning</span>
            <span className="flex items-center gap-1.5 text-danger"><div className="w-2.5 h-2.5 rounded-full bg-danger"></div> High Risk</span>
          </div>
        </div>

        <div className="h-[300px] sm:h-[350px] md:h-[400px] lg:h-[500px] relative z-0">
          <MapContainer
            center={window.innerWidth < 768 ? [20, 0] : [23, 72]}
            zoom={window.innerWidth < 768 ? 2 : 5}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%", zIndex: 0 }}
          >
            <TileLayer
              attribution={theme === 'dark' ? '&copy; <a href="https://carto.com/">CartoDB</a>' : '&copy; <a href="https://carto.com/">CartoDB</a>'}
              url={theme === 'dark'
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
            />

            <FitBounds shipments={shipments} />

            {shipments?.map((shipment) => {
              const loc = shipment.current_location;
              const hasValidLocation = loc && typeof loc.lat === "number" && typeof loc.lng === "number";
              if (!hasValidLocation) return null;

              const riskLevel = shipment.risk?.current?.risk_level || "low";
              const isHigh = riskLevel === "high" || riskLevel === "critical";
              const isMed = riskLevel === "medium";
              const isSelected = selectedId === shipment.id;
              const etaDelay = isHigh ? "+4h Delay" : isMed ? "+1.5h Delay" : "On Time";
              const delayClass = isHigh ? "text-danger bg-danger/10" : isMed ? "text-warning bg-warning/10" : "text-success bg-success/10";

              return (
                <div key={shipment.id}>
                  {/* Road route line */}
                  {(shipment.route_waypoints?.length > 1 || shipment.route_geometry_encoded) && (
                    <RoadRoute
                      waypoints={shipment.route_waypoints}
                      geometryEncoded={shipment.route_geometry_encoded}
                      color={isSelected ? "#3b82f6" : isHigh ? "#ef4444" : isMed ? "#f97316" : "#10b981"}
                    />
                  )}

                  {/* Intermediate Via Points */}
                  {shipment.via_points?.map((vp, idx) => {
                    if (!vp.coords?.lat || !vp.coords?.lng) return null;
                    return (
                      <Marker
                        key={`via-${shipment.id}-${idx}`}
                        position={[vp.coords.lat, vp.coords.lng]}
                        icon={getViaIcon(vp.type)}
                      >
                        <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                          <div className="text-[11px] font-bold tracking-wide capitalize">
                            <span className="opacity-70">{vp.type}:</span> {vp.location_name}
                          </div>
                        </Tooltip>
                      </Marker>
                    );
                  })}

                  {/* Live Interpolating Autonomous Truck Marker */}
                  <AnimatedLiveTruck
                    shipment={shipment}
                    isSelected={isSelected}
                    theme={theme}
                    riskLevel={riskLevel}
                    isHigh={isHigh}
                    isMed={isMed}
                    etaDelay={etaDelay}
                    delayClass={delayClass}
                    onClick={() => handleMarkerClick(shipment.id)}
                  />

                  {/* Incident markers */}
                  {isSelected && (shipment.route_incidents?.length > 0 ? shipment.route_incidents : (incidentOverride[shipment.id] || []))
                    .map((incident, idx) => (
                      <Marker
                        key={`incident-${shipment.id}-${idx}`}
                        position={[incident.lat, incident.lng]}
                        icon={getIncidentIcon(incident.type)}
                      >
                        <Popup>
                          <div className="text-xs min-w-[140px]">
                            <strong className="text-red-600 block mb-1">
                              {incident.type.replace(/_/g, ' ')}
                            </strong>
                            <span className="text-gray-700">{incident.description}</span>
                            <br />
                            <span className="text-gray-400 text-[10px]">
                              Severity: {SEVERITY_LABELS[incident.severity] || "Unknown"}
                            </span>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                </div>
              );
            })}
          </MapContainer>

          {/* ── Overlays (Inside relative container for perfect pinning) ── */}
          <AnimatePresence>
            {selectedShipment && (
              <motion.div
                initial={{ opacity: 0, x: -100, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -100, scale: 0.95 }}
                className="absolute top-4 bottom-4 left-4 w-72 z-[1001] pointer-events-none"
              >
                <div className={cn(
                  "h-full w-full pointer-events-auto backdrop-blur-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden border",
                  theme === 'dark' ? "bg-[#0a0a0f]/90 border-white/10" : "bg-white/90 border-slate-200"
                )}>
                  <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-50" />
                  <div className="px-5 py-4 border-b border-theme flex items-center justify-between bg-theme-tertiary/20">
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-theme-secondary mb-0.5">Focus Active</h3>
                      <p className="text-base font-black text-theme-primary leading-none">{selectedShipment.tracking_number}</p>
                    </div>
                    <button onClick={() => setSelectedId(null)} className="p-1.5 hover:bg-theme-tertiary rounded-lg transition-colors cursor-pointer">
                      <X className="w-4 h-4 text-theme-secondary" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                    <div className="space-y-3">
                       <div className="flex items-start gap-3">
                         <div className="mt-1 w-2 h-2 rounded-full bg-success ring-4 ring-success/20 shrink-0" />
                         <div>
                            <p className="text-[10px] font-bold text-theme-secondary uppercase tracking-wide">Origin</p>
                            <p className="text-xs font-bold text-theme-primary leading-tight">{selectedShipment.origin_name}</p>
                         </div>
                       </div>
                       <div className="ml-1 w-px h-4 bg-theme-tertiary" />
                       <div className="flex items-start gap-3">
                         <div className="mt-1 w-2 h-2 rounded-full bg-accent ring-4 ring-accent/20 shrink-0" />
                         <div>
                            <p className="text-[10px] font-bold text-theme-secondary uppercase tracking-wide">Destination</p>
                            <p className="text-xs font-bold text-theme-primary leading-tight">{selectedShipment.destination_name}</p>
                         </div>
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                       <div className="p-3 bg-theme-tertiary/40 rounded-xl border border-theme/50">
                          <p className="text-[9px] font-bold text-theme-secondary uppercase mb-1 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Delay</p>
                          <p className={`text-xs font-black ${selectedShipment.risk?.current?.risk_level === 'high' ? 'text-danger' : 'text-warning'}`}>
                            {selectedShipment.risk?.current?.risk_level === 'high' ? '+4.2h' : '+1.5h'}
                          </p>
                       </div>
                       <div className="p-3 bg-theme-tertiary/40 rounded-xl border border-theme/50">
                          <p className="text-[9px] font-bold text-theme-secondary uppercase mb-1 flex items-center gap-1"><ShieldAlert className="w-2.5 h-2.5" /> Risk</p>
                          <p className={`text-xs font-black uppercase ${selectedShipment.risk?.current?.risk_level === 'high' ? 'text-danger' : 'text-success'}`}>
                             {selectedShipment.risk?.current?.risk_level}
                          </p>
                       </div>
                    </div>
                    {selectedShipment.last_risk_assessment?.breakdown?.weather && (
                      <div className="p-3.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5"><CloudRain className="w-3 h-3" /> Weather Intel</span>
                          <span className="text-[10px] font-bold text-indigo-300">{selectedShipment.last_risk_assessment.breakdown.weather.score}/100</span>
                        </div>
                        <p className="text-[11px] text-theme-primary font-medium leading-relaxed italic">"{selectedShipment.last_risk_assessment.breakdown.weather.reason}"</p>
                      </div>
                    )}
                  </div>
                  <div className="p-4 bg-theme-tertiary/20 border-t border-theme">
                    <button className="w-full py-2.5 bg-accent hover:bg-accent/80 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-accent/20">Initiate Protocol</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Network Intelligence Summary Overlay */}
          <div className={cn(
            "absolute top-4 right-4 backdrop-blur-2xl p-4 rounded-2xl w-60 z-[1001] shadow-2xl border transition-all",
            theme === 'dark' ? "bg-[#0a0a0f]/85 border-white/10" : "bg-white/85 border-slate-200"
          )}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-theme-primary tracking-tight uppercase text-[10px] opacity-70">Network Intelligence</h3>
              <div className="flex items-center gap-1.5">
                 <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                 <span className="text-[9px] font-bold text-success uppercase tracking-widest">Live</span>
              </div>
            </div>
            {fetchingIncidents > 0 && (
              <div className="mb-2">
                <div className="flex justify-between text-[10px] text-theme-secondary mb-1">
                  <span>Scanning incidents…</span>
                  <span>{fetchingIncidents}</span>
                </div>
                <div className="w-full h-0.5 bg-theme-tertiary rounded-full overflow-hidden">
                  <motion.div className="h-full bg-warning rounded-full" animate={{ x: ['-100%', '100%'] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }} />
                </div>
              </div>
            )}
            {highRiskCount > 0 ? (
              <p className="text-danger text-xs font-bold tracking-tight">⚠ {highRiskCount} critical alerts active</p>
            ) : (
              <p className="text-success text-xs font-bold tracking-tight">✔ System operating normally</p>
            )}
            <div className="mt-3 pt-3 border-t border-theme/30 flex justify-between items-center">
               <span className="text-[10px] font-bold text-theme-secondary uppercase">Fleet Status</span>
               <span className="text-xs font-black text-theme-primary">{shipments.length} Nodes</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <RiskDonutChart riskCounts={data?.risk_counts || {}} />
        <StatusFlowBar  statusCounts={data?.status_counts || {}} />
      </div>

      {/* Intel Feed + Radar row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <LiveIntelFeed recentAlerts={data?.recent_alerts || []} />
        <RiskRadarChart />
      </div>
    </div>
  );
});

export default Dashboard;