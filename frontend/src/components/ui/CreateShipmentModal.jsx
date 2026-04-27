import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { X, Package, Plus } from 'lucide-react';
import { useCreateShipment } from '../../hooks/useShipments';
import LocationAutocomplete from './LocationAutocomplete';
import toast from 'react-hot-toast';
import { cn } from '../../lib/utils';

const CreateShipmentModal = memo(function CreateShipmentModal({ isOpen, onClose }) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { auto_reroute_enabled: false } });

  const createMutation = useCreateShipment();
  const autoReroute = watch('auto_reroute_enabled');
  
  const [viaPoints, setViaPoints] = useState([]);

  useEffect(() => {
    register('origin_name', { required: 'Origin city is required' });
    register('destination_name', { required: 'Destination city is required' });
  }, [register]);

  useEffect(() => {
    if (!isOpen) {
      reset();
      setViaPoints([]);
    }
  }, [isOpen, reset]);

  const addViaPoint = () => setViaPoints(prev => prev.length < 5 ? [...prev, { location_name: '', type: 'pickup' }] : prev);
  const updateViaPoint = (index, field, value) => setViaPoints(prev => {
     const next = [...prev];
     next[index][field] = value;
     return next;
  });
  const removeViaPoint = (index) => setViaPoints(prev => prev.filter((_, i) => i !== index));

  const onSubmit = async (data) => {
    try {
      await createMutation.mutateAsync({
        shipment_name: data.shipment_name,
        origin_name: data.origin_name,
        destination_name: data.destination_name,
        via_points: viaPoints.filter(vp => vp.location_name.trim() !== ''),
        auto_reroute_enabled: data.auto_reroute_enabled,
      });
      toast.success('Shipment deployed. Will appear once risk analysis completes (~10s).');
      reset();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create shipment. Please try again.');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-primary/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-theme-secondary rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl border border-theme flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-theme flex items-center justify-between bg-theme-tertiary/30">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-accent/20 rounded-xl border border-accent/30 shadow-inner">
                  <Package className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-theme-primary tracking-tight">Deploy New Shipment</h2>
                  <p className="text-sm text-theme-secondary font-medium">Configure route and tracking parameters</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-theme-secondary hover:text-theme-primary transition-colors rounded-xl hover:bg-theme-tertiary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-8">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Shipment Name */}
                <div>
                  <label className="block text-sm font-bold text-theme-secondary mb-2 uppercase tracking-wide">
                    Shipment Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai-Delhi Express"
                    {...register('shipment_name', { required: 'Shipment name is required', minLength: { value: 2, message: 'Minimum 2 characters' } })}
                    className={cn(
                      'w-full bg-theme-tertiary border text-theme-primary text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-accent focus:outline-none transition-all',
                      errors.shipment_name ? 'border-danger' : 'border-theme'
                    )}
                  />
                  {errors.shipment_name && (
                    <p className="text-danger text-xs mt-1.5">{errors.shipment_name.message}</p>
                  )}
                </div>

                {/* Origin */}
                <div>
                  <label className="block text-sm font-bold text-theme-secondary mb-2 uppercase tracking-wide">
                    Origin City
                  </label>
                  <LocationAutocomplete
                    placeholder="Search origin city..."
                    value={watch('origin_name')}
                    onChange={(val) => setValue('origin_name', val, { shouldValidate: true })}
                    error={errors.origin_name}
                  />
                  {errors.origin_name && (
                    <p className="text-danger text-xs mt-1.5">{errors.origin_name.message}</p>
                  )}
                </div>

                {/* Via Points */}
                {viaPoints.map((vp, index) => (
                  <div key={index} className="flex items-start gap-2 bg-theme-tertiary/20 p-3 rounded-xl border border-theme">
                     <div className="flex-1">
                        <LocationAutocomplete
                           placeholder={`Via Stop ${index + 1}...`}
                           value={vp.location_name}
                           onChange={(val) => updateViaPoint(index, 'location_name', val)}
                        />
                     </div>
                     <select 
                        className="bg-theme-secondary border border-theme text-theme-primary text-sm rounded-xl px-3 py-3 focus:ring-2 focus:ring-accent outline-none"
                        value={vp.type}
                        onChange={(e) => updateViaPoint(index, 'type', e.target.value)}
                     >
                        <option value="pickup">Pick-up</option>
                        <option value="delivery">Delivery</option>
                        <option value="custom">Custom</option>
                     </select>
                     <button
                        type="button"
                        onClick={() => removeViaPoint(index)}
                        className="bg-danger/10 text-danger hover:bg-danger/20 p-3 rounded-xl border border-danger/20 transition-colors"
                     >
                        <X className="w-5 h-5" />
                     </button>
                  </div>
                ))}

                {viaPoints.length < 5 && (
                  <button 
                     type="button" 
                     onClick={addViaPoint}
                     className="text-xs font-bold text-accent tracking-wide hover:underline flex items-center gap-1"
                  >
                     <Plus className="w-3 h-3" /> ADD VIA TARGET
                  </button>
                )}

                {/* Destination */}
                <div>
                  <label className="block text-sm font-bold text-theme-secondary mb-2 uppercase tracking-wide">
                    Destination City
                  </label>
                  <LocationAutocomplete
                    placeholder="Search destination city..."
                    value={watch('destination_name')}
                    onChange={(val) => setValue('destination_name', val, { shouldValidate: true })}
                    error={errors.destination_name}
                  />
                  {errors.destination_name && (
                    <p className="text-danger text-xs mt-1.5">{errors.destination_name.message}</p>
                  )}
                </div>

                {/* Auto-Reroute Toggle */}
                <div className="flex items-center justify-between p-4 bg-theme-tertiary/50 border border-theme rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-theme-primary">Auto-Reroute (Emergency)</p>
                    <p className="text-xs text-theme-secondary mt-0.5">Automatically reroute on critical risk detection</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setValue('auto_reroute_enabled', !autoReroute)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-200 cursor-pointer',
                      autoReroute ? 'bg-accent border-accent' : 'bg-theme-primary border-theme'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
                        autoReroute ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>

                {/* Submit */}
                <div className="pt-2 border-t border-theme">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent hover:bg-accent/80 text-white font-bold rounded-xl shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    {isSubmitting ? (
                      'Deploying Shipment...'
                    ) : (
                      <>
                        <Plus className="w-5 h-5" /> Deploy Shipment
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

export default CreateShipmentModal;
