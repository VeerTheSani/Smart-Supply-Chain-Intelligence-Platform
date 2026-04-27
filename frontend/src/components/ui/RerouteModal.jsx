import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, X, Clock, ShieldAlert, ArrowRight, Activity, ActivitySquare, Loader2 } from 'lucide-react';
import { useRerouting } from '../../hooks/useShipments';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';
import LoadingSpinner from './LoadingSpinner';
import ErrorFallback from './ErrorFallback';
import toast from 'react-hot-toast';

const RerouteModal = memo(function RerouteModal({ shipmentId, onClose }) {
  const { data, isLoading, error } = useRerouting(shipmentId);
  const queryClient = useQueryClient();
  const [engagingRoute, setEngagingRoute] = useState(null);

  const handleEngage = async (routeId) => {
    setEngagingRoute(routeId);
    try {
      await apiClient.post(`/api/reroute/${shipmentId}/execute`, { route_id: routeId });
      toast.success(`Route ${routeId} engaged successfully`);
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Reroute execution failed';
      toast.error(msg);
    } finally {
      setEngagingRoute(null);
    }
  };

  return (
    <AnimatePresence>
      {shipmentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme-primary/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-theme-secondary rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl border border-theme flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-theme flex items-center justify-between bg-theme-tertiary/30">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-accent/20 rounded-xl border border-accent/30 shadow-inner">
                  <ActivitySquare className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-theme-primary tracking-tight">Algorithmic Reroute Intelligence</h2>
                  <p className="text-sm text-theme-secondary font-medium">Shipment ID: <span className="font-mono text-theme-primary">{shipmentId.slice(-8)}</span></p>
                </div>
              </div>
              <button onClick={onClose} disabled={!!engagingRoute} className="p-2 text-theme-secondary hover:text-theme-primary transition-colors rounded-xl hover:bg-theme-tertiary cursor-pointer disabled:opacity-50">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar">
              {isLoading ? (
                <div className="py-24 flex flex-col items-center justify-center gap-4">
                  <LoadingSpinner />
                  <p className="text-theme-secondary font-medium animate-pulse text-sm tracking-wide">Synthesizing geographical vectors...</p>
                </div>
              ) : error ? (
                <ErrorFallback error={error} resetErrorBoundary={onClose} />
              ) : data ? (
                <div className="space-y-8">
                  {data.reroute_suggested && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-danger/5 border border-danger/20 p-5 rounded-xl flex items-start gap-4 shadow-lg shadow-danger/5"
                    >
                      <ShieldAlert className="w-6 h-6 shrink-0 text-danger mt-0.5" />
                      <div>
                        <h4 className="text-danger font-bold uppercase tracking-widest text-xs mb-1">CRITICAL INTERVENTION MANDATED</h4>
                        <p className="text-theme-primary text-sm">{data.reason}</p>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid gap-6 md:grid-cols-3">
                    {data.alternatives.map((alt, i) => {
                      const isRecommended = data.recommended_route === alt.route_id;
                      const timeSaved = data.current_route.eta - alt.eta;
                      const isEngaging = engagingRoute === alt.route_id;
                      
                      const tradeoff = alt.type.includes("Fast") ? "Optimizes for Speed over Safety" : 
                                       alt.type.includes("Safe") ? "Optimizes for Safety over Speed" : 
                                       "Algorithmically Balanced Constants";

                      return (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                          key={alt.route_id} 
                          className={`relative p-1 rounded-2xl overflow-hidden transition-all duration-300 ${isRecommended ? 'bg-gradient-to-b from-accent to-accent/20 shadow-xl -translate-y-2' : 'bg-theme-tertiary hover:bg-theme-tertiary/70'}`}
                        >
                          {isRecommended && (
                             <div className="absolute top-0 right-0 bg-accent text-white text-[10px] font-black tracking-widest px-4 py-1.5 rounded-bl-xl z-20 shadow-sm">
                               OPTIMAL CHOICE
                             </div>
                          )}

                          <div className="h-full w-full bg-theme-secondary rounded-xl p-5 flex flex-col z-10 relative border border-theme">
                            <div className="mb-5">
                              <h3 className={`text-2xl font-black ${isRecommended ? 'text-theme-primary' : 'text-theme-secondary'}`}>Route {alt.route_id}</h3>
                              <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${isRecommended ? 'text-accent' : 'text-theme-secondary'}`}>{alt.type}</p>
                            </div>
                            
                            <div className="space-y-4 mb-8 flex-1">
                              <div>
                                <div className="flex justify-between text-xs font-bold text-theme-secondary uppercase tracking-wider mb-1">
                                  <span>Exposure Risk</span>
                                  <span className={alt.risk_level === 'high' ? 'text-danger' : alt.risk_level === 'medium' ? 'text-warning' : 'text-success'}>{alt.risk_level}</span>
                                </div>
                                <div className="h-1.5 w-full bg-theme-tertiary rounded-full overflow-hidden">
                                  <div className={`h-full ${alt.risk_level === 'high' ? 'bg-danger' : alt.risk_level === 'medium' ? 'bg-warning' : 'bg-success'}`} style={{ width: `${Math.max(5, alt.risk_score)}%` }}></div>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-theme flex justify-between items-center">
                                <span className="text-theme-secondary font-medium text-sm flex items-center gap-2"><Clock className="w-4 h-4"/> Forecast ETA</span>
                                <div className="text-right">
                                  <div className="text-theme-primary font-bold text-lg">{(alt.eta / 3600).toFixed(1)} <span className="text-theme-secondary text-sm">hrs</span></div>
                                  {isRecommended && timeSaved > 0 && (
                                    <div className="text-success text-[10px] font-bold uppercase tracking-wider -mt-1 drop-shadow-md">Saves {(timeSaved / 3600).toFixed(1)} hrs</div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="pt-2 border-t border-theme">
                                <span className="text-theme-secondary text-xs italic opacity-80">
                                  "{tradeoff}"
                                </span>
                              </div>
                            </div>
                            
                            <button 
                              onClick={() => handleEngage(alt.route_id)}
                              disabled={!!engagingRoute}
                              className={`w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all uppercase cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isRecommended ? 'bg-accent text-white hover:bg-accent/80 shadow-md' : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-tertiary/70 hover:text-theme-primary'}`}
                            >
                              {isEngaging ? (
                                <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Engaging...</span>
                              ) : 'Engage Path'}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

export default RerouteModal;
