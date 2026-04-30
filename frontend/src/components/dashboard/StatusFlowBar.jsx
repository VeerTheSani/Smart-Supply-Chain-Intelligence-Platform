import { motion } from 'framer-motion';
import { Layers } from 'lucide-react';

const STATUSES = [
  { key: 'in_transit', label: 'In Transit', color: '#4d9fff', bg: 'rgba(77,159,255,0.15)' },
  { key: 'planned',    label: 'Planned',    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  { key: 'rerouting',  label: 'Rerouting',  color: '#facc15', bg: 'rgba(250,204,21,0.15)'  },
  { key: 'delayed',    label: 'Delayed',    color: '#f97316', bg: 'rgba(249,115,22,0.15)'  },
  { key: 'delivered',  label: 'Delivered',  color: '#22c55e', bg: 'rgba(34,197,94,0.15)'   },
];

export default function StatusFlowBar({ statusCounts = {} }) {
  const total = STATUSES.reduce((s, st) => s + (statusCounts[st.key] || 0), 0) || 1;

  return (
    <div className="card-standard flex flex-col gap-4 h-full">
      <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2 uppercase tracking-wider">
        <Layers className="w-4 h-4 text-accent" /> Fleet Status
      </h3>

      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex gap-0.5 bg-theme-tertiary">
        {STATUSES.map((st, i) => {
          const count = statusCounts[st.key] || 0;
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <motion.div
              key={st.key}
              className="h-full rounded-full"
              style={{ background: st.color, width: `${pct}%` }}
              initial={{ scaleX: 0, originX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: 'easeOut' }}
            />
          );
        })}
      </div>

      {/* Legend grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 flex-1">
        {STATUSES.map(st => {
          const count = statusCounts[st.key] || 0;
          const pct = Math.round((count / total) * 100);
          return (
            <div key={st.key} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: st.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-baseline gap-1">
                  <span className="text-xs text-theme-secondary truncate">{st.label}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: st.color }}>{count}</span>
                </div>
                <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: st.bg }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: st.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
