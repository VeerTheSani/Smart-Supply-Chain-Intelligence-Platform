import { memo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, MapPin } from 'lucide-react';
import { useShipments } from '../hooks/useShipments';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';

const Disruptions = memo(function Disruptions() {
  const { data: shipments, isLoading, error } = useShipments();

  if (isLoading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;
  if (error) return <ErrorFallback error={error} />;

  const disrupted = shipments?.filter(s => s.risk?.current?.risk_level === 'high' || s.risk?.current?.risk_level === 'medium') || [];

  return (
    <div className="space-y-6 bg-theme-primary">
      <motion.h1
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="text-lg sm:text-xl md:text-2xl font-bold text-theme-primary flex items-center gap-2"
      >
        <AlertTriangle className="w-6 h-6 text-danger" />
        Active Disruptions
      </motion.h1>

      <div className="grid gap-4">
        {disrupted.length === 0 ? (
          <div className="bg-theme-secondary p-8 text-center text-theme-secondary rounded-xl border border-theme">No active disruptions. Fleet is operating optimally.</div>
        ) : (
          disrupted.map((shipment, i) => (
             <motion.div 
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: i * 0.1 }}
               key={shipment.id} 
               className={`bg-theme-secondary p-6 rounded-xl border-l-4 border-theme shadow-md ${shipment.risk?.current?.risk_level === 'high' ? 'border-l-danger bg-danger/5' : 'border-l-warning bg-warning/5'}`}
             >
               <h3 className="text-theme-primary font-bold mb-3 tracking-wide">Tracking ID: <span className="font-mono text-accent">{shipment.tracking_number}</span></h3>
               <p className="text-sm text-theme-secondary flex items-center gap-2"><MapPin className="w-4 h-4"/> {shipment.origin} <span className="opacity-50">→</span> {shipment.destination}</p>
               <p className="text-sm text-theme-secondary mt-3 font-mono">
                 <span className="font-bold uppercase tracking-wider text-xs opacity-70">ROOT CAUSE:</span> {shipment.risk?.current?.reason}
               </p>
             </motion.div>
          ))
        )}
      </div>
    </div>
  );
});

export default Disruptions;
