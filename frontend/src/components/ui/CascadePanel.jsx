import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, ChevronDown, ChevronUp, AlertTriangle, Clock, Package } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { cn } from '../../lib/utils';

const STATUS_STYLE = {
  planned:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  in_transit: 'bg-green-500/10 text-green-400 border-green-500/20',
  rerouting:  'bg-purple-500/10 text-purple-400 border-purple-500/20',
  delivered:  'bg-slate-500/10 text-slate-400 border-slate-500/20',
  delayed:    'bg-red-500/10 text-red-400 border-red-500/20',
};

/**
 * CascadePanel — Shows downstream dependency graph for a shipment.
 * Fetches from GET /api/shipments/{id}/cascade
 */
const CascadePanel = memo(function CascadePanel({ shipmentId }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!expanded || !shipmentId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .get(`/api/shipments/${shipmentId}/cascade`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.detail || 'Failed to load cascade data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [expanded, shipmentId]);

  if (!shipmentId) return null;

  const hasDependencies = data?.dependent_shipments?.length > 0;

  return (
    <div className="bg-theme-secondary rounded-2xl border border-theme overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-theme-tertiary/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-theme-tertiary rounded-xl">
            <Network className="w-4 h-4 text-accent" />
          </div>
          <div className="text-left">
            <h3 className="text-xs font-black text-theme-primary uppercase tracking-[0.1em]">Cascade Impact Vector</h3>
            <p className="text-[10px] text-theme-secondary mt-1 font-bold">
              Downstream dependency mapping & risk exposure
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-theme-secondary" /> : <ChevronDown className="w-4 h-4 text-theme-secondary" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-theme pt-4">
              {loading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-theme-secondary font-medium">Mapping dependency graph...</span>
                </div>
              ) : error ? (
                <div className="py-4 text-center text-sm text-danger">{error}</div>
              ) : !hasDependencies ? (
                <div className="py-6 text-center">
                  <Package className="w-8 h-8 text-theme-secondary opacity-30 mx-auto mb-2" />
                  <p className="text-sm text-theme-secondary">No downstream dependencies found</p>
                  <p className="text-xs text-theme-secondary opacity-60 mt-1">This shipment operates independently</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Impact summary */}
                  <div className="glass-panel border-accent/30 rounded-2xl p-4 flex items-start gap-4 bg-accent/5">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center border border-accent/20">
                      <AlertTriangle className="w-5 h-5 text-accent animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-theme-primary leading-relaxed font-bold">
                        Network impacts <span className="text-accent">{data.dependent_shipments.length} Nodes</span> with{' '}
                        <span className="text-accent">{data.total_delay_exposure_hours}h Exposure</span>
                      </p>
                      <p className="text-[10px] text-theme-secondary mt-1 uppercase tracking-wider opacity-60 font-bold">Inferred systemic delay probability: High</p>
                    </div>
                  </div>

                  {/* Dependency list */}
                  {data.dependent_shipments.map((dep, i) => {
                    const statusStyle = STATUS_STYLE[dep.status] || STATUS_STYLE.planned;

                    return (
                      <motion.div
                        key={dep.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="glass-panel rounded-2xl p-4 border-theme flex items-center justify-between gap-4 bg-theme-tertiary/10 hover:border-accent/30 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Depth indicator */}
                          <div className="flex shrink-0">
                            {Array.from({ length: dep.depth || 1 }).map((_, d) => (
                              <div key={d} className="w-1.5 h-6 bg-accent/20 rounded-full mr-0.5" />
                            ))}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-theme-primary truncate">
                              {dep.shipment_name}
                            </p>
                            <p className="text-[10px] text-theme-secondary font-mono mt-0.5">
                              ID: {dep.id.slice(-8)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Delay exposure */}
                          <div className="flex items-center gap-1 text-warning bg-warning/10 px-2 py-1 rounded-lg border border-warning/20">
                            <Clock className="w-3 h-3" />
                            <span className="text-[10px] font-bold">{dep.delay_exposure_hours}h</span>
                          </div>

                          {/* Status badge */}
                          <span className={cn(
                            'px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border',
                            statusStyle
                          )}>
                            {dep.status}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Total bar */}
                  <div className="pt-2 border-t border-theme flex items-center justify-between">
                    <span className="text-xs font-bold text-theme-secondary uppercase tracking-wider">Total Delay Exposure</span>
                    <span className="text-lg font-black text-warning font-mono">
                      {data.total_delay_exposure_hours}h
                    </span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default CascadePanel;
