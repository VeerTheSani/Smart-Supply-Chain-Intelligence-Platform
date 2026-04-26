import { memo } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, ShieldCheck, TrendingUp, Navigation, Package } from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { useShipments } from '../hooks/useShipments';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Tooltip } from 'react-leaflet';
import { useShipmentStore } from '../stores/shipmentStore';
import { useTheme } from '../context/ThemeContext';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { useEffect, useState } from "react";


let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';

const StatCard = memo(function StatCard({ title, value, icon: Icon, trend, colorClass, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`glass-panel rounded-2xl p-6 border-l-4 shadow-xl transition-all ${colorClass.replace('border-', 'border-l-')}`}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-4">
          <p className="text-theme-secondary text-[10px] font-bold tracking-[0.2em] uppercase opacity-70">{title}</p>
          <div className="flex items-end gap-3">
            <h3 className="text-4xl font-black text-theme-primary tracking-tight leading-none">{value}</h3>
            {trend && (
              <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${trend > 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {trend > 0 ? '↑' : '↓'}{Math.abs(trend)}%
              </span>
            )}
          </div>
        </div>
        <div className={`p-3 rounded-2xl bg-theme-tertiary/50 shadow-inner ${colorClass.replace('border-', 'text-')}`}>
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

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, {
        padding: [80, 80],
        maxZoom: 7
      });
    }
  }, [shipments, map]);

  return null;
}

const getMarkerIcon = (risk, isSelected, theme) => {
  const isHigh = risk === "high" || risk === "critical";
  const isMedium = risk === "medium";
  const color = isHigh ? "#ff3b3b" : isMedium ? "#facc15" : "#22c55e";
  const pulseClass = isHigh ? "marker-pulse-high" : isMedium ? "marker-pulse-medium" : "";
  const glow = isSelected
    ? "0 0 12px rgba(59,130,246,0.9)"
    : "0 0 6px rgba(0,0,0,0.7)";
  
  const borderColor = theme === 'dark' ? '#1e293b' : '#e2e8f0';

  return new L.DivIcon({
    className: "custom-marker",
    html: `<div class="${pulseClass}" style="
      background:${color};
      width:16px;
      height:16px;
      border-radius:50%;
      border:2px solid ${borderColor};
      box-shadow:${glow};
      cursor: pointer;
      "></div>`
  });
};

const Dashboard = memo(function Dashboard() {
  const { theme } = useTheme();
  const [selectedId, setSelectedId] = useState(null);
  const { data, isLoading, error } = useDashboard();
  const { isLoading: shipmentsLoading } = useShipments();
  const shipments = useShipmentStore(state => state.shipments);
  const highRiskCount = shipments.filter(
    s => s.risk?.current?.risk_level === 'high'
  ).length;

  if (isLoading) return <div className="py-24 flex flex-col items-center justify-center gap-4"><LoadingSpinner /><p className="text-theme-secondary text-sm tracking-widest uppercase font-bold animate-pulse">Loading Live Intelligence...</p></div>;
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
        <StatCard
          title="Total Shipments"
          value={data?.total_shipments || 0}
          icon={Package}
          trend={12}
          colorClass="border-theme"
          delay={0.1}
        />
        <StatCard
          title="Active Disruptions"
          value={data?.active_disruptions || 0}
          icon={AlertTriangle}
          colorClass={data?.active_disruptions > 0 ? 'border-primary-500' : 'border-success'}
          delay={0.2}
        />
        <StatCard
          title="Avg Risk Score"
          value={data?.avg_risk_score ? data.avg_risk_score.toFixed(1) : "0"}
          icon={Activity}
          trend={-5}
          colorClass={isLowRisk ? 'border-success' : 'border-warning'}
          delay={0.3}
        />
        <StatCard
          title="Optimized Routes"
          value={data?.optimized_routes || 0}
          icon={Navigation}
          trend={24}
          colorClass="border-primary-400"
          delay={0.4}
        />
      </div>

      {/* Live React Leaflet Integration */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-panel rounded-3xl overflow-hidden border border-theme shadow-2xl flex flex-col bg-theme-secondary/30 backdrop-blur-md"
      >
        <div className="px-6 py-5 border-b border-theme/50 bg-theme-secondary/20 flex justify-between items-center z-10 relative">
          <h2 className="text-xl font-black text-theme-primary flex items-center gap-3 tracking-tight">
            <Navigation className="w-6 h-6 text-accent animate-pulse" /> Global Fleet Intelligence
          </h2>
          <div className="flex gap-4 text-[9px] uppercase font-black tracking-[0.2em] bg-theme-primary/80 px-4 py-2 rounded-xl border border-theme shadow-lg backdrop-blur-sm">
            <span className="flex items-center gap-2 text-success"><div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div> Nominal</span>
            <span className="flex items-center gap-2 text-warning"><div className="w-2 h-2 rounded-full bg-warning shadow-[0_0_8px_rgba(250,204,21,0.5)]"></div> Warning</span>
            <span className="flex items-center gap-2 text-danger"><div className="w-2 h-2 rounded-full bg-danger shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div> Critical</span>
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

              const etaDelay = isHigh ? "+4h Delay" : isMed ? "+1.5h Delay" : "On Time";
              const delayClass = isHigh ? "text-danger bg-danger/10" : isMed ? "text-warning bg-warning/10" : "text-success bg-success/10";

              const polylinePositions = shipment.route_waypoints?.filter(
                (wp) => typeof wp.lat === "number" && typeof wp.lng === "number"
              ).map((wp) => [wp.lat, wp.lng]) || [];

              const isSelected = selectedId === shipment.id;
              const opacity = selectedId && selectedId !== shipment.id ? 0.4 : 1;

              return (
                <div key={shipment.id}>
                  {polylinePositions.length > 1 && (
                    <Polyline
                      positions={polylinePositions}
                      pathOptions={{
                        color: isSelected ? "#3b82f6" : isHigh ? "#ef4444" : isMed ? "#f97316" : "#22c55e",
                        weight: isSelected ? 6 : 3,
                        opacity: isSelected ? 1 : 0.25
                      }}
                    />
                  )}

                  <Marker
                    position={[loc.lat, loc.lng]}
                    icon={getMarkerIcon(riskLevel, isSelected, theme)}
                    opacity={opacity}
                    eventHandlers={{
                      click: () => setSelectedId(prev => prev === shipment.id ? null : shipment.id),
                    }}
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
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded text-white ${isHigh ? "bg-danger" : isMed ? "bg-warning" : "bg-success"}`}
                          >
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
                </div>
              );
            })}
          </MapContainer>

          {/* 🔥 LIVE SUMMARY */}
          <div className="absolute top-6 right-6 bg-theme-secondary/90 p-5 rounded-2xl w-60 z-[1000] border border-theme shadow-2xl backdrop-blur-md">
            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] mb-3 text-theme-secondary">System Pulse</h3>

            {highRiskCount > 0 ? (
              <div className="space-y-1">
                <p className="text-danger font-black text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> {highRiskCount} CRITICAL ALERTS
                </p>
                <p className="text-[10px] text-theme-secondary font-medium">Immediate intervention required</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-success font-black text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> ALL SYSTEMS NOMINAL
                </p>
                <p className="text-[10px] text-theme-secondary font-medium">Global operations stable</p>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-theme border-dashed">
              <p className="text-theme-primary text-[10px] font-bold tracking-wider">
                ACTIVE SHIPMENTS: {shipments.length}
              </p>
            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );
});

export default Dashboard;

