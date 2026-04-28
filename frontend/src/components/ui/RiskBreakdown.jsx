import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ShieldAlert, Activity, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import GeminiLogo from './GeminiLogo';

const FACTOR_META = {
  weather:     { label: 'Weather',       icon: '🌦️', color: 'from-blue-500 to-cyan-400',   barColor: 'bg-blue-500' },
  traffic:     { label: 'Traffic',       icon: '🚗', color: 'from-orange-500 to-amber-400', barColor: 'bg-orange-500' },
  events:      { label: 'Events',        icon: '⚡', color: 'from-purple-500 to-violet-400', barColor: 'bg-purple-500' },
  time_buffer: { label: 'Time Buffer',   icon: '⏱️', color: 'from-teal-500 to-emerald-400', barColor: 'bg-teal-500' },
  historical:  { label: 'Gemini AI Intel', icon: null,  color: 'from-violet-500 to-purple-400', barColor: 'bg-violet-500' },
};

const RISK_BADGE = {
  low:      { label: 'LOW',      bg: 'bg-green-500/15',   text: 'text-green-400', border: 'border-green-500/30' },
  medium:   { label: 'MEDIUM',   bg: 'bg-yellow-500/15',  text: 'text-yellow-400', border: 'border-yellow-500/30' },
  high:     { label: 'HIGH',     bg: 'bg-red-500/15',     text: 'text-red-400',   border: 'border-red-500/30' },
  critical: { label: 'CRITICAL', bg: 'bg-red-600/20',     text: 'text-red-500',   border: 'border-red-500/40' },
};

/**
 * RiskBreakdown — Expandable risk factor visualization.
 * Reads from the risk API response's breakdown field.
 * Shows score × weight = contribution per factor, with progress bars.
 *
 * @param {Object} riskAssessment - The last_risk_assessment from backend
 */
