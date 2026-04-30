import { motion } from 'framer-motion';

const CX = 60, CY = 60, R = 44;
const ARC_START = Math.PI;           // 180° — left
const ARC_SWEEP = Math.PI;           // 180° sweep — semicircle

function polarToXY(cx, cy, r, angle) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToXY(cx, cy, r, startAngle);
  const end   = polarToXY(cx, cy, r, endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

const LEVEL_COLOR = { low: '#22c55e', medium: '#facc15', high: '#f97316', critical: '#ef4444' };

export default function RiskGauge({ score = 0, level = 'low' }) {
  const color = LEVEL_COLOR[level] || '#94a3b8';
  const fraction = Math.min(score / 100, 1);
  const endAngle = ARC_START + fraction * ARC_SWEEP;
  const trackPath = describeArc(CX, CY, R, ARC_START, ARC_START + ARC_SWEEP);
  const fillPath  = describeArc(CX, CY, R, ARC_START, endAngle);
  const arcLen = Math.PI * R; // half circumference

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="72" viewBox="0 0 120 72">
        {/* Track */}
        <path d={trackPath} fill="none" stroke="var(--bg-tertiary)" strokeWidth="10" strokeLinecap="round" />
        {/* Animated fill */}
        <motion.path
          d={fillPath}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color}80)` }}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: fraction }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        {/* Score */}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="18" fontWeight="800" fill={color}>{Math.round(score)}</text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--text-secondary)" letterSpacing="1">{level.toUpperCase()}</text>
      </svg>
    </div>
  );
}
