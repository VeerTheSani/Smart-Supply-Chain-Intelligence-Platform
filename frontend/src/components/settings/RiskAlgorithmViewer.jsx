import { motion } from 'framer-motion';
import { Cpu } from 'lucide-react';

const WEIGHTS = [
  { label: 'Weather',     pct: 35, color: '#60a5fa', desc: 'Real-time Open-Meteo weather along route waypoints' },
  { label: 'Events',      pct: 25, color: '#a78bfa', desc: 'Gemini AI event detection + TomTom incidents'       },
  { label: 'Traffic',     pct: 20, color: '#f97316', desc: 'Mappls live traffic congestion ratio'                },
  { label: 'Time Buffer', pct: 15, color: '#34d399', desc: 'ETA buffer relative to scheduled departure'         },
  { label: 'Gemini AI Risk', pct:  5, color: '#f472b6', desc: 'Gemini AI historical pattern analysis'              },
];

export default function RiskAlgorithmViewer() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2 uppercase tracking-wider">
          <Cpu className="w-4 h-4 text-accent" /> Risk Algorithm Weights
        </h3>
        <span className="text-[10px] text-theme-secondary border border-theme px-2 py-0.5 rounded-full">Read-only</span>
      </div>
      <div className="card-standard space-y-4">
        {WEIGHTS.map((w, i) => (
          <div key={w.label} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-theme-primary">{w.label}</span>
              <span className="text-xs font-black tabular-nums" style={{ color: w.color }}>{w.pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-theme-tertiary overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: w.color, boxShadow: `0 0 8px ${w.color}60` }}
                initial={{ width: 0 }}
                animate={{ width: `${w.pct}%` }}
                transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
              />
            </div>
            <p className="text-[10px] text-theme-secondary opacity-70">{w.desc}</p>
          </div>
        ))}
        <div className="pt-2 border-t border-theme flex justify-between text-xs">
          <span className="text-theme-secondary">Total Weight</span>
          <span className="font-black text-success">100%</span>
        </div>
      </div>
    </div>
  );
}
