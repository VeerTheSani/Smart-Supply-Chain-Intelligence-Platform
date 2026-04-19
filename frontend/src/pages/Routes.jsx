import { memo } from 'react';
import { motion } from 'framer-motion';
import { Route as RouteIcon, Navigation } from 'lucide-react';
import { useShipments } from '../hooks/useShipments';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorFallback from '../components/ui/ErrorFallback';

const Routes = memo(function Routes() {
  const { data: shipments, isLoading, error } = useShipments();
  if (isLoading) return <div className="py-20 flex justify-center"><LoadingSpinner /></div>;
  if (error) return <ErrorFallback error={error} />;

  return (
    <div className="space-y-6 bg-theme-primary">
      <motion.h1
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="text-2xl font-bold text-theme-primary flex items-center gap-2"
      >
        <RouteIcon className="w-6 h-6 text-success" />
        Route Overviews
      </motion.h1>

      <div className="grid gap-4 md:grid-cols-2">
        {shipments?.length === 0 ? (
          <div className="bg-theme-secondary col-span-2 p-8 text-center text-theme-secondary rounded-xl border border-theme">No active route telemetry found.</div>
        ) : (
          shipments?.map((shipment, i) => (
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: i * 0.05 }}
               key={shipment.id} 
               className="bg-theme-secondary p-6 rounded-xl relative overflow-hidden border border-theme shadow-md"
             >
               <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none text-theme-primary">
                 <Navigation className="w-24 h-24" />
               </div>
               <h3 className="text-theme-primary font-bold mb-4 tracking-wide text-lg relative z-10">{shipment.origin} <span className="opacity-40 mx-1">→</span> {shipment.destination}</h3>
               <div className="space-y-2 relative z-10">
                 <div className="flex justify-between text-sm">
                   <span className="text-theme-secondary">Tracking Code:</span>
                   <span className="font-mono text-accent font-bold">{shipment.tracking_number}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                   <span className="text-theme-secondary">GPS Coords:</span>
                   <span className="font-mono text-theme-primary opacity-80">
                      {shipment.current_location?.lat?.toFixed(4)}, {shipment.current_location?.lng?.toFixed(4)}
                   </span>
                 </div>
               </div>
             </motion.div>
          ))
        )}
      </div>
    </div>
  );
});

export default Routes;
