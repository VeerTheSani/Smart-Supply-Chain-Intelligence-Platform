import { memo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, MapPin } from 'lucide-react';
import { useShipments } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const Disruptions = memo(function Disruptions() {
  const { data: shipments, isLoading } = useShipments();

  if (isLoading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;

  const disrupted = shipments?.filter(s => s.risk?.current?.risk_level === 'high' || s.risk?.current?.risk_level === 'medium') || [];

  return (
    <div className="space-y-6">
      <motion.h1
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="text-2xl font-bold text-white flex items-center gap-2"
      >
        <AlertTriangle className="w-6 h-6 text-red-500" />
        Active Disruptions
      </motion.h1>

      <div className="grid gap-4">
        {disrupted.length === 0 ? (
          <div className="glass p-8 text-center text-surface-400 rounded-xl">No active disruptions. Fleet is operating optimally.</div>
        ) : (
          disrupted.map((shipment, i) => (
             <motion.div 
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: i * 0.1 }}
               key={shipment.id} 
               className={`glass p-6 rounded-xl border-l-4 ${shipment.risk?.current?.risk_level === 'high' ? 'border-red-500 bg-red-950/10' : 'border-yellow-500 bg-yellow-950/10'}`}
             >
               <h3 className="text-white font-bold mb-3 tracking-wide">Tracking ID: <span className="font-mono text-primary-400">{shipment.tracking_number}</span></h3>
               <p className="text-sm text-surface-300 flex items-center gap-2"><MapPin className="w-4 h-4"/> {shipment.origin} <span className="text-surface-600">→</span> {shipment.destination}</p>
               <p className="text-sm text-surface-400 mt-3 font-mono">
                 <span className="font-bold uppercase tracking-wider text-xs">ROOT CAUSE:</span> {shipment.risk?.current?.reason}
               </p>
             </motion.div>
          ))
        )}
      </div>
    </div>
  );
});

export default Disruptions;
