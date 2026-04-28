import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { X, Route, ShieldAlert, CheckCircle, Navigation } from 'lucide-react';
import { useShipmentStore } from '../../stores/shipmentStore';
import { useUpdateShipment } from '../../hooks/useShipments';
import toast from 'react-hot-toast';

const DecisionPanel = memo(function DecisionPanel({ shipmentId, onClose }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();

  const shipments = useShipmentStore(state => state.shipments);
  const updateMutation = useUpdateShipment();

  const shipment = shipments.find(s => s.id === shipmentId);

  const onSubmit = async (data) => {
    try {
      // Send the reroute decision to the backend via PATCH
      await updateMutation.mutateAsync({
        id: shipmentId,
        payload: {
          status: 'rerouting',
        },
      });

      toast.success(`Route optimization initiated for ${shipment.tracking_number}`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to execute routing command.');
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
          className="bg-theme-secondary rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-theme flex flex-col"
        >
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-theme flex items-center justify-between bg-theme-tertiary/30">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-accent/20 rounded-xl border border-accent/30 shadow-inner">
                <Navigation className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-theme-primary tracking-tight">System Reroute Interface</h2>
                <p className="text-xs sm:text-sm text-theme-secondary font-medium">Tracking Number: <span className="font-mono text-theme-primary">{shipment.tracking_number}</span></p>
              </div>
            </div>
            <button onClick={onClose} disabled={isSubmitting} className="p-2 text-theme-secondary hover:text-theme-primary transition-colors rounded-xl hover:bg-theme-tertiary cursor-pointer disabled:opacity-50">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 md:p-8">
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

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-2">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-theme-secondary mb-2 uppercase tracking-wide">Select Reroute Node</label>
                  <select
                    {...register("new_route", { required: true })}
                    className="w-full bg-theme-tertiary border border-theme text-theme-primary text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-accent focus:outline-none transition-all shadow-inner appearance-none"
                  >
                    <option value="default_suggestion">Algorithm Suggestion: {shipment.origin} → Pune → {shipment.destination}</option>
                    <option value="Ahmedabad">Base Station (Ahmedabad)</option>
                    <option value="Jaipur">Forward Node (Jaipur)</option>
                    <option value="Mumbai">Final Hub (Mumbai)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-theme-secondary mb-2 uppercase tracking-wide">Override Priority (Optional)</label>
                  <select
                    {...register("priority")}
                    className="w-full bg-theme-tertiary border border-theme text-theme-primary text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-accent focus:outline-none transition-all shadow-inner appearance-none"
                  >
                    <option value="speed">Optimize for Speed (Default)</option>
                    <option value="safety">Optimize for Extreme Safety</option>
                    <option value="cost">Optimize for Fuel Economy</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-theme">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent hover:bg-accent/80 text-white font-bold rounded-xl shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  {isSubmitting ? (
                    <>Executing Routing Command...</>
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
