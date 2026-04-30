import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, GitBranch, AlertOctagon, Radio } from 'lucide-react';
import { useAlertStore } from '../../stores/alertStore';

function useCountUp(target, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return;
    const steps = 40;
    const inc = target / steps;
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      setVal(Math.min(Math.round(inc * count), target));
      if (count >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target, duration]);
  return val;
}

function InsightTile({ icon: Icon, label, value, color = 'text-accent', delay }) {
  const display = useCountUp(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="card-standard flex items-center gap-3"
    >
      <div className="p-2 rounded-lg bg-theme-tertiary shrink-0">
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-theme-secondary truncate">{label}</p>
        <p className={`text-2xl font-black leading-none mt-0.5 ${color}`}>{display}</p>
      </div>
    </motion.div>
  );
}

export default function PlatformInsightsPanel() {
  const allAlerts = useAlertStore(s => s.allAlerts);

  const reroutes  = allAlerts.filter(a => a.type === 'reroute_executed').length;
  const riskAlerts = allAlerts.filter(a => a.type === 'risk_alert').length;
  const cascades  = allAlerts.filter(a => a.type === 'cascade_alert').length;
  const total     = allAlerts.length;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2 uppercase tracking-wider">
        <BarChart3 className="w-4 h-4 text-accent" /> Platform Insights
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <InsightTile icon={Radio}        label="Reroutes Executed"  value={reroutes}   color="text-accent"   delay={0.05} />
        <InsightTile icon={AlertOctagon} label="Risk Alerts"        value={riskAlerts} color="text-danger"   delay={0.1}  />
        <InsightTile icon={GitBranch}    label="Cascade Events"     value={cascades}   color="text-warning"  delay={0.15} />
        <InsightTile icon={BarChart3}    label="Total Events"       value={total}      color="text-success"  delay={0.2}  />
      </div>
    </div>
  );
}
