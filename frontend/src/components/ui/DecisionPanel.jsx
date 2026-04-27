import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Route, ShieldAlert, CheckCircle, Navigation, Loader2 } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const DecisionPanel = memo(function DecisionPanel({ shipmentId, onClose }) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Fetch shipment from React Query cache
  const shipments = queryClient.getQueryData(['shipments']) || [];
  const shipment = shipments.find(s => s.id === shipmentId);

  const handleCancel = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/api/countdown/${shipmentId}/cancel`);
      toast.success('Countdown cancelled — reroute aborted');
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to cancel countdown';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveReroute = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // Trigger manual reroute via the real backend endpoint
      await apiClient.post(`/api/reroute/${shipmentId}/execute`);
      toast.success('Reroute executed successfully');
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Reroute execution failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!shipmentId || !shipment) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-primary/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-theme-secondary rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl border border-theme flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-theme flex items-center justify-between bg-theme-tertiary/30">
            <div className="flex items-center gap-4">
               <div className="p-2.5 bg-accent/20 rounded-xl border border-accent/30 shadow-inner">
                 <Navigation className="w-5 h-5 text-accent" />
               </div>
               <div>
                  <h2 className="text-xl font-extrabold text-theme-primary tracking-tight">System Reroute Interface</h2>
                  <p className="text-sm text-theme-secondary font-medium">Tracking Number: <span className="font-mono text-theme-primary">{shipment.tracking_number}</span></p>
               </div>
            </div>
            <button onClick={onClose} disabled={isSubmitting} className="p-2 text-theme-secondary hover:text-theme-primary transition-colors rounded-xl hover:bg-theme-tertiary cursor-pointer disabled:opacity-50">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-8">
             <div className="mb-6 space-y-3">
                 <div className="bg-danger/5 border border-danger/20 p-4 rounded-xl flex items-start gap-4 shadow-sm shadow-danger/5">
                     <ShieldAlert className="w-5 h-5 shrink-0 text-danger mt-0.5" />
                     <div>
                       <h4 className="text-danger font-bold uppercase tracking-widest text-xs mb-1">Risk Detection</h4>
                       <p className="text-theme-primary text-sm font-medium">{shipment.risk?.current?.reason || 'Critical environment vector identified.'}</p>
                     </div>
                 </div>

                 <div className="border border-theme bg-theme-tertiary/50 p-4 rounded-xl flex items-center gap-4">
                     <Route className="w-5 h-5 text-theme-secondary" />
                     <div>
                         <p className="text-xs uppercase tracking-widest text-theme-secondary font-bold">Current Corridor</p>
                         <p className="text-theme-primary font-medium">{shipment.origin} <span className="text-accent mx-2">→</span> {shipment.destination}</p>
                     </div>
                 </div>
             </div>

             {error && (
               <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-xl text-danger text-sm font-medium">
                 {error}
               </div>
             )}

             <div className="pt-4 border-t border-theme space-y-3">
                 <button
                    onClick={handleApproveReroute}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent hover:bg-accent/80 text-white font-bold rounded-xl shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                 >
                    {isSubmitting ? (
                       <><Loader2 className="w-5 h-5 animate-spin" /> Executing...</>
                    ) : (
                       <>
                         <CheckCircle className="w-5 h-5" /> Execute Reroute Now
                       </>
                    )}
                 </button>

                 <button
                    onClick={handleCancel}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-theme-tertiary hover:bg-theme-tertiary/70 text-theme-secondary hover:text-theme-primary font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    Cancel Countdown
                 </button>
             </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
});

export default DecisionPanel;
