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
      className={`bg-theme-secondary rounded-2xl p-6 border-default shadow-md border-b-4 ${colorClass}`}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-4">
          <p className="text-theme-secondary text-sm font-semibold tracking-wider uppercase">{title}</p>
          <div className="flex items-end gap-3">
            <h3 className="text-4xl font-bold text-theme-primary tracking-tight">{value}</h3>
            {trend && (
              <span className={`flex items-center gap-1 text-sm font-medium pb-1 ${trend > 0 ? 'text-success' : 'text-danger'}`}>
                {trend > 0 ? '+' : ''}{trend}% <TrendingUp className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
        <div className={`p-3 rounded-xl bg-theme-tertiary shadow-inner ${colorClass.replace('border-', 'text-')}`}>
          <Icon className="w-6 h-6" />
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
  const color = isHigh ? "#ff3b3b" : isMedium ? "#facc15" : "#22c55e";
  const pulseClass = isHigh ? "marker-pulse-high" : isMedium ? "marker-pulse-medium" : "";
  const glow = isSelected ? "0 0 12px rgba(59,130,246,0.9)" : "0 0 6px rgba(0,0,0,0.7)";
  const borderColor = theme === 'dark' ? '#1e293b' : '#e2e8f0';
  return new L.DivIcon({
    className: "custom-marker",
    html: `<div class="${pulseClass}" style="
      background:${color};width:16px;height:16px;border-radius:50%;
      border:2px solid ${borderColor};box-shadow:${glow};cursor:pointer;"></div>`
  });
};

const getIncidentIcon = (type) => {
  const color =
    ["ROAD_CLOSED", "ACCIDENT"].includes(type) ? "#ef4444" :
    ["JAM", "ROAD_WORKS"].includes(type) ? "#f97316" : "#facc15";
  return new L.DivIcon({
    className: "",
    html: `<div style="
      background:${color};width:22px;height:22px;border-radius:50%;
      border:2px solid white;display:flex;align-items:center;
      justify-content:center;font-size:11px;
      box-shadow:0 2px 6px rgba(0,0,0,0.4)">⚠️</div>`
  });
};

const SEVERITY_LABELS = ["Unknown", "Minor", "Moderate", "Major", "Critical"];

const Dashboard = memo(function Dashboard() {
  const { theme } = useTheme();
  const [selectedId, setSelectedId] = useState(null);
  const [incidentData, setIncidentData] = useState({});

  const { data, isLoading, error } = useDashboard();
  const { isLoading: shipmentsLoading } = useShipments();
  const shipments = useShipmentStore(state => state.shipments);

  const highRiskCount = shipments.filter(
    s => s.risk?.current?.risk_level === 'high'
  ).length;

  // Auto-refresh incidents every 2 mins when a shipment is selected
  useEffect(() => {
    if (!selectedId) return;

    const fetchIncidents = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/shipments/${selectedId}/incidents`);
        const json = await res.json();
        setIncidentData(prev => ({ ...prev, [selectedId]: json.incidents || [] }));
      } catch (e) {
        console.error("Incidents fetch error", e);
      }
    };

    fetchIncidents(); // fetch immediately on select
    const interval = setInterval(fetchIncidents, 30 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [selectedId]);

  const handleMarkerClick = async (shipmentId) => {
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
          className="text-3xl font-bold text-theme-primary tracking-tight"
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Shipments" value={data?.total_shipments || 0} icon={Package} trend={12} colorClass="border-theme" delay={0.1} />
        <StatCard title="Active Disruptions" value={data?.active_disruptions || 0} icon={AlertTriangle} colorClass={data?.active_disruptions > 0 ? 'border-primary-500' : 'border-success'} delay={0.2} />
        <StatCard title="Avg Risk Score" value={data?.avg_risk_score ? data.avg_risk_score.toFixed(1) : "0"} icon={Activity} trend={-5} colorClass={isLowRisk ? 'border-success' : 'border-warning'} delay={0.3} />
        <StatCard title="Optimized Routes" value={data?.optimized_routes || 0} icon={Navigation} trend={24} colorClass="border-primary-400" delay={0.4} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-panel rounded-3xl overflow-hidden border border-theme shadow-2xl flex flex-col"
      >
        <div className="px-6 py-4 border-b border-theme bg-theme-secondary/30 flex justify-between items-center z-10 relative">
          <h2 className="text-lg font-bold text-theme-primary flex items-center gap-2">
            <Navigation className="w-5 h-5 text-accent" /> Live Shipment Tracking
          </h2>
          <div className="flex gap-4 text-[10px] uppercase font-bold tracking-widest bg-theme-primary/50 px-3 py-1.5 rounded-lg border border-theme">
            <span className="flex items-center gap-1.5 text-success"><div className="w-2.5 h-2.5 rounded-full bg-success"></div> Safe</span>
            <span className="flex items-center gap-1.5 text-warning"><div className="w-2.5 h-2.5 rounded-full bg-warning"></div> Warning</span>
            <span className="flex items-center gap-1.5 text-danger"><div className="w-2.5 h-2.5 rounded-full bg-danger"></div> High Risk</span>
          </div>
        </div>

        <div className="h-[400px] relative z-0">
          <MapContainer
            center={window.innerWidth < 768 ? [20, 0] : [23, 72]}
            zoom={window.innerWidth < 768 ? 2 : 5}
            scrollWheelZoom={false}
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
                  {shipment.route_waypoints?.length > 1 && (
                    <RoadRoute
                      waypoints={shipment.route_waypoints}
                      color={isSelected ? "#3b82f6" : isHigh ? "#ef4444" : isMed ? "#f97316" : "#22c55e"}
                    />
                  )}

                  {/* Shipment truck marker */}
                  <Marker
                    position={[loc.lat, loc.lng]}
                    icon={getMarkerIcon(riskLevel, isSelected, theme)}
                    opacity={opacity}
                    eventHandlers={{ click: () => handleMarkerClick(shipment.id) }}
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
                        {shipment.risk?.current?.reason && (
                          <div className="bg-danger/10 mt-1 p-1 rounded border border-danger/20 text-danger text-[9px]">
                            ⚠️ {shipment.risk.current.reason}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>

                  {/* Incident markers — only show when this shipment is selected */}
                  {isSelected && incidentData[shipment.id]?.map((incident, idx) => (
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
          <div className="absolute top-4 right-4 bg-theme-secondary/90 p-4 rounded-xl w-52 z-[1000] border border-theme text-xs shadow-lg">
            <h3 className="font-bold mb-2 text-theme-primary">Live Status</h3>
            {highRiskCount > 0 ? (
              <p className="text-danger font-bold">⚠ {highRiskCount} shipment needs attention</p>
            ) : (
              <p className="text-success">✔ All shipments running smoothly</p>
            )}
            <p className="mt-2 text-theme-secondary text-[11px]">Total Active: {shipments.length}</p>
            {selectedId && incidentData[selectedId] && (
              <p className="mt-1 text-warning text-[11px]">
                ⚠️ {incidentData[selectedId].length} incidents on route
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
});

export default Dashboard;