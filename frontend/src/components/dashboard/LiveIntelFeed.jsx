import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useAlertStore } from '../../stores/alertStore';

const SEV_STYLE = {
  critical: { bar: 'bg-danger',  badge: 'bg-danger/15 text-danger border-danger/30',   dot: 'bg-danger'  },
  high:     { bar: 'bg-orange-500', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30', dot: 'bg-orange-500' },
  medium:   { bar: 'bg-warning', badge: 'bg-warning/15 text-warning border-warning/30', dot: 'bg-warning' },
  low:      { bar: 'bg-success', badge: 'bg-success/15 text-success border-success/30', dot: 'bg-success' },
};

function relTime(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)  return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

export default function LiveIntelFeed({ recentAlerts = [] }) {
  const wsConnected = useAlertStore(s => s.wsConnected);
  const sty = (sev) => SEV_STYLE[sev] || SEV_STYLE.medium;

  return (
    <div className="card-standard flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2 uppercase tracking-wider">
          <Zap className="w-4 h-4 text-accent" /> Live Intel Feed
        </h3>
        <div className="flex items-center gap-1.5">
          <motion.div
            className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-success' : 'bg-danger'}`}
            animate={wsConnected ? { scale: [1, 1.4, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${wsConnected ? 'text-success' : 'text-danger'}`}>
            {wsConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto flex-1" style={{ maxHeight: 240 }}>
        {recentAlerts.length === 0 ? (
          <p className="text-xs text-theme-secondary text-center py-6 opacity-60">No recent alerts</p>
        ) : (
          <AnimatePresence initial={false}>
            {recentAlerts.slice(0, 8).map((alert, i) => {
              const s = sty(alert.severity || alert.level || 'medium');
              return (
                <motion.div
                  key={alert.id || i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex gap-2.5 p-2.5 rounded-lg bg-theme-tertiary/50 border border-theme hover:border-accent/20 transition-colors"
                >
                  <div className={`w-0.5 rounded-full shrink-0 self-stretch ${s.bar}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-theme-primary truncate flex-1">{alert.title || alert.message}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${s.badge}`}>
                        {(alert.severity || alert.level || 'med').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {alert.shipment_name && (
                        <span className="text-[10px] text-accent font-mono truncate">{alert.shipment_name}</span>
                      )}
                      <span className="text-[10px] text-theme-secondary ml-auto shrink-0">{relTime(alert.timestamp)}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
