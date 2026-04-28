import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, TrendingUp, Navigation, Package } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { useShipments } from '../hooks/useShipments';
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

const StatCard = memo(function StatCard({ title, value, icon: Icon, trend, colorClass, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`bg-theme-secondary rounded-2xl p-4 sm:p-6 border-default shadow-md border-b-4 ${colorClass}`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-2 sm:space-y-4 flex-1 min-w-0">
          <p className="text-theme-secondary text-[10px] sm:text-sm font-semibold tracking-wider uppercase truncate">{title}</p>
          <div className="flex items-end gap-1.5 sm:gap-3 flex-wrap">
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-theme-primary tracking-tight break-all">{value}</h3>
            {trend && (
              <span className={`flex items-center gap-1 text-[10px] sm:text-sm font-medium pb-1 ${trend > 0 ? 'text-success' : 'text-danger'}`}>
                {trend > 0 ? '+' : ''}{trend}% <TrendingUp className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
        <div className={`p-2 sm:p-3 rounded-xl bg-theme-tertiary shadow-inner shrink-0 ${colorClass.replace('border-', 'text-')}`}>
          <Icon className="w-4 h-4 sm:w-6 sm:h-6" />
        </div>
      </div>
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
  return new L.DivIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="
      background:${color};width:22px;height:22px;border-radius:50%;
      border:2px solid white;display:flex;align-items:center;
      justify-content:center;font-size:11px;
      box-shadow:0 2px 6px rgba(0,0,0,0.4)">⚠️</div>`
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

      <Popup className="custom-popup border-0">
        <div className="flex flex-col gap-1 min-w-[160px]">
          <strong className="text-theme-primary border-b border-theme pb-1 mb-1 text-sm">
            {shipment.tracking_number}
          </strong>
          <span className="text-theme-secondary text-[11px] font-bold">
            Route: {shipment.origin_name} → {shipment.destination_name}
          </span>
          <div className="flex justify-between mt-1 pt-1 border-t border-theme border-dashed">
            <span className={`text-[9px] px-2 py-0.5 rounded text-white ${isHigh ? "bg-danger" : isMed ? "bg-warning" : "bg-success"}`}>
              Risk: {riskLevel}
            </span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${delayClass}`}>
              ETA: {etaDelay}
            </span>
          </div>
          {shipment.risk?.current?.reason &&
            !shipment.risk.current.reason.toLowerCase().includes('unavailable') &&
            !shipment.risk.current.reason.toLowerCase().includes('not available') && (
              <div className="bg-danger/10 mt-1 p-1 rounded border border-danger/20 text-danger text-[9px]">
                ⚠️ {shipment.risk.current.reason}
              </div>
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
        <StatCard title="Total Shipments" value={data?.total_shipments || 0} icon={Package} trend={12} colorClass="border-theme" delay={0.1} />
        <StatCard title="Active Disruptions" value={data?.active_disruptions || 0} icon={AlertTriangle} colorClass={data?.active_disruptions > 0 ? 'border-primary-500' : 'border-success'} delay={0.2} />
        <StatCard title="Avg Risk Score" value={data?.avg_risk_score ? data.avg_risk_score.toFixed(1) : "0"} icon={Activity} trend={-5} colorClass={isLowRisk ? 'border-success' : 'border-warning'} delay={0.3} />
        <StatCard title="Optimized Routes" value={data?.optimized_routes || 0} icon={Navigation} trend={24} colorClass="border-primary-400" delay={0.4} />
      </div>

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
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-theme-secondary/90 p-2 sm:p-4 rounded-lg sm:rounded-xl w-40 sm:w-52 z-[1000] border border-theme text-[10px] sm:text-xs shadow-lg">
            <h3 className="font-bold mb-2 text-theme-primary">Live Status</h3>
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
    </div>
  );
});

export default Dashboard;