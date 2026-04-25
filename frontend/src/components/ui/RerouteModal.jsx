import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ActivitySquare, Clock, Route, ShieldAlert,
  Zap, Shield, Star, CloudRain, CheckCircle2, TrendingUp,
} from 'lucide-react';
import { useRerouting, useScoreReroute } from '../../hooks/useShipments';
import LoadingSpinner from './LoadingSpinner';
import toast from 'react-hot-toast';
import { cn } from '../../lib/utils';

const ROUTE_META = {
  Recommended: { icon: Star,    color: 'text-accent',       bg: 'bg-accent/10',       border: 'border-accent/30',       bar: '#6366f1' },
  Fastest:     { icon: Zap,     color: 'text-yellow-400',   bg: 'bg-yellow-400/10',   border: 'border-yellow-400/30',   bar: '#facc15' },
  Safest:      { icon: Shield,  color: 'text-green-400',    bg: 'bg-green-400/10',    border: 'border-green-400/30',    bar: '#4ade80' },
};

const riskColor = (level) => {
  switch (level) {
    case 'high':
    case 'critical': return 'text-red-400';
    case 'medium':   return 'text-yellow-400';
    default:         return 'text-green-400';
  }
};

const riskBarColor = (level) => {
  switch (level) {
    case 'high':
    case 'critical': return 'bg-red-500';
    case 'medium':   return 'bg-yellow-500';
    default:         return 'bg-green-500';
  }
};

