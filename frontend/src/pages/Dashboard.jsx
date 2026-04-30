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
      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
        <div className="text-xs font-bold">
          🚚 {shipment.tracking_number}
          <br />
          <span className="text-[10px] opacity-70">
            {shipment.origin_name} → {shipment.destination_name}
          </span>
        </div>
      </Tooltip>

      <Popup className="custom-popup">
        <div className="flex flex-col gap-3 min-w-[240px] py-1">
          {/* Header with Tracking ID */}
          <div className="flex items-center justify-between">
            <span className="text-lg font-black tracking-tight text-theme-primary">
              {shipment.tracking_number}
            </span>
          </div>

          {/* Route Info */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold tracking-widest text-theme-secondary opacity-60">Route</p>
            <p className="text-xs font-medium text-theme-primary leading-tight">
              {shipment.origin_name} <span className="text-accent mx-1">→</span> {shipment.destination_name}
            </p>
          </div>

          {/* Status Pills */}
          <div className="flex items-center gap-2">
            <div className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 ${isHigh ? "bg-danger/20 text-danger border border-danger/30" : isMed ? "bg-warning/20 text-warning border border-warning/30" : "bg-success/20 text-success border border-success/30"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isHigh ? "bg-danger" : isMed ? "bg-warning" : "bg-success"}`} />
              Risk: {riskLevel}
            </div>
            <div className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${delayClass.replace('text-', 'text-').replace('bg-', 'bg-').split(' ').map(c => c.includes('/') ? c : c+'/20').join(' ')}`}>
              ETA: {etaDelay}
            </div>
          </div>

          {/* Alert / Reason Section - Red Box Style */}
          {((shipment.route_incidents?.length || 0) > 0 || (incidentOverride[shipment.id]?.length || 0) > 0 || shipment.risk?.current?.reason) && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-danger/15 p-3 rounded-2xl border border-danger/25 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {[...Array(Math.min(3, (shipment.route_incidents?.length || incidentOverride[shipment.id]?.length || 0) || 1))].map((_, i) => (
                      <div key={i} className="w-5 h-5 rounded-full bg-danger border-2 border-[#1a1a25] flex items-center justify-center text-[10px] text-white shadow-lg">⚠️</div>
                    ))}
                  </div>
                  <span className="text-[10px] font-black text-danger uppercase tracking-tighter">
                    {((shipment.route_incidents?.length || incidentOverride[shipment.id]?.length || 0)) || 1} System Event{((shipment.route_incidents?.length || incidentOverride[shipment.id]?.length || 0)) > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              
              <p className="text-[11px] text-danger/90 font-bold leading-tight">
                {shipment.risk?.current?.reason && !shipment.risk.current.reason.toLowerCase().includes('unavailable') 
                  ? shipment.risk.current.reason 
                  : "Critical delay risks and route disruptions detected on primary path."}
              </p>
            </motion.div>
          )}
        </div>
      </Popup>
    </Marker>
  );
});

const Dashboard = memo(function Dashboard() {
  const { theme } = useTheme();
  const [selectedId, setSelectedId] = useState(null);
  const [incidentOverride, setIncidentOverride] = useState({});
  const [fetchingIncidents, setFetchingIncidents] = useState(0);

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
              attribution={theme === 'dark' ? '&copy; <a href="https://carto.com/">CartoDB</a>' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}
              url={theme === 'dark'
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
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
              const opacity = selectedId && !isSelected ? 0.4 : 1;
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

                  {/* Incident markers — only for selected shipment */}
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

          {/* Live summary overlay */}
          <div className="absolute top-4 right-4 bg-theme-secondary/80 dark:bg-[#0a0a0f]/85 backdrop-blur-2xl p-4 rounded-2xl w-56 z-[1000] border border-theme shadow-2xl overflow-hidden shimmer">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            <h3 className="font-black mb-3 text-theme-primary tracking-tight uppercase text-[10px] opacity-70">Network Intelligence</h3>
            {fetchingIncidents > 0 && (
              <div className="mb-2">
                <div className="flex justify-between text-[10px] text-theme-secondary mb-1">
                  <span>Scanning incidents…</span>
                  <span>{fetchingIncidents} route{fetchingIncidents > 1 ? 's' : ''}</span>
                </div>
                <div className="w-full h-1 bg-theme-tertiary rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-warning rounded-full"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </div>
            )}
            {highRiskCount > 0 ? (
              <p className="text-danger font-bold">⚠ {highRiskCount} shipment needs attention</p>
            ) : (
              <p className="text-success">✔ All shipments running smoothly</p>
            )}
            <p className="mt-2 text-theme-secondary text-[11px]">Total Active: {shipments.length}</p>
            {(() => {
              const total = shipments.reduce((sum, s) => {
                const count = s.route_incidents?.length > 0
                  ? s.route_incidents.length
                  : (incidentOverride[s.id]?.length ?? 0);
                return sum + count;
              }, 0);
              return total > 0 ? (
                <p className="mt-1 text-warning text-[11px]">⚠️ {total} active incidents on network</p>
              ) : null;
            })()}
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