import { motion } from 'framer-motion';

const FACTORS = [
  { key: 'weather',     label: 'Weather',     color: '#60a5fa', weight: 35 },
  { key: 'traffic',     label: 'Traffic',     color: '#f97316', weight: 20 },
  { key: 'events',      label: 'Events',      color: '#a78bfa', weight: 25 },
  { key: 'time_buffer', label: 'Time',        color: '#34d399', weight: 15 },
  { key: 'historical',  label: 'Gemini AI Intel', color: '#f472b6', weight:  5 },
];

export default function RiskFactorBars({ breakdown = {} }) {
  return (
    <div className="flex flex-col gap-2 flex-1">
      {FACTORS.map((f, i) => {
        const score = breakdown[f.key]?.score ?? 0;
        const pct = Math.round(score);
        return (
          <div key={f.key} className="flex items-center gap-2">
            <span className="text-[10px] text-theme-secondary w-16 shrink-0">{f.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-theme-tertiary overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: f.color, boxShadow: `0 0 6px ${f.color}60` }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: i * 0.08, ease: 'easeOut' }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums w-7 text-right" style={{ color: f.color }}>{pct}</span>
          </div>
        );
      })}
    </div>
  );
}