const RiskBreakdown = memo(function RiskBreakdown({ riskAssessment }) {
  const [expanded, setExpanded] = useState(false);

  if (!riskAssessment || !riskAssessment.breakdown) return null;

  const { final_score, risk_level, primary_driver, breakdown } = riskAssessment;
  const level = (risk_level || 'low').toLowerCase();
  const badge = RISK_BADGE[level] || RISK_BADGE.low;

  // Sort factors by contribution (highest first)
  const factors = Object.entries(breakdown)
    .map(([key, data]) => ({
      key,
      ...data,
      meta: FACTOR_META[key] || { label: key, icon: '📌', color: 'from-gray-500 to-gray-400', barColor: 'bg-gray-500' },
      contribution: data.contribution ?? (data.score * data.weight),
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const maxContribution = Math.max(...factors.map(f => f.contribution), 1);

  return (
    <div className="bg-theme-secondary rounded-2xl border border-theme overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-theme-tertiary/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-theme-tertiary rounded-xl">
            <Activity className="w-4 h-4 text-accent" />
          </div>
          <div className="text-left">
            <h3 className="text-xs font-black text-theme-primary uppercase tracking-[0.1em]">Risk Factor Decomposition</h3>
            <p className="text-[10px] text-theme-secondary mt-1 font-bold">
              Aggregated Index: <span className="text-accent font-black">{(final_score || 0).toFixed(1)}</span>
              <span className="mx-2 opacity-30">|</span>
              Primary Driver: <span className="text-theme-primary uppercase">{primary_driver || '—'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Risk level badge */}
          <span className={cn(
            'px-3 py-1 rounded-full text-[10px] font-black tracking-widest border',
            badge.bg, badge.text, badge.border,
            level === 'critical' && 'animate-pulse'
          )}>
            {badge.label}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-theme-secondary" /> : <ChevronDown className="w-4 h-4 text-theme-secondary" />}
        </div>
      </button>

      {/* Expandable breakdown */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-theme pt-4">
              {factors.map((factor, i) => {
                const isPrimary = factor.key === primary_driver;
                const barWidth = Math.max(4, (factor.contribution / maxContribution) * 100);

                return (
                  <motion.div
                    key={factor.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      'p-4 rounded-2xl border transition-all duration-300',
                      isPrimary
                        ? 'bg-accent/5 border-accent/30 shadow-lg shadow-accent/5'
                        : 'glass-panel border-theme bg-theme-tertiary/10'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base flex items-center">
                          {factor.key === 'historical'
                            ? <GeminiLogo size={18} />
                            : factor.meta.icon}
                        </span>
                        <span className="text-[11px] font-black text-theme-primary uppercase tracking-[0.15em]">
                          {factor.meta.label}
                        </span>
                        {isPrimary && (
                          <span className="flex items-center gap-1 text-[9px] font-black text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
                            <Zap className="w-2.5 h-2.5" /> PRIMARY
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        {factor.reason === 'AI Intel is currently analyzing...' ? (
                          <span className="text-xs font-mono font-bold text-violet-400/60 animate-pulse">
                            COMPUTING...
                          </span>
                        ) : (
                          <>
                            <span className="text-xs font-mono text-theme-secondary">
                              {factor.score} × {factor.weight} = 
                            </span>
                            <span className="text-xs font-mono font-bold text-theme-primary ml-1">
                              {factor.contribution.toFixed(1)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 w-full bg-theme-tertiary rounded-full overflow-hidden">
                      {factor.reason === 'AI Intel is currently analyzing...' ? (
                         <div className="h-full w-full bg-violet-500/20 overflow-hidden relative">
                           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-violet-500/40 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                         </div>
                      ) : (
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ duration: 0.5, delay: i * 0.05, ease: 'easeOut' }}
                          className={cn('h-full rounded-full', factor.meta.barColor)}
                        />
                      )}
                    </div>

                    {/* Reason */}
                    {factor.reason === 'AI Intel is currently analyzing...' ? (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="w-3.5 h-3.5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin shrink-0" />
                        <p className="text-[11px] text-violet-400/80 animate-pulse font-medium">{factor.reason}</p>
                      </div>
                    ) : factor.reason === 'unavailable' || (typeof factor.reason === 'string' && factor.reason.includes('API error')) ? (
                      <div className="mt-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-2.5 animate-in fade-in slide-in-from-top-1">
                        <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5 animate-pulse" />
                        <div>
                          <p className="text-[10px] font-black text-red-500 uppercase tracking-widest leading-none mb-1.5">API Quota Exhausted</p>
                          <p className="text-[10px] text-theme-secondary leading-tight">Advanced AI Intel is unavailable due to strict Google Cloud quotas. Fallback data active. It will naturally unlock upon reset.</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-theme-secondary mt-1.5 leading-relaxed">
                        {factor.reason || 'No data'}
                      </p>
                    )}

                    {/* Gemini Bypass Panel (Historical / AI Intel only) */}
                    {factor.key === 'historical' && factor.safe_waypoint && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                        className="mt-2 pt-2 border-t border-violet-500/20 border-dashed overflow-hidden"
                      >
                        <p className="text-[9px] font-black text-violet-400 uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1">
                          🛣️ Gemini Bypass Recommended
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[10px] font-black">
                            Via {factor.safe_waypoint}
                          </span>
                          {factor.incident_location && (
                            <span className="text-[10px] text-theme-secondary">
                              · incident near <span className="text-theme-primary font-semibold">{factor.incident_location}</span>
                            </span>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {/* Point Results Visualizer (Weather Only) */}
                    {factor.key === 'weather' && factor.point_results && factor.point_results.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-theme border-dashed">
                        <h4 className="text-[10px] font-bold text-theme-secondary uppercase tracking-wider mb-2">Advance Weather Prediction Trajectory</h4>
                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                          {factor.point_results.map((pt, idx) => (
                            <div key={idx} className="shrink-0 w-24 bg-theme-secondary rounded-lg p-2 flex flex-col items-center justify-center text-center shadow border border-theme">
                               <p className="text-[9px] font-black text-theme-primary opacity-80 uppercase">{pt.arrival_time}</p>
                               <span className={cn("text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded-full border", 
                                  pt.score > 70 ? "text-red-400 bg-red-500/10 border-red-500/20" : 
                                  pt.score > 40 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" : 
                                  "text-green-400 bg-green-500/10 border-green-500/20"
                               )}>
                                  {pt.score > 70 ? 'SEVERE' : pt.score > 40 ? 'WARN' : 'CLEAR'}
                               </span>
                               <p className="text-[8px] text-theme-secondary mt-1 leading-tight line-clamp-2" title={pt.reason}>{pt.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {/* Total score bar */}
              <div className="pt-2 border-t border-theme">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-theme-secondary uppercase tracking-wider">Composite Score</span>
                  <span className={cn('text-lg font-black font-mono', badge.text)}>
                    {(final_score || 0).toFixed(1)}
                  </span>
                </div>
                <div className="h-2 w-full bg-theme-tertiary rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, final_score || 0)}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className={cn(
                      'h-full rounded-full',
                      level === 'low' ? 'bg-green-500' :
                      level === 'medium' ? 'bg-yellow-500' :
                      'bg-red-500'
                    )}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default RiskBreakdown;
