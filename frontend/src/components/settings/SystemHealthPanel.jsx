import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Server, Wifi, Database, Clock, Activity } from 'lucide-react';
import { useDashboard } from '../../hooks/useDashboard';
import { useAlertStore } from '../../stores/alertStore';
import { fetchSystemStatus } from '../../api/systemApi';

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

function Tile({ icon: Icon, label, value, sub, color = 'text-accent', delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="card-standard flex items-start gap-3"
    >
      <div className="p-2.5 rounded-xl bg-theme-tertiary shrink-0">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-theme-secondary mb-0.5">{label}</p>
        <p className="text-xl font-black text-theme-primary leading-none">{value}</p>
        {sub && <p className="text-[11px] text-theme-secondary mt-1">{sub}</p>}
      </div>
    </motion.div>
  );
}

export default function SystemHealthPanel() {
  const { data: dash } = useDashboard();
  const wsConnected = useAlertStore(s => s.wsConnected);
  const unread = useAlertStore(s => s.allAlerts.filter(a => !a.read).length);

  const { data: sys } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2 uppercase tracking-wider">
        <Server className="w-4 h-4 text-accent" /> System Health
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <Tile icon={Activity}  label="Total Shipments"    value={dash?.total_shipments ?? '—'}  sub={`${dash?.active_disruptions ?? 0} disrupted`} delay={0.05} />
        <Tile icon={Wifi}      label="WebSocket"          value={wsConnected ? 'LIVE' : 'OFFLINE'} color={wsConnected ? 'text-success' : 'text-danger'} sub={sys ? `${sys.ws_connections} connection${sys.ws_connections !== 1 ? 's' : ''}` : undefined} delay={0.1} />
        <Tile icon={Database}  label="Database"           value={sys?.db_status === 'connected' ? 'Online' : sys?.db_status ?? '…'} color={sys?.db_status === 'connected' ? 'text-success' : 'text-danger'} sub="MongoDB Atlas" delay={0.15} />
        <Tile icon={Clock}     label="Uptime"             value={sys ? formatUptime(sys.uptime_seconds) : '…'} sub={sys?.scheduler_running ? 'Scheduler active' : 'Scheduler stopped'} delay={0.2} />
      </div>
      <div className="card-standard flex items-center justify-between">
        <span className="text-xs text-theme-secondary">Avg Risk Score</span>
        <span className={`text-lg font-black ${(dash?.avg_risk_score ?? 0) > 60 ? 'text-danger' : (dash?.avg_risk_score ?? 0) > 30 ? 'text-warning' : 'text-success'}`}>
          {dash?.avg_risk_score ? dash.avg_risk_score.toFixed(1) : '—'}
        </span>
      </div>
    </div>
  );
}
