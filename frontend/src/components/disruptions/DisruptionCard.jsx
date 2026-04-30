import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Clock, RefreshCw, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRerouteData, applyReroute } from '../../api/shipmentApi';
import RiskGauge from './RiskGauge';
import RiskFactorBars from './RiskFactorBars';
import ActiveIncidentsList from './ActiveIncidentsList';

const LEVEL_STYLE = {
  critical: {
    border: 'border-l-danger',
    glow: '0 0 24px rgba(239,68,68,0.18)',
    badge: 'bg-danger/15 text-danger border-danger/40',
    pulse: true,
  },
  high: {
    border: 'border-l-orange-500',
    glow: '0 0 16px rgba(249,115,22,0.12)',
    badge: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
    pulse: false,
  },
  medium: {
    border: 'border-l-warning',
    glow: '0 0 12px rgba(250,204,21,0.08)',
    badge: 'bg-warning/15 text-warning border-warning/40',
    pulse: false,
  },
};

export default function DisruptionCard({ shipment, index }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const risk = shipment.last_risk_assessment || shipment.risk?.current || {};
  const level = (risk.risk_level || shipment.risk?.current?.risk_level || 'medium').toLowerCase();
  const score = risk.final_score ?? risk.risk_score ?? 0;
  const breakdown = risk.breakdown || {};
  const incidents = shipment.route_incidents || [];
  const st = LEVEL_STYLE[level] || LEVEL_STYLE.medium;

  const rerouteMutation = useMutation({
    mutationFn: async () => {
      const data = await fetchRerouteData(shipment.id);
      const alts = data?.alternatives || [];
      if (!alts.length) throw new Error('No alternatives available');
      const best = alts[0];
      return applyReroute(shipment.id, {
        geometry_encoded: best.geometry_encoded || best.geometry,
        distance_km: best.distance_km,
        duration_seconds: best.duration_seconds,
        waypoints: best.waypoints || [],
        route_label: best.label || 'Recommended',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
    },
  });

  const etaHours = shipment.eta_hours ? `${Math.round(shipment.eta_hours)}h` : '—';
  const delay = shipment.delay_minutes > 0 ? `+${shipment.delay_minutes}m delay` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className={`bg-theme-secondary rounded-xl border border-theme border-l-4 ${st.border} overflow-hidden`}
      style={{ boxShadow: st.glow }}
    >
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-accent">{shipment.tracking_number}</span>
            {shipment.shipment_name && (
              <span className="text-xs text-theme-secondary">· {shipment.shipment_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {st.pulse && (
              <motion.div
                className="w-2 h-2 rounded-full bg-danger"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${st.badge}`}>
              {level}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-theme-secondary mb-3">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{shipment.origin || shipment.origin_name}</span>
          <span className="opacity-40 shrink-0">→</span>
          <span className="truncate">{shipment.destination || shipment.destination_name}</span>
        </div>

        {/* ETA + delay row */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-theme-secondary">
            <Clock className="w-3 h-3" /> ETA {etaHours}
          </span>
          {delay && (
            <span className="text-danger font-semibold">{delay}</span>
          )}
          {shipment.distance_km && (
            <span className="text-theme-secondary ml-auto">{Math.round(shipment.distance_km)} km</span>
          )}
        </div>
      </div>

      {/* Gauge + Factor bars */}
      <div className="px-4 pb-3 flex gap-4 items-center border-t border-theme/50 pt-3">
        <RiskGauge score={score} level={level} />
        <RiskFactorBars breakdown={breakdown} />
      </div>

      {/* Expandable incidents + action */}
      <div className="border-t border-theme/50">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary/50 transition-colors"
        >
          <span className="font-semibold uppercase tracking-wider">
            {incidents.length > 0 ? `${incidents.length} Incident${incidents.length > 1 ? 's' : ''}` : 'Incidents & Actions'}
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 pb-4 space-y-3"
          >
            <ActiveIncidentsList incidents={incidents} />

            {/* Root cause */}
            {shipment.risk?.current?.reason && (
              <div className="text-[11px] text-theme-secondary bg-theme-tertiary/60 rounded-lg p-2.5 border border-theme/50">
                <span className="font-bold uppercase tracking-wider text-[10px] block mb-1 opacity-70">Root Cause</span>
                {shipment.risk.current.reason}
              </div>
            )}

            {/* Reroute action */}
            {!shipment.auto_reroute_enabled && (
              <button
                onClick={() => rerouteMutation.mutate()}
                disabled={rerouteMutation.isPending || rerouteMutation.isSuccess}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200
                  ${rerouteMutation.isSuccess
                    ? 'bg-success/15 text-success border border-success/30 cursor-default'
                    : 'bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-50'
                  }`}
              >
                {rerouteMutation.isPending ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Finding route…</>
                ) : rerouteMutation.isSuccess ? (
                  <><Zap className="w-3.5 h-3.5" /> Rerouted successfully</>
                ) : rerouteMutation.isError ? (
                  <><RefreshCw className="w-3.5 h-3.5" /> Retry reroute</>
                ) : (
                  <><Zap className="w-3.5 h-3.5" /> Trigger Emergency Reroute</>
                )}
              </button>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
