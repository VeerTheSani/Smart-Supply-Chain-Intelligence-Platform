import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Package, ShieldAlert, Navigation, Search, Filter, Eye } from 'lucide-react';
import { useShipments } from '../hooks/useShipments';
import { useShipmentStore } from '../stores/shipmentStore';
import { useUIStore } from '../stores/uiStore';
import { useCountdownStore } from '../stores/countdownStore';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';
import DecisionPanel from '../components/ui/DecisionPanel';
import ShipmentDetailPanel from '../components/ui/ShipmentDetailPanel';
import CountdownBar from '../components/ui/CountdownBar';
import { cn } from '../lib/utils';

const Shipments = memo(function Shipments() {
  const { isLoading, error } = useShipments();
  const shipments = useShipmentStore(state => state.shipments);
  const countdowns = useCountdownStore(state => state.countdowns);
  
  const { inspectingShipmentId, setInspectingShipmentId } = useUIStore();
  const [rerouteId, setRerouteId] = useState(null);
  const [filterText, setFilterText] = useState('');

  const inspectShipment = shipments.find(s => s.id === inspectingShipmentId);

  if (isLoading) {
    return <div className="py-24 flex flex-col items-center justify-center gap-4"><LoadingSpinner /><p className="text-theme-secondary text-sm tracking-widest uppercase font-bold animate-pulse">Loading Route Architectures...</p></div>;
  }
  if (error) {
    return <ErrorFallback error={error} />;
  }

  // Filter shipments by search text
  const filtered = filterText
    ? shipments?.filter(s =>
      s.tracking_number?.toLowerCase().includes(filterText.toLowerCase()) ||
      s.origin?.toLowerCase().includes(filterText.toLowerCase()) ||
      s.destination?.toLowerCase().includes(filterText.toLowerCase())
    )
    : shipments;

  // Active countdowns to show at top
  const activeCountdownIds = Object.keys(countdowns);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <motion.h1
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-bold text-theme-primary flex items-center gap-2 tracking-tight"
        >
          <Package className="w-6 h-6 text-accent" />
          Shipment Core
        </motion.h1>

        <div className="flex w-full sm:w-auto items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-secondary" />
            <input
              type="text"
              placeholder="Search ID, Origin..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full bg-theme-secondary border border-theme rounded-xl py-2 pl-10 pr-4 text-sm text-theme-primary focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-theme-secondary border border-theme rounded-xl text-sm font-medium hover:bg-theme-tertiary transition-all duration-200 cursor-pointer text-theme-primary shadow-sm hover:shadow-md active:scale-95">
            <Filter className="w-4 h-4 text-accent" /> Filter
          </button>
        </div>
      </div>

      {/* Active countdown alerts at top */}
      {activeCountdownIds.length > 0 && (
        <div className="space-y-2">
          {activeCountdownIds.map(sid => (
            <CountdownBar key={sid} shipmentId={sid} />
          ))}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-2xl overflow-hidden border border-theme shadow-xl bg-theme-secondary/50 backdrop-blur-md"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-theme-tertiary/50 text-theme-secondary text-[10px] uppercase tracking-[0.2em] px-6 border-b border-theme/50">
                <th className="py-5 px-6 font-bold">Tracking ID</th>
                <th className="py-5 px-6 font-bold">Route Endpoint</th>
                <th className="py-5 px-6 font-bold">Status</th>
                <th className="py-5 px-6 font-bold">Environment</th>
                <th className="py-5 px-6 font-bold text-center">Risk Intel</th>
                <th className="py-5 px-6 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme">
              {filtered?.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center text-theme-secondary">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Package className="w-10 h-10 text-theme-secondary opacity-30" />
                      <span className="text-sm font-medium uppercase tracking-widest">No active shipments in system.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered?.map((shipment) => {
                  const riskLevel = shipment.risk?.current?.risk_level || 'low';
                  const riskScore = shipment.risk?.current?.risk_score || 0;

                  const isSafe = riskLevel === 'low';
                  const isWarning = riskLevel === 'medium';
                  const isCritical = riskLevel === 'high' || riskLevel === 'critical';
                  const hasCountdown = !!countdowns[shipment.id];

                  return (
                    <tr
                      key={shipment.id}
                      className={cn(
                        "group transition-colors hover:bg-theme-tertiary/50 cursor-pointer",
                        isCritical && "bg-danger/5",
                        hasCountdown && "bg-amber-500/5"
                      )}
                      onClick={() => setInspectingShipmentId(shipment.id)}
                    >
                      <td className="py-4 px-6">
                        <span className="font-mono text-sm font-semibold text-theme-primary bg-theme-tertiary px-2 py-1 rounded">
                          {shipment.tracking_number}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-theme-secondary">{shipment.origin}</span>
                          <span className="text-theme-secondary font-bold opacity-50">→</span>
                          <span className="text-theme-primary font-medium">{shipment.destination}</span>
                        </div>
                      </td>

                      <td className="py-5 px-6">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                            shipment.status === 'in_transit' ? "bg-accent/10 text-accent border-accent/20" :
                            shipment.status === 'delayed' ? "bg-warning/10 text-warning border-warning/20" :
                            "bg-theme-tertiary text-theme-secondary border-theme"
                          )}>
                            {shipment.status}
                          </span>
                          {hasCountdown && (
                            <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.2)]">
                              REROUTING
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <div className="text-xs text-theme-secondary flex flex-col gap-0.5">
                          {shipment.conditions?.weather && <span>{shipment.conditions.weather}</span>}
                          {shipment.conditions?.traffic && <span className="opacity-60">{shipment.conditions.traffic}</span>}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <div className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${isSafe ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                            isWarning ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                              'bg-primary-500/20 text-primary-400 border border-primary-500/30 animate-pulse'
                          }`}>
                          <ShieldAlert className="w-3.5 h-3.5" />
                          {riskScore.toFixed(0)} ({riskLevel})
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setInspectingShipmentId(shipment.id)}
                            className="text-xs font-bold text-theme-secondary uppercase cursor-pointer hover:text-accent transition-all duration-200 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-accent/5 border border-transparent hover:border-accent/10"
                          >
                            <Eye className="w-3.5 h-3.5" /> Intel
                          </button>
                          {(isWarning || isCritical) && (
                            <button
                              onClick={() => setRerouteId(shipment.id)}
                              className="bg-accent hover:bg-accent/90 text-white px-5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-accent/20 transition-all duration-300 hover:scale-105 active:scale-95 uppercase tracking-wider whitespace-nowrap cursor-pointer group"
                            >
                              <Navigation className="w-4 h-4 transition-transform group-hover:rotate-12" />
                              Reroute
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

       {/* NOTE: Global ShipmentDetailPanel and DecisionPanel are now handled in RootLayout */}
    </div>
  );
});

export default Shipments;
