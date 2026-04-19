import { memo } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, ShieldCheck, TrendingUp, Navigation, Package } from 'lucide-react';
import { useDashboard, useShipments } from '../hooks/useApi';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import { useShipmentStore } from '../stores/shipmentStore';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { useEffect } from "react";


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
      transition={{ delay }}
      className={`glass rounded-2xl p-6 border-b-4 ${colorClass}`}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-4">
          <p className="text-surface-400 text-sm font-semibold tracking-wider uppercase">{title}</p>
          <div className="flex items-end gap-3">
            <h3 className="text-4xl font-bold text-white tracking-tight">{value}</h3>
            {trend && (
              <span className={`flex items-center gap-1 text-sm font-medium pb-1 ${trend > 0 ? 'text-primary-400' : 'text-red-400'}`}>
                {trend > 0 ? '+' : ''}{trend}% <TrendingUp className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
        <div className={`p-3 rounded-xl bg-surface-800 shadow-inner ${colorClass.replace('border-', 'text-')}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </motion.div>
  );
});
// 👇 ADD THIS ABOVE Dashboard component
function AutoCenter({ shipments }) {
  const map = useMap();

  useEffect(() => {
    if (!shipments || shipments.length === 0) return;

    const valid = shipments.filter(
      s => s.current_location?.lat && s.current_location?.lng
    );

    if (valid.length === 0) return;

    const last = valid[valid.length - 1];

    // Only move if far away (prevents jitter)
    const currentCenter = map.getCenter();

    if (
      Math.abs(currentCenter.lat - last.current_location.lat) > 0.1 ||
      Math.abs(currentCenter.lng - last.current_location.lng) > 0.1
    ) {
      map.setView(
        [last.current_location.lat, last.current_location.lng],
        6
      );
    }
  }, [shipments, map]);

  return null;
}
const getMarkerIcon = (risk) => {
  const isHigh = risk === "high" || risk === "critical";
  const isMedium = risk === "medium";
  const color = isHigh ? "#ef4444" : isMedium ? "#facc15" : "#22c55e";
  const pulseClass = isHigh ? "marker-pulse-high" : isMedium ? "marker-pulse-medium" : "";

  return new L.DivIcon({
    className: "custom-marker",
    html: `<div class="${pulseClass}" style="
      background:${color};
      width:14px;
      height:14px;
      border-radius:50%;
      border:2px solid #1e293b;
      box-shadow: 0 0 6px rgba(0,0,0,0.7);"></div>`
  });
};

