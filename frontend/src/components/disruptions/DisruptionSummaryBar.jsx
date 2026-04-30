import { motion } from 'framer-motion';

export default function DisruptionSummaryBar({ disrupted }) {
  const critical = disrupted.filter(s => s.risk?.current?.risk_level === 'critical').length;
  const high     = disrupted.filter(s => s.risk?.current?.risk_level === 'high').length;
  const medium   = disrupted.filter(s => s.risk?.current?.risk_level === 'medium').length;

  const chips = [
    { label: 'Critical', count: critical, style: 'bg-danger/15 text-danger border-danger/30' },
    { label: 'High',     count: high,     style: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
    { label: 'Medium',   count: medium,   style: 'bg-warning/15 text-warning border-warning/30' },
    { label: 'Total',    count: disrupted.length, style: 'bg-theme-tertiary text-theme-secondary border-theme' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap gap-3"
    >
      {chips.map((chip, i) => (
        <motion.div
          key={chip.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.07 }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${chip.style}`}
        >
          <span className="uppercase tracking-wider opacity-70">{chip.label}</span>
          <span className="text-sm font-black tabular-nums">{chip.count}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}
