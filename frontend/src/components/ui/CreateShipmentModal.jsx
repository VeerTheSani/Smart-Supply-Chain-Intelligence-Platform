import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { X, Package, Plus } from 'lucide-react';
import { useCreateShipment } from '../../hooks/useShipments';
import LocationAutocomplete from './LocationAutocomplete';
import apiClient from '../../api/apiClient';
import toast from 'react-hot-toast';
import { cn } from '../../lib/utils';
import { useTheme } from '../../context/ThemeContext';

const CreateShipmentModal = memo(function CreateShipmentModal({ isOpen, onClose }) {
  const { theme } = useTheme();
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
  const [availableShipments, setAvailableShipments] = useState([]);
  const [upstreamId, setUpstreamId] = useState('');

  useEffect(() => {
    register('origin_name', { required: 'Origin city is required' });
    register('origin_coords');
    register('destination_name', { required: 'Destination city is required' });
    register('destination_coords');
  }, [register]);

  useEffect(() => {
    if (!isOpen) {
      reset();
      setViaPoints([]);
      setUpstreamId('');
    }
  }, [isOpen, reset]);

  useEffect(() => {
    if (!isOpen) return;
    apiClient.get('/api/shipments').then(res => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.shipments ?? []);
      setAvailableShipments(list.filter(s => s.status !== 'delivered'));
    }).catch(() => {});
  }, [isOpen]);

  const addViaPoint = () => setViaPoints(prev => prev.length < 5 ? [...prev, { location_name: '', type: 'pickup', stop_duration_minutes: 0 }] : prev);
  const updateViaPoint = (index, field, value) => setViaPoints(prev => {
     const next = [...prev];
     if (field === 'location_data') {
       next[index].location_name = value.name;
       next[index].coords = value.coords;
     } else {
       next[index][field] = value;
     }
     return next;
  });
  const removeViaPoint = (index) => setViaPoints(prev => prev.filter((_, i) => i !== index));

  const onSubmit = async (data) => {
    try {
      await createMutation.mutateAsync({
        shipment_name: data.shipment_name,
        origin_name: data.origin_name,
        origin_coords: data.origin_coords,
        destination_name: data.destination_name,
        destination_coords: data.destination_coords,
        via_points: viaPoints.filter(vp => vp.location_name.trim() !== '').map(vp => ({
          ...vp,
          stop_duration_minutes: Number(vp.stop_duration_minutes) || 0
        })),
        auto_reroute_enabled: data.auto_reroute_enabled,
        ...(upstreamId ? { upstream_shipment_id: upstreamId, depends_on_delivery: true } : {}),
      });
      toast.success('Shipment deployed. Will appear once risk analysis completes (~10s).');
      reset();
      onClose();
    } catch (err) {
      let errMsg = 'Failed to create shipment. Please try again.';
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          errMsg = err.response.data.detail.map(e => e.msg || e.type).join(', ');
        } else if (typeof err.response.data.detail === 'string') {
          errMsg = err.response.data.detail;
        }
      }
      toast.error(errMsg);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-500/20 backdrop-blur-sm transition-all">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "backdrop-blur-2xl rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col relative custom-scrollbar border",
              theme === 'dark' ? "bg-[#0a0a0f]/95 border-white/10" : "bg-white/95 border-slate-200"
            )}
          >
            {/* Header */}
            <div className={cn(
              "p-4 sm:p-6 border-b flex items-center justify-between",
              theme === 'dark' ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
            )}>
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-accent/20 rounded-xl border border-accent/30 shadow-inner">
                  <Package className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className={cn(
                    "text-lg sm:text-xl font-extrabold tracking-tight",
                    theme === 'dark' ? "text-white" : "text-slate-900"
                  )}>Deploy New Shipment</h2>
                  <p className={cn(
                    "text-xs sm:text-sm font-medium hidden sm:block",
                    theme === 'dark' ? "text-slate-400" : "text-slate-500"
                  )}>Configure route and tracking parameters</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  "p-2 transition-colors rounded-xl cursor-pointer",
                  theme === 'dark' ? "text-slate-400 hover:text-white hover:bg-white/10" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
                )}
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className={cn(
              "p-4 sm:p-6 md:p-8",
              theme === 'dark' ? "text-white" : "text-slate-900"
            )}>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Shipment Name */}
                <div>
                  <label className={cn(
                    "block text-sm font-bold mb-2 uppercase tracking-wide",
                    theme === 'dark' ? "text-slate-400" : "text-slate-600"
                  )}>
                    Shipment Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai-Delhi Express"
                    {...register('shipment_name', { required: 'Shipment name is required', minLength: { value: 2, message: 'Minimum 2 characters' } })}
                    className={cn(
                      'w-full border text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-accent focus:outline-none transition-all',
                      theme === 'dark' ? "bg-white/5 border-white/10 text-white" : "bg-slate-50 border-slate-200 text-slate-900",
                      errors.shipment_name ? 'border-danger' : ''
                    )}
                  />
                  {errors.shipment_name && (
                    <p className="text-danger text-xs mt-1.5">{errors.shipment_name.message}</p>
                  )}
                </div>

                {/* Origin */}
                <div>
                  <label className={cn(
                    "block text-sm font-bold mb-2 uppercase tracking-wide",
                    theme === 'dark' ? "text-slate-400" : "text-slate-600"
                  )}>
                    Origin City
                  </label>
                  <LocationAutocomplete
                    placeholder="Search origin city..."
                    value={watch('origin_name')}
                    onChange={(val) => {
                      setValue('origin_name', val.name, { shouldValidate: true });
                      setValue('origin_coords', val.coords);
                    }}
                    error={errors.origin_name}
                  />
                </div>

                {/* Via Points */}
                {viaPoints.map((vp, index) => (
                  <div key={index} className={cn(
                    "flex flex-wrap items-start gap-2 p-3 rounded-xl border",
                    theme === 'dark' ? "bg-white/5 border-white/10" : "bg-slate-100 border-slate-200"
                  )}>
                     <div className="flex-1">
                        <LocationAutocomplete
                           placeholder={`Via Stop ${index + 1}...`}
                           value={vp.location_name}
                           onChange={(val) => updateViaPoint(index, 'location_data', val)}
                        />
                     </div>
                     <select 
                        className={cn(
                          "border text-sm rounded-xl px-3 py-3 focus:ring-2 focus:ring-accent outline-none",
                          theme === 'dark' ? "bg-slate-900 border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
                        )}
                        value={vp.type}
                        onChange={(e) => updateViaPoint(index, 'type', e.target.value)}
                     >
                        <option value="pickup">Pick-up</option>
                        <option value="delivery">Delivery</option>
                        <option value="custom">Custom</option>
                     </select>
                     <select 
                        className={cn(
                          "border text-sm rounded-xl px-2 py-3 focus:ring-2 focus:ring-accent outline-none min-w-[100px]",
                          theme === 'dark' ? "bg-slate-900 border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
                        )}
                        value={vp.stop_duration_minutes || 0}
                        onChange={(e) => updateViaPoint(index, 'stop_duration_minutes', parseInt(e.target.value, 10))}
                     >
                        <option value={0}>No Wait</option>
                        <option value={15}>15 min</option>
                        <option value={30}>30 min</option>
                        <option value={60}>1 hr</option>
                        <option value={120}>2 hr</option>
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
                  <label className={cn(
                    "block text-sm font-bold mb-2 uppercase tracking-wide",
                    theme === 'dark' ? "text-slate-400" : "text-slate-600"
                  )}>
                    Destination City
                  </label>
                  <LocationAutocomplete
                    placeholder="Search destination city..."
                    value={watch('destination_name')}
                    onChange={(val) => {
                      setValue('destination_name', val.name, { shouldValidate: true });
                      setValue('destination_coords', val.coords);
                    }}
                    error={errors.destination_name}
                  />
                </div>

                {/* Upstream dependency */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className={cn(
                      "block text-sm font-bold uppercase tracking-wide",
                      theme === 'dark' ? "text-slate-400" : "text-slate-600"
                    )}>
                      Systemic Dependency
                    </label>
                    <div className="px-2 py-1 bg-accent/10 border border-accent/20 rounded-md">
                      <span className="text-[10px] font-black text-accent uppercase tracking-tighter italic">CASCADING INTELLIGENCE V3.4</span>
                    </div>
                  </div>

                  <div className="relative group">
                    <select
                      value={upstreamId}
                      onChange={e => setUpstreamId(e.target.value)}
                      className={cn(
                        "w-full border text-sm rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-accent focus:outline-none transition-all appearance-none cursor-pointer pr-10 font-bold",
                        theme === 'dark' ? "bg-white/5 border-white/10 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                    >
                      <option value="" className={theme === 'dark' ? "bg-slate-900" : "bg-white"}>⚡ INDEPENDENT OPERATION (Direct Deployment)</option>
                      {availableShipments.map(s => (
                        <option 
                          key={s.id} 
                          value={s.id} 
                          className={theme === 'dark' ? "bg-slate-900" : "bg-white"}
                        >
                          🔗 {s.shipment_name.toUpperCase()} (Arrives: {s.destination_name})
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                        <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                      </svg>
                    </div>
                  </div>

                  {/* Visual Breakdown */}
                  <div className={cn(
                    "p-4 rounded-xl border transition-all duration-300",
                    upstreamId 
                      ? "bg-accent/5 border-accent/20" 
                      : (theme === 'dark' ? "bg-white/5 border-white/10 opacity-40 grayscale" : "bg-slate-50 border-slate-200 opacity-40 grayscale")
                  )}>
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div className={cn("w-3 h-3 rounded-full", upstreamId ? "bg-accent animate-pulse" : (theme === 'dark' ? "bg-white/10" : "bg-slate-200"))} />
                        <div className="w-[2px] h-6 bg-gradient-to-b from-current to-transparent opacity-20" />
                        <div className={cn("w-3 h-3 rounded-full border-2", upstreamId ? "border-accent" : (theme === 'dark' ? "border-white/10" : "border-slate-200"))} />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={cn("text-[10px] font-black uppercase tracking-widest", theme === 'dark' ? "text-slate-500" : "text-slate-400")}>Logic Stream</span>
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", upstreamId ? "bg-accent text-white" : (theme === 'dark' ? "bg-white/10 text-slate-500" : "bg-slate-200 text-slate-500"))}>
                            {upstreamId ? 'LOCKED' : 'DIRECT'}
                          </span>
                        </div>
                        <p className={cn("text-[11px] leading-relaxed font-medium", theme === 'dark' ? "text-slate-300" : "text-slate-700")}>
                          {upstreamId ? (
                            <>This shipment will <span className="text-accent font-black">depart only after</span> the delivery of its prerequisite. Real-time ETA delays will automatically push back this deployment schedule.</>
                          ) : (
                            "This shipment operates on an independent schedule. No upstream delivery prerequisite is required for departure."
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Auto-Reroute Toggle */}
                <div className={cn(
                  "flex items-center justify-between p-4 rounded-xl border",
                  theme === 'dark' ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
                )}>
                  <div>
                    <p className={cn("text-sm font-bold", theme === 'dark' ? "text-white" : "text-slate-900")}>Auto-Reroute (Emergency)</p>
                    <p className={cn("text-xs mt-0.5", theme === 'dark' ? "text-slate-400" : "text-slate-500")}>Automatically reroute on critical risk detection</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setValue('auto_reroute_enabled', !autoReroute)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-200 cursor-pointer',
                      autoReroute ? 'bg-accent border-accent' : (theme === 'dark' ? 'bg-slate-800 border-white/10' : 'bg-slate-200 border-slate-300')
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
                <div className={cn("pt-2 border-t", theme === 'dark' ? "border-white/10" : "border-slate-200")}>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-accent hover:bg-accent/80 text-white font-bold rounded-xl shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    <Plus className="w-5 h-5" /> Deploy Shipment
                  </button>
                </div>
              </form>
            </div>

            {/* Premium Glassmorphic Loading Overlay (Inside Modal) */}
            {isSubmitting && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-3xl flex flex-col items-center justify-center p-10 border border-white/10"
              >
                <div className="relative w-24 h-24 mb-10">
                   <div className="absolute inset-0 rounded-full border-[6px] border-white/5" />
                   <div className="absolute inset-0 rounded-full border-[6px] border-accent border-t-transparent animate-spin shadow-[0_0_30px_rgba(59,130,246,0.5)]" />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 bg-accent/20 rounded-full animate-pulse blur-sm" />
                   </div>
                </div>
                <h3 className="text-2xl font-black text-theme-primary mb-2 uppercase tracking-[0.2em]">Deploying Intelligence</h3>
                <p className="text-[10px] text-theme-secondary font-black uppercase tracking-[0.4em] opacity-60 mb-12">Synchronizing Global Network Nodes</p>
                
                <div className="w-full max-w-sm space-y-5">
                  {[
                    { id: 1, text: 'Resolving Geographic Waypoints', delay: 0 },
                    { id: 2, text: 'Fetching Live Traffic & Incidents', delay: 2 },
                    { id: 3, text: 'Aggregating Weather Predictions', delay: 4 },
                    { id: 4, text: 'Executing AI Risk Engine', delay: 6 }
                  ].map((s, idx) => (
                    <div key={s.id} className="flex items-center gap-6 text-xs font-black tracking-[0.1em] relative">
                      {idx !== 3 && <div className="absolute left-[11px] top-5 w-[2px] h-8 bg-white/5 -z-10" />}

                      <div className="relative z-10 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-[#0a0a0f] border-white/10">
                         <div className="w-3 h-3 rounded-full bg-accent absolute inset-0 m-auto opacity-0" style={{ animation: `premiumFadeIn 0.2s forwards ${s.delay}s`, boxShadow: '0 0 10px #e53935' }} />
                         <div className="w-3 h-3 rounded-full bg-accent absolute inset-0 m-auto animate-ping" style={{ animationDelay: `${s.delay}s`, animationDuration: '2s' }} />
                      </div>
                      <span className="text-theme-secondary flex-1 opacity-40 uppercase" style={{ animation: `premiumColorShift 0.5s forwards ${s.delay}s` }}>
                        {s.text}
                      </span>
                    </div>
                  ))}
                </div>
                <style>{`
                  @keyframes premiumFadeIn { to { opacity: 1; } }
                  @keyframes premiumColorShift { to { opacity: 1; color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.5); } }
                `}</style>
              </motion.div>
            )}

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

export default CreateShipmentModal;
