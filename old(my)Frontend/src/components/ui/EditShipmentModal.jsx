import { memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { X, Edit2, MapPin, Save, Route } from 'lucide-react';
import { useUpdateShipment } from '../../hooks/useShipments';
import toast from 'react-hot-toast';
import { cn } from '../../lib/utils';

const PRESET_LOCATIONS = [
  { label: 'Mumbai, Maharashtra',    lat: 19.0760, lng: 72.8777 },
  { label: 'Delhi, NCT',             lat: 28.6139, lng: 77.2090 },
  { label: 'Bangalore, Karnataka',   lat: 12.9716, lng: 77.5946 },
  { label: 'Chennai, Tamil Nadu',    lat: 13.0827, lng: 80.2707 },
  { label: 'Kolkata, West Bengal',   lat: 22.5726, lng: 88.3639 },
  { label: 'Hyderabad, Telangana',   lat: 17.3850, lng: 78.4867 },
  { label: 'Pune, Maharashtra',      lat: 18.5204, lng: 73.8567 },
  { label: 'Jaipur, Rajasthan',      lat: 26.9124, lng: 75.7873 },
  { label: 'Ahmedabad, Gujarat',     lat: 23.0225, lng: 72.5714 },
  { label: 'Surat, Gujarat',         lat: 21.1702, lng: 72.8311 },
  { label: 'Lucknow, Uttar Pradesh', lat: 26.8467, lng: 80.9462 },
  { label: 'Nagpur, Maharashtra',    lat: 21.1458, lng: 79.0882 },
];

const STATUS_OPTIONS = ['planned', 'in_transit', 'rerouting', 'delivered', 'delayed'];

const statusBadgeClass = (status) => {
  switch (status) {
    case 'delivered': return 'bg-green-500/10 text-green-400 border border-green-500/20';
    case 'in_transit': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    case 'rerouting': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
    case 'delayed': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
    default: return 'bg-theme-tertiary text-theme-secondary border border-theme';
  }
};

const EditShipmentModal = memo(function EditShipmentModal({ shipment, onClose }) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm();

  const updateMutation = useUpdateShipment();
  const presetValue = watch('location_preset');
  const lat = watch('lat');
  const lng = watch('lng');
  const autoReroute = watch('auto_reroute_enabled');

  useEffect(() => {
    if (!shipment) return;
    reset({
      status: shipment.status || 'planned',
      auto_reroute_enabled: shipment.auto_reroute_enabled ?? false,
      location_preset: '',
      lat: shipment.current_location?.lat?.toString() ?? '',
      lng: shipment.current_location?.lng?.toString() ?? '',
    });
  }, [shipment, reset]);

  useEffect(() => {
    if (presetValue === '' || presetValue === undefined) return;
    const idx = parseInt(presetValue, 10);
    const loc = PRESET_LOCATIONS[idx];
    if (loc) {
      setValue('lat', loc.lat.toString(), { shouldDirty: true });
      setValue('lng', loc.lng.toString(), { shouldDirty: true });
    }
  }, [presetValue, setValue]);

  const onSubmit = async (data) => {
    const payload = {
      status: data.status,
      auto_reroute_enabled: data.auto_reroute_enabled,
    };

    const latNum = parseFloat(data.lat);
    const lngNum = parseFloat(data.lng);
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      payload.current_location = { lat: latNum, lng: lngNum };
    }

    try {
      await updateMutation.mutateAsync({ id: shipment.id, payload });
      toast.success(`Shipment ${shipment.tracking_number} updated successfully`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Update failed. Please try again.');
    }
  };

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const hasValidCoords = !isNaN(latNum) && !isNaN(lngNum) && lat && lng;

  return (
    <AnimatePresence>
      {shipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-primary/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-theme-secondary rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl border border-theme flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-theme flex items-center justify-between bg-theme-tertiary/30 shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-accent/20 rounded-xl border border-accent/30 shadow-inner">
                  <Edit2 className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-theme-primary tracking-tight">Edit Shipment</h2>
                  <p className="text-sm text-theme-secondary font-medium">
                    Tracking: <span className="font-mono text-theme-primary">{shipment.tracking_number}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-theme-secondary hover:text-theme-primary transition-colors rounded-xl hover:bg-theme-tertiary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="p-8 overflow-y-auto">
              {/* Route info strip */}
              <div className="mb-6 border border-theme bg-theme-tertiary/50 p-4 rounded-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Route className="w-5 h-5 text-theme-secondary shrink-0" />
                  <p className="text-theme-primary font-medium text-sm">
                    {shipment.origin}
                    <span className="text-accent mx-2">→</span>
                    {shipment.destination}
                  </p>
                </div>
                <span className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide shrink-0',
                  statusBadgeClass(shipment.status)
                )}>
                  {shipment.status?.replace('_', ' ')}
                </span>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Status */}
                <div>
                  <label className="block text-sm font-bold text-theme-secondary mb-2 uppercase tracking-wide">
                    Status
                  </label>
                  <select
                    {...register('status')}
                    className="w-full bg-theme-tertiary border border-theme text-theme-primary text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-accent focus:outline-none transition-all appearance-none cursor-pointer"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Auto-Reroute Toggle */}
                <div className="flex items-center justify-between p-4 bg-theme-tertiary/50 border border-theme rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-theme-primary">Auto-Reroute</p>
                    <p className="text-xs text-theme-secondary mt-0.5">Automatically reroute on risk detection</p>
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

                {/* Change Current Location */}
                <div className="pt-5 border-t border-theme space-y-4">
                  <h3 className="text-xs font-bold text-theme-secondary uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5" /> Change Current Location
                  </h3>

                  {/* Preset dropdown */}
                  <div>
                    <label className="block text-sm font-bold text-theme-secondary mb-2 uppercase tracking-wide">
                      Quick Select City
                    </label>
                    <select
                      {...register('location_preset')}
                      className="w-full bg-theme-tertiary border border-theme text-theme-primary text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-accent focus:outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="">— Select a preset city —</option>
                      {PRESET_LOCATIONS.map((loc, i) => (
                        <option key={i} value={i}>{loc.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Manual lat/lng */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-theme-secondary mb-2 uppercase tracking-wide">
                        Latitude
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 19.0760"
                        {...register('lat', {
                          pattern: { value: /^-?\d+(\.\d+)?$/, message: 'Invalid latitude' },
                        })}
                        className={cn(
                          'w-full bg-theme-tertiary border text-theme-primary text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-accent focus:outline-none transition-all font-mono',
                          errors.lat ? 'border-danger' : 'border-theme'
                        )}
                      />
                      {errors.lat && <p className="text-danger text-xs mt-1">{errors.lat.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-theme-secondary mb-2 uppercase tracking-wide">
                        Longitude
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 72.8777"
                        {...register('lng', {
                          pattern: { value: /^-?\d+(\.\d+)?$/, message: 'Invalid longitude' },
                        })}
                        className={cn(
                          'w-full bg-theme-tertiary border text-theme-primary text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-accent focus:outline-none transition-all font-mono',
                          errors.lng ? 'border-danger' : 'border-theme'
                        )}
                      />
                      {errors.lng && <p className="text-danger text-xs mt-1">{errors.lng.message}</p>}
                    </div>
                  </div>

                  {/* Live coordinate preview */}
                  {hasValidCoords && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-theme-secondary bg-theme-tertiary rounded-xl px-4 py-2.5 font-mono border border-theme"
                    >
                      <span className="text-accent mr-2">◈</span>
                      {latNum.toFixed(4)}°N, {lngNum.toFixed(4)}°E
                    </motion.div>
                  )}
                </div>

                {/* Submit */}
                <div className="pt-2 border-t border-theme">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent hover:bg-accent/80 text-white font-bold rounded-xl shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    {isSubmitting ? (
                      'Updating Route...'
                    ) : (
                      <>
                        <Save className="w-5 h-5" /> Save Changes
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

export default EditShipmentModal;
