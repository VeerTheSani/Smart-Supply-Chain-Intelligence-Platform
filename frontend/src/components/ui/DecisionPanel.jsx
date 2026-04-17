import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { X, Route, ShieldAlert, CheckCircle, Navigation } from 'lucide-react';
import { useShipmentStore } from '../../stores/shipmentStore';
import toast from 'react-hot-toast';

const DecisionPanel = memo(function DecisionPanel({ shipmentId, onClose }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();
  
  const shipments = useShipmentStore(state => state.shipments);
  const updateShipment = useShipmentStore(state => state.updateShipment);
  
  const shipment = shipments.find(s => s.id === shipmentId);

  const onSubmit = async (data) => {
    // Simulate backend response payload delivery securely
    return new Promise((resolve) => {
      setTimeout(() => {
        
        let destination_mapping = data.new_route;
        if (data.new_route === 'default_suggestion') {
             destination_mapping = 'Pune'; // Simulated path
        }
        
        // Mutate Zustand Synchronously 
        updateShipment(shipmentId, {
          destination: destination_mapping,
          status: 'in_transit',
          risk: {
            ...shipment.risk,
            current: {
              ...shipment.risk?.current,
              risk_level: 'medium',
              risk_score: 55,
              reason: 'Re-routed around critical conditions via ' + data.priority + ' strategy.'
            }
          }
        });
        
        toast.success(`Route successfully optimized`);
        resolve();
        onClose();
      }, 1200); // Demo simulation pacing factor
    });
  };

  if (!shipmentId || !shipment) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="glass rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl border border-surface-800 flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-surface-800/50 flex items-center justify-between bg-surface-900/30">
            <div className="flex items-center gap-4">
               <div className="p-2.5 bg-primary-500/20 rounded-xl border border-primary-500/30 shadow-inner">
                 <Navigation className="w-5 h-5 text-primary-400" />
               </div>
               <div>
                  <h2 className="text-xl font-extrabold text-white tracking-tight">System Reroute Interface</h2>
                  <p className="text-sm text-surface-400 font-medium">Tracking Number: <span className="font-mono text-surface-200">{shipment.tracking_number}</span></p>
               </div>
            </div>
            <button onClick={onClose} className="p-2 text-surface-500 hover:text-white transition-colors rounded-xl hover:bg-surface-800 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-8">
             <div className="mb-6 space-y-3">
                 <div className="bg-red-950/30 border border-primary-500/40 p-4 rounded-xl flex items-start gap-4 shadow-sm shadow-red-900/10">
                     <ShieldAlert className="w-5 h-5 shrink-0 text-primary-500 mt-0.5" />
                     <div>
                       <h4 className="text-primary-400 font-bold uppercase tracking-widest text-xs mb-1">Risk Detection</h4>
                       <p className="text-surface-200 text-sm font-medium">{shipment.risk?.current?.reason || 'Critical environment vector identified.'}</p>
                     </div>
                 </div>

                 <div className="border border-surface-800 bg-surface-900/50 p-4 rounded-xl flex items-center gap-4">
                     <Route className="w-5 h-5 text-surface-400" />
                     <div>
                         <p className="text-xs uppercase tracking-widest text-surface-500 font-bold">Current Corridor</p>
                         <p className="text-surface-200 font-medium">{shipment.origin} <span className="text-primary-500 mx-2">→</span> {shipment.destination}</p>
                     </div>
                 </div>
             </div>

             <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-2">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-surface-300 mb-2 uppercase tracking-wide">Select Reroute Node</label>
                        <select 
                           {...register("new_route", { required: true })} 
                           className="w-full bg-surface-900 border border-surface-700 text-white text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all shadow-inner"
                        >
                           <option value="default_suggestion">Algorithm Suggestion: {shipment.origin} → Pune → {shipment.destination}</option>
                           <option value="Ahmedabad">Base Station (Ahmedabad)</option>
                           <option value="Jaipur">Forward Node (Jaipur)</option>
                           <option value="Mumbai">Final Hub (Mumbai)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-surface-300 mb-2 uppercase tracking-wide">Override Priority (Optional)</label>
                        <select 
                           {...register("priority")} 
                           className="w-full bg-surface-900 border border-surface-700 text-surface-200 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:outline-none transition-all shadow-inner"
                        >
                           <option value="speed">Optimize for Speed (Default)</option>
                           <option value="safety">Optimize for Extreme Safety</option>
                           <option value="cost">Optimize for Fuel Economy</option>
                        </select>
                    </div>
                </div>

                <div className="pt-4 border-t border-surface-800">
                    <button 
                       type="submit" 
                       disabled={isSubmitting}
                       className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl shadow-lg shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                    >
                       {isSubmitting ? (
                          <>Engaging Mainframe...</>
                       ) : (
                          <>
                            <CheckCircle className="w-5 h-5" /> Execute Routing Command
                          </>
                       )}
                    </button>
                </div>
             </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
});

export default DecisionPanel;