function RouteCard({ alt, isScoring, index }) {
  const meta  = ROUTE_META[alt.label] ?? ROUTE_META.Recommended;
  const Icon  = meta.icon;
  const etaHrs = ((alt.eta ?? alt.duration_seconds ?? 0) / 3600).toFixed(1);
  const hasRisk = alt.risk_assessed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className={cn(
        'relative rounded-2xl border flex flex-col overflow-hidden transition-all duration-300',
        meta.border, meta.bg,
        alt.label === 'Recommended' && 'ring-2 ring-accent/40 shadow-xl shadow-accent/10'
      )}
    >
      {/* Top accent bar */}
      <div className="h-1 w-full" style={{ backgroundColor: meta.bar }} />

      {alt.label === 'Recommended' && (
        <div className="absolute top-2 right-3 text-[10px] font-black tracking-widest text-accent uppercase">
          ★ Optimal
        </div>
      )}

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Label + route ID */}
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-xl', meta.bg, 'border', meta.border)}>
            <Icon className={cn('w-4 h-4', meta.color)} />
          </div>
          <div>
            <p className={cn('text-xs font-black uppercase tracking-widest', meta.color)}>{alt.label}</p>
            <p className="text-theme-secondary text-xs">Route {alt.route_id}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-theme-secondary flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> ETA
            </span>
            <span className="text-theme-primary font-bold">{etaHrs} hrs</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-theme-secondary flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5" /> Distance
            </span>
            <span className="text-theme-primary font-bold">{alt.distance?.toFixed(0) ?? '—'} km</span>
          </div>

          {alt.extra_time_minutes > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-secondary flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Extra time
              </span>
              <span className="text-yellow-400 font-bold">+{alt.extra_time_minutes} min</span>
            </div>
          )}
        </div>

        {/* Risk section */}
        <div className="border-t border-theme pt-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide">
            <span className="text-theme-secondary flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Risk
            </span>
            <AnimatePresence mode="wait">
              {isScoring ? (
                <motion.span
                  key="scoring"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-theme-secondary flex items-center gap-1.5"
                >
                  <LoadingSpinner size="sm" color="bg-theme-secondary" />
                </motion.span>
              ) : hasRisk ? (
                <motion.span
                  key="scored"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn('font-black', riskColor(alt.risk_level))}
                >
                  {alt.risk_score?.toFixed(0)}/100 · {alt.risk_level?.toUpperCase()}
                </motion.span>
              ) : (
                <motion.span key="pending" className="text-theme-secondary italic text-xs font-normal">
                  Not assessed
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Risk bar */}
          <div className="h-1.5 w-full bg-theme-primary/20 rounded-full overflow-hidden">
            <motion.div
              className={cn('h-full rounded-full', hasRisk ? riskBarColor(alt.risk_level) : 'bg-theme-tertiary')}
              initial={{ width: 0 }}
              animate={{ width: hasRisk ? `${Math.max(4, alt.risk_score ?? 0)}%` : '0%' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>

          {/* Reason */}
          <AnimatePresence>
            {hasRisk && alt.reason && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-theme-secondary text-xs italic leading-relaxed"
              >
                <CloudRain className="w-3 h-3 inline mr-1 opacity-60" />
                {alt.reason}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

const RerouteModal = memo(function RerouteModal({ shipmentId, onClose }) {
  const { data, isLoading, error } = useRerouting(shipmentId);
  const scoreMutation = useScoreReroute();
  const [scoredAlts, setScoredAlts] = useState(null);

  const alternatives = scoredAlts ?? data?.alternatives ?? [];
  const isScoring    = scoreMutation.isPending;
  const isScored     = !!scoredAlts;

  const handleAssessRisk = async () => {
    if (!data?.alternatives?.length) return;
    try {
      const result = await scoreMutation.mutateAsync({
        id: shipmentId,
        alternatives: data.alternatives,
      });
      setScoredAlts(result.scored_alternatives);
      toast.success('Risk assessment complete.');
    } catch {
      toast.error('Risk assessment failed. Try again.');
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
            transition={{ duration: 0.2 }}
            className="bg-theme-secondary rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl border border-theme flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-theme flex items-center justify-between bg-theme-tertiary/30 shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-accent/20 rounded-xl border border-accent/30">
                  <ActivitySquare className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-theme-primary tracking-tight">
                    Algorithmic Reroute Intelligence
                  </h2>
                  <p className="text-sm text-theme-secondary font-medium">
                    Shipment <span className="font-mono text-theme-primary">{shipmentId?.slice(-8)}</span>
                    {isScored && (
                      <span className="ml-2 inline-flex items-center gap-1 text-green-400 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Risk assessed
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-theme-secondary hover:text-theme-primary rounded-xl hover:bg-theme-tertiary cursor-pointer transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {isLoading ? (
                <div className="py-24 flex flex-col items-center gap-4">
                  <LoadingSpinner size="lg" label="Computing alternative corridors..." />
                </div>
              ) : error ? (
                <div className="py-20 text-center space-y-3">
                  <ShieldAlert className="w-10 h-10 text-red-400 mx-auto opacity-60" />
                  <p className="text-theme-primary font-bold">Failed to load routes</p>
                  <p className="text-theme-secondary text-sm">{error.message}</p>
                  <button
                    onClick={onClose}
                    className="mt-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-bold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              ) : data ? (
                <div className="space-y-6">
                  {/* Alert banner if reroute suggested */}
                  {data.reroute_suggested && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-500/5 border border-red-500/20 p-4 rounded-xl flex items-start gap-3"
                    >
                      <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-red-400 font-bold text-xs uppercase tracking-widest mb-0.5">
                          Reroute Recommended
                        </p>
                        <p className="text-theme-primary text-sm">{data.reason}</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Route cards */}
                  <div className="grid gap-4 md:grid-cols-3">
                    {alternatives.map((alt, i) => (
                      <RouteCard
                        key={alt.route_id ?? i}
                        alt={alt}
                        isScoring={isScoring}
                        index={i}
                      />
                    ))}
                  </div>

                  {/* Assess Risk button */}
                  <div className="pt-2 border-t border-theme">
                    <AnimatePresence mode="wait">
                      {isScored ? (
                        <motion.div
                          key="done"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center justify-center gap-2 py-3 text-green-400 font-bold text-sm"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          Full risk assessment complete — routes updated above
                        </motion.div>
                      ) : (
                        <motion.button
                          key="assess"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={handleAssessRisk}
                          disabled={isScoring}
                          className={cn(
                            'w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-bold text-sm transition-all cursor-pointer',
                            isScoring
                              ? 'bg-accent/10 text-accent border border-accent/30 cursor-not-allowed'
                              : 'bg-accent hover:bg-accent/80 text-white shadow-lg shadow-accent/20'
                          )}
                        >
                          {isScoring ? (
                            <>
                              <LoadingSpinner size="sm" color="bg-accent" />
                              <span>Analyzing weather &amp; traffic across all routes</span>
                            </>
                          ) : (
                            <>
                              <CloudRain className="w-5 h-5" />
                              Assess Risk &amp; Weather
                            </>
                          )}
                        </motion.button>
                      )}
                    </AnimatePresence>
                    {!isScored && !isScoring && (
                      <p className="text-center text-theme-secondary text-xs mt-2">
                        Routes shown above use traffic data only. Click to add live weather scoring.
                      </p>
                    )}
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
