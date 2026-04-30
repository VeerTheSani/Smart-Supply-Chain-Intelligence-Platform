import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';

const SEGMENTS = [
  { key: 'critical', label: 'Critical', color: '#ef4444', glow: 'rgba(239,68,68,0.4)' },
  { key: 'high',     label: 'High',     color: '#f97316', glow: 'rgba(249,115,22,0.3)' },
  { key: 'medium',   label: 'Medium',   color: '#facc15', glow: 'rgba(250,204,21,0.3)' },
  { key: 'low',      label: 'Low',      color: '#22c55e', glow: 'rgba(34,197,94,0.3)'  },
  { key: 'unknown',  label: 'Unknown',  color: '#475569', glow: 'rgba(71,85,105,0.2)'  },
];

const CX = 80, CY = 80, R = 56, STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * R;

export default function RiskDonutChart({ riskCounts = {} }) {
  const [hovered, setHovered] = useState(null);

  const total = SEGMENTS.reduce((s, seg) => s + (riskCounts[seg.key] || 0), 0);

  // Build arc segments
  let offset = 0;
  const arcs = SEGMENTS.map((seg) => {
    const count = riskCounts[seg.key] || 0;
    const fraction = total > 0 ? count / total : 0;
    const dash = fraction * CIRCUMFERENCE;
    const gap = CIRCUMFERENCE - dash;
    const arc = { ...seg, count, fraction, dash, gap, offset };
    offset += dash;
    return arc;
  });

  const hov = hovered ? SEGMENTS.find(s => s.key === hovered) : null;

  return (
    <div className="card-standard flex flex-col gap-4 h-full">
      <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2 uppercase tracking-wider">
        <ShieldAlert className="w-4 h-4 text-accent" /> Risk Distribution
      </h3>

      <div className="flex items-center gap-6 flex-1">
        {/* SVG Donut */}
        <div className="relative shrink-0">
          <svg width="160" height="160" viewBox="0 0 160 160">
            {/* Track ring */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--bg-tertiary)" strokeWidth={STROKE} />

            {arcs.map((arc, i) => (
              <motion.circle
                key={arc.key}
                cx={CX} cy={CY} r={R}
                fill="none"
                stroke={arc.color}
                strokeWidth={hovered === arc.key ? STROKE + 4 : STROKE}
                strokeDasharray={`${arc.dash} ${arc.gap}`}
                strokeDashoffset={-arc.offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${CX} ${CY})`}
                style={{ filter: hovered === arc.key ? `drop-shadow(0 0 6px ${arc.glow})` : 'none', cursor: 'pointer', transition: 'stroke-width 0.2s' }}
                initial={{ strokeDasharray: `0 ${CIRCUMFERENCE}` }}
                animate={{ strokeDasharray: `${arc.dash} ${arc.gap}` }}
                transition={{ duration: 0.9, delay: i * 0.12, ease: 'easeOut' }}
                onMouseEnter={() => setHovered(arc.key)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}

            {/* Center label */}
            <text x={CX} y={CY - 8} textAnchor="middle" fontSize="22" fontWeight="bold" fill={hov ? hov.color : 'var(--text-primary)'}>
              {hov ? hov.count : total}
            </text>
            <text x={CX} y={CY + 10} textAnchor="middle" fontSize="9" fill="var(--text-secondary)" fontWeight="600" letterSpacing="1">
              {hov ? hov.label.toUpperCase() : 'TOTAL'}
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {arcs.map(arc => (
            <div
              key={arc.key}
              className="flex items-center gap-2 cursor-pointer group"
              onMouseEnter={() => setHovered(arc.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-125" style={{ background: arc.color }} />
              <span className="text-xs text-theme-secondary group-hover:text-theme-primary transition-colors truncate capitalize">{arc.label}</span>
              <span className="ml-auto text-xs font-bold tabular-nums" style={{ color: arc.color }}>{arc.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