const Dashboard = memo(function Dashboard() {
  const { data, isLoading, error } = useDashboard();
  const { isLoading: shipmentsLoading } = useShipments(); 
  const shipments = useShipmentStore(state => state.shipments);

  if (isLoading) return <div className="py-24 flex flex-col items-center justify-center gap-4"><LoadingSpinner /><p className="text-surface-400 text-sm tracking-widest uppercase font-bold animate-pulse">Loading Live Intelligence...</p></div>;
  if (error) return <ErrorFallback error={error} />;

  const isLowRisk = data?.avg_risk_score < 40;

  return (
    <div className="space-y-8">
      <div>
        <motion.h1
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-3xl font-bold text-white tracking-tight"
        >
          Control Center
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="text-surface-400 mt-1"
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
          colorClass="border-surface-600"
          delay={0.1}
        />
        <StatCard
          title="Active Disruptions"
          value={data?.active_disruptions || 0}
          icon={AlertTriangle}
          colorClass={data?.active_disruptions > 0 ? 'border-primary-500' : 'border-green-500'}
          delay={0.2}
        />
        <StatCard
          title="Avg Risk Score"
          value={data?.avg_risk_score ? data.avg_risk_score.toFixed(1) : "0"}
          icon={Activity}
          trend={-5}
          colorClass={isLowRisk ? 'border-green-500' : 'border-yellow-500'}
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
        className="glass rounded-3xl overflow-hidden border border-surface-800 shadow-2xl flex flex-col"
      >
        <div className="px-6 py-4 border-b border-surface-800/50 bg-surface-900/30 flex justify-between items-center z-10 relative">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary-400" /> Live Shipment Tracking
          </h2>
          <div className="flex gap-4 text-[10px] uppercase font-bold tracking-widest bg-surface-950/50 px-3 py-1.5 rounded-lg border border-surface-800">
            <span className="flex items-center gap-1.5 text-green-400"><div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-sm shadow-green-500/50"></div> Safe</span>
            <span className="flex items-center gap-1.5 text-orange-400"><div className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-sm shadow-orange-500/50"></div> Warning</span>
            <span className="flex items-center gap-1.5 text-red-400"><div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/50"></div> High Risk</span>
          </div>
        </div>
        
        <div className="h-[400px] relative z-0">
          <MapContainer center={[23.0225, 72.5714]} zoom={5} scrollWheelZoom={false} style={{ height: "100%", width: "100%", zIndex: 0 }}>

          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          <AutoCenter shipments={shipments} />
          {/* STATIC TEST MARKER (STEP 1) */}
          <Marker position={[23.0225, 72.5714]}>
            <Popup>
              <span className="text-gray-900 font-bold">India Base Station</span>
            </Popup>
          </Marker>

          {/* DYNAMIC MARKERS & POLYLINES (STEP 2) */}
          {shipments?.map(shipment => {
            if (shipment.current_location && shipment.current_location.lat && shipment.current_location.lng) {
              
              const isHigh = shipment.risk?.current?.risk_level === 'high' || shipment.risk?.current?.risk_level === 'critical';
              const isMed = shipment.risk?.current?.risk_level === 'medium';
              const etaDelay = isHigh ? '+4h Delay' : isMed ? '+1.5h Delay' : 'On Time';
              const delayClass = isHigh ? 'text-red-600 bg-red-100' : isMed ? 'text-yellow-600 bg-yellow-100' : 'text-green-600 bg-green-100';
              
              // Map Coordinate Mapping
              const CITY_COORDS = {
                Ahmedabad: [23.0225, 72.5714],
                Mumbai: [19.0760, 72.8777],
                Pune: [18.5204, 73.8567],
                Delhi: [28.6139, 77.2090],
                Jaipur: [26.9124, 75.7873],
                Bangalore: [12.9716, 77.5946],
                Chennai: [13.0827, 80.2707],
                London: [51.5074, -0.1278],
                Paris: [48.8566, 2.3522],
                'New York': [40.7128, -74.0060],
                'Los Angeles': [34.0522, -118.2437]
              };

              let originKey = Object.keys(CITY_COORDS).find(k => (shipment.origin || '').toLowerCase().includes(k.toLowerCase()));
              let destKey = Object.keys(CITY_COORDS).find(k => (shipment.destination || '').toLowerCase().includes(k.toLowerCase()));
              
              const routeOrigin = originKey ? CITY_COORDS[originKey] : null;
              const routeDest = destKey ? CITY_COORDS[destKey] : null;

              return (
                <div key={shipment.id}>
                {shipment.route_waypoints?.length > 1 && (
                  <Polyline
                    positions={shipment.route_waypoints.map(wp => [wp.lat, wp.lng])}
                    pathOptions={{ color: isHigh ? "#ef4444" : isMed ? "#f97316" : "#22c55e", weight: 3, dashArray: "5, 10" }}
                  />
                )}
                  
                  <Marker
                    position={[shipment.current_location.lat, shipment.current_location.lng]}
                    icon={getMarkerIcon(shipment.risk?.current?.risk_level)}
                  >
                    <Popup className="custom-popup border-0">
                      <div className="flex flex-col gap-1 min-w-[160px]">
                        <strong className="text-gray-900 border-b border-gray-200 pb-1 mb-1 text-sm tracking-wide">{shipment.tracking_number}</strong>
                        <span className="text-gray-600 text-[11px] font-bold uppercase tracking-wider text-primary-600">Route: {shipment.origin} → {shipment.destination}</span>
                        
                        <div className="flex justify-between items-center mt-1 pt-1 border-t border-gray-100 border-dashed">
                          <span className={`font-bold uppercase tracking-wider text-[9px] px-2 py-0.5 rounded text-white shadow-sm ${
                              isHigh ? 'bg-red-500' : isMed ? 'bg-yellow-500' : 'bg-green-500'
                          }`}>
                            Risk: {shipment.risk?.current?.risk_level || 'low'}
                          </span>
                          <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${delayClass}`}>
                            ETA: {etaDelay}
                          </span>
                        </div>
                        
                        {shipment.risk?.current?.reason && (
                          <div className="bg-red-50 mt-1.5 p-1.5 rounded border border-red-100 shadow-sm">
                            <span className="text-red-700 text-[9px] font-bold uppercase tracking-wide leading-[1.1] block">
                               ⚠️ {shipment.risk.current.reason}
                            </span>
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                </div>
              );
            }
            return null;
          })}
          </MapContainer>
        </div>
      </motion.div>
    </div>
  );
});

export default Dashboard;
