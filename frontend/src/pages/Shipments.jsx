import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Package, ShieldAlert, Navigation, Search, Filter } from 'lucide-react';
import { useShipments } from '../hooks/useApi';
import { useShipmentStore } from '../stores/shipmentStore';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';
import DecisionPanel from '../components/ui/DecisionPanel';
import { cn } from '../lib/utils';

const Shipments = memo(function Shipments() {
  const { isLoading, error } = useShipments();
  const shipments = useShipmentStore(state => state.shipments);
  const [rerouteId, setRerouteId] = useState(null);

  if (isLoading) {
    return <div className="py-24 flex flex-col items-center justify-center gap-4"><LoadingSpinner /><p className="text-surface-400 text-sm tracking-widest uppercase font-bold animate-pulse">Loading Route Architectures...</p></div>;
  }
  if (error) {
    return <ErrorFallback error={error} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <motion.h1
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-bold text-white flex items-center gap-2 tracking-tight"
        >
          <Package className="w-6 h-6 text-primary-400" />
          Shipment Core
        </motion.h1>

        <div className="flex w-full sm:w-auto items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input 
              type="text" 
              placeholder="Search ID, Origin..." 
              className="w-full bg-surface-900 border border-surface-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-surface-900 border border-surface-800 rounded-xl text-sm font-medium hover:bg-surface-800 transition-colors cursor-pointer">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl overflow-hidden border border-surface-800/50 shadow-2xl"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-900/50 text-surface-400 text-xs uppercase tracking-widest px-6">
                <th className="py-4 px-6 font-semibold">Tracking ID</th>
                <th className="py-4 px-6 font-semibold">Route Endpoint</th>
                <th className="py-4 px-6 font-semibold">Status</th>
                <th className="py-4 px-6 font-semibold">Environment</th>
                <th className="py-4 px-6 font-semibold text-center">Risk Intel</th>
                <th className="py-4 px-6 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800/50">
              {shipments?.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center text-surface-500">
                     <div className="flex flex-col items-center justify-center gap-3">
                        <Package className="w-10 h-10 text-surface-600 opacity-50" />
                        <span className="text-sm font-medium uppercase tracking-widest">No active shipments in system.</span>
                     </div>
                  </td>
                </tr>
              ) : (
                shipments?.map((shipment) => {
                  const riskLevel = shipment.risk?.current?.risk_level || 'low';
                  const riskScore = shipment.risk?.current?.risk_score  || 0;
                  
                  const isSafe = riskLevel === 'low';
                  const isWarning = riskLevel === 'medium';
                  const isCritical = riskLevel === 'high' || riskLevel === 'critical';


                  return (
                    <tr 
                      key={shipment.id} 
                      className={cn(
                        "group transition-colors hover:bg-surface-800/30",
                        isCritical && "bg-red-950/10"
                      )}
                    >
                      <td className="py-4 px-6">
                        <span className="font-mono text-sm font-semibold text-surface-200 bg-surface-900 px-2 py-1 rounded">
                          {shipment.tracking_number}
                        </span>
                      </td>
                      
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-surface-300">{shipment.origin}</span>
                          <span className="text-surface-600 font-bold">→</span>
                          <span className="text-white font-medium">{shipment.destination}</span>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <span className="text-xs tracking-wider uppercase font-bold text-surface-400">
                          {shipment.status}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <div className="text-xs text-surface-400 flex flex-col gap-0.5">
                          {shipment.conditions?.weather && <span>{shipment.conditions.weather}</span>}
                          {shipment.conditions?.traffic && <span className="text-surface-500">{shipment.conditions.traffic}</span>}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <div className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                          isSafe ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                          isWarning ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                          'bg-primary-500/20 text-primary-400 border border-primary-500/30 animate-pulse'
                        }`}>
                          <ShieldAlert className="w-3.5 h-3.5" />
                          {riskScore.toFixed(0)} ({riskLevel})
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right">
                        {(isWarning || isCritical) ? (
                          <button 
                            onClick={() => setRerouteId(shipment.id)}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-purple-500/30 transition-all duration-200 hover:scale-105 active:scale-95 uppercase tracking-wider whitespace-nowrap cursor-pointer"
                          >
                            <Navigation className="w-4 h-4" />
                            View Reroute
                          </button>
                        ) : (
                          <button 
                            onClick={() => alert(`INSPECTION INITIATED\n\nTracing Payload: ${shipment.tracking_number}\nRouting: ${shipment.origin} -> ${shipment.destination}\nRisk Assesment: ${riskLevel.toUpperCase()}`)}
                            className="text-xs font-bold text-surface-500 uppercase cursor-pointer hover:text-surface-300 transition-colors"
                          >
                            Inspect
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <DecisionPanel shipmentId={rerouteId} onClose={() => setRerouteId(null)} />
    </div>
  );
});

export default Shipments;
