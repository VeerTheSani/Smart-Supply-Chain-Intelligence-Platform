import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, X, Clock, ShieldAlert, ArrowRight, Activity, ActivitySquare } from 'lucide-react';
import { useRerouting } from '../../hooks/useApi';
import LoadingSpinner from './LoadingSpinner';
import ErrorFallback from './ErrorFallback';

const RerouteModal = memo(function RerouteModal({ shipmentId, onClose }) {
  const { data, isLoading, error } = useRerouting(shipmentId);

  const handleEngage = (routeId) => {
    alert(`[SYSTEM COMMAND] Reroute sequence initialized.\n\nSuccessfully engaged alternative algorithm path: Route ${routeId} for Shipment ${shipmentId.slice(-6)}.`);
    onClose();
  };

  return (
    <AnimatePresence>
      {shipmentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="glass rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl border border-surface-800 flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-surface-800/50 flex items-center justify-between bg-surface-900/30">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-primary-500/20 rounded-xl border border-primary-500/30 shadow-inner">
                  <ActivitySquare className="w-6 h-6 text-primary-400" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-white tracking-tight">Algorithmic Reroute Intelligence</h2>
                  <p className="text-sm text-surface-400 font-medium">Shipment ID: <span className="font-mono text-surface-200">{shipmentId.slice(-8)}</span></p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 text-surface-500 hover:text-white transition-colors rounded-xl hover:bg-surface-800 cursor-pointer">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar">
              {isLoading ? (
                <div className="py-24 flex flex-col items-center justify-center gap-4">
                  <LoadingSpinner />
                  <p className="text-surface-400 font-medium animate-pulse text-sm tracking-wide">Synthesizing geographical vectors...</p>
                </div>
              ) : error ? (
                <ErrorFallback error={error} resetErrorBoundary={onClose} />
              ) : data ? (
                <div className="space-y-8">
                  {data.reroute_suggested && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-red-950/30 border border-primary-500/40 p-5 rounded-xl flex items-start gap-4 shadow-lg shadow-red-900/10"
                    >
                      <ShieldAlert className="w-6 h-6 shrink-0 text-primary-500 mt-0.5" />
                      <div>
                        <h4 className="text-primary-400 font-bold uppercase tracking-widest text-xs mb-1">CRITICAL INTERVENTION MANDATED</h4>
                        <p className="text-surface-200 text-sm">{data.reason}</p>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid gap-6 md:grid-cols-3">
                    {data.alternatives.map((alt, i) => {
                      const isRecommended = data.recommended_route === alt.route_id;
                      const timeSaved = data.current_route.eta - alt.eta;
                      
                      // Trade-off string logic
                      let tradeoff = "";
                      if (alt.type.includes("Fast")) tradeoff = "Optimizes for Speed over Safety";
                      else if (alt.type.includes("Safe")) tradeoff = "Optimizes for Safety over Speed";
                      else tradeoff = "Algorithmically Balanced Constants";

                      return (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                          key={alt.route_id} 
                          className={`relative p-1 rounded-2xl overflow-hidden transition-all duration-300 ${isRecommended ? 'bg-gradient-to-b from-primary-400 to-primary-900 shadow-xl shadow-primary-500/20 -translate-y-2' : 'bg-surface-800 hover:bg-surface-700/50'}`}
                        >
                          {isRecommended && (
                             <div className="absolute top-0 right-0 bg-primary-500 text-white text-[10px] font-black tracking-widest px-4 py-1.5 rounded-bl-xl z-20">
                               OPTIMAL CHOICE
                             </div>
                          )}

                          <div className="h-full w-full bg-surface-900 rounded-xl p-5 flex flex-col z-10 relative">
                            <div className="mb-5">
                              <h3 className={`text-2xl font-black ${isRecommended ? 'text-white' : 'text-surface-300'}`}>Route {alt.route_id}</h3>
                              <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${isRecommended ? 'text-primary-400' : 'text-surface-500'}`}>{alt.type}</p>
                            </div>
                            
                            <div className="space-y-4 mb-8 flex-1">
                              <div>
                                <div className="flex justify-between text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">
                                  <span>Exposure Risk</span>
                                  <span className={alt.risk_level === 'high' ? 'text-primary-400' : alt.risk_level === 'medium' ? 'text-yellow-400' : 'text-green-400'}>{alt.risk_level}</span>
                                </div>
                                <div className="h-1.5 w-full bg-surface-800 rounded-full overflow-hidden">
                                  <div className={`h-full ${alt.risk_level === 'high' ? 'bg-primary-500' : alt.risk_level === 'medium' ? 'bg-yellow-400' : 'bg-green-500'}`} style={{ width: `${Math.max(5, alt.risk_score)}%` }}></div>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-surface-800 flex justify-between items-center">
                                <span className="text-surface-400 font-medium text-sm flex items-center gap-2"><Clock className="w-4 h-4"/> Forecast ETA</span>
                                <div className="text-right">
                                  <div className="text-white font-bold text-lg">{(alt.eta / 3600).toFixed(1)} <span className="text-surface-500 text-sm">hrs</span></div>
                                  {isRecommended && timeSaved > 0 && (
                                    <div className="text-green-400 text-[10px] font-bold uppercase tracking-wider -mt-1 drop-shadow-md">Saves {(timeSaved / 3600).toFixed(1)} hrs</div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="pt-2 border-t border-surface-800">
                                <span className="text-surface-500 text-xs italic">
                                  "{tradeoff}"
                                </span>
                              </div>
                            </div>
                            
                            <button 
                              onClick={() => handleEngage(alt.route_id)}
                              className={`w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all uppercase cursor-pointer ${isRecommended ? 'bg-primary-500 text-white hover:bg-primary-400 shadow-md' : 'bg-surface-800 text-surface-400 hover:bg-surface-700 hover:text-white'}`}
                            >
                              Engage Path
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
