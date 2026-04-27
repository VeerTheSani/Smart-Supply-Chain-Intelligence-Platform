import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Route, Navigation, MapPin, Clock, ShieldAlert, Truck, ExternalLink } from 'lucide-react';
import RiskBreakdown from './RiskBreakdown';
import CascadePanel from './CascadePanel';
import CountdownBar from './CountdownBar';
import apiClient from '../../api/apiClient';
import { cn } from '../../lib/utils';

/**
 * ShipmentDetailPanel — slide-in panel that shows shipment intelligence:
 * 1. Shipment metadata (origin/dest, status, tracking)
 * 2. CountdownBar (if auto-reroute countdown is active)
 * 3. RiskBreakdown (expandable risk factor analysis)
 * 4. CascadePanel (expandable dependency graph)
 */
const ShipmentDetailPanel = memo(function ShipmentDetailPanel({ shipment, onClose, onReroute }) {
  const [riskData, setRiskData] = useState(null);
  const [loadingRisk, setLoadingRisk] = useState(false);

  // Fetch full risk assessment from backend when panel opens
  useEffect(() => {
    if (!shipment?.id) return;

    let cancelled = false;
    setLoadingRisk(true);

    apiClient
      .get(`/api/shipments/${shipment.id}`)
      .then((res) => {
        if (!cancelled) {
          // The full shipment response includes last_risk_assessment with breakdown
          const assessment = res.data?.last_risk_assessment || res.data?.risk?.assessment;
          setRiskData(assessment);
        }
      })
      .catch(() => {
        // Fallback: use in-memory data if API call fails
        if (!cancelled) setRiskData(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingRisk(false);
      });

    return () => { cancelled = true; };
  }, [shipment?.id]);

  if (!shipment) return null;

  const riskLevel = shipment.risk?.current?.risk_level || 'low';
  const riskScore = shipment.risk?.current?.risk_score || 0;
  const isCritical = riskLevel === 'high' || riskLevel === 'critical';
  const isWarning = riskLevel === 'medium';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-theme-primary/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Slide-in Panel */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="relative w-full max-w-lg bg-theme-secondary border-l border-theme shadow-2xl overflow-y-auto z-10 scrollbar-hide"
        >
          {/* Header */}
          <div className="sticky top-0 z-20 bg-theme-secondary/95 backdrop-blur-md border-b border-theme">
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-3 rounded-2xl border shadow-inner transition-all',
                  isCritical ? 'bg-red-500/10 border-red-500/30 shadow-red-500/10' :
                  isWarning ? 'bg-yellow-500/10 border-yellow-500/30 shadow-yellow-500/10' :
                  'bg-green-500/10 border-green-500/30 shadow-green-500/10'
                )}>
                  <Truck className={cn(
                    'w-6 h-6',
                    isCritical ? 'text-red-400' :
                    isWarning ? 'text-yellow-400' :
                    'text-green-400'
                  )} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-theme-primary tracking-tight">
                    Shipment Intelligence
                  </h2>
                  <p className="text-[10px] text-theme-secondary font-black uppercase tracking-[0.2em] opacity-60">
                    Systemic Core ID: {shipment.tracking_number}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Countdown Bar — appears when auto-reroute is counting down */}
            <CountdownBar shipmentId={shipment.id} />

            {/* Route info card */}
            <div className="glass-panel rounded-2xl border border-theme p-5 space-y-4 bg-theme-tertiary/20 backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/20">
                  <MapPin className="w-4 h-4 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-theme-secondary uppercase tracking-[0.2em] font-black opacity-50 mb-0.5">Origin Node</p>
                  <p className="text-sm text-theme-primary font-bold truncate tracking-tight">{shipment.origin || shipment.origin_name}</p>
                </div>
              </div>
              <div className="ml-4 border-l border-dashed border-theme h-6" />
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20">
                  <MapPin className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-theme-secondary uppercase tracking-[0.2em] font-black opacity-50 mb-0.5">Target Destination</p>
                  <p className="text-sm text-theme-primary font-bold truncate tracking-tight">{shipment.destination || shipment.destination_name}</p>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-panel rounded-2xl border border-theme p-4 text-center bg-theme-tertiary/10">
                <p className="text-[9px] text-theme-secondary uppercase tracking-[0.15em] font-black opacity-50">Status</p>
                <p className="text-[11px] font-black text-theme-primary mt-2 uppercase tracking-widest">{shipment.status}</p>
              </div>
              <div className="glass-panel rounded-2xl border border-theme p-4 text-center bg-theme-tertiary/10">
                <p className="text-[9px] text-theme-secondary uppercase tracking-[0.15em] font-black opacity-50">Risk</p>
                <p className={cn(
                  'text-[11px] font-black mt-2 uppercase tracking-widest',
                  isCritical ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-green-400'
                )}>
                  {riskScore.toFixed(0)} • {riskLevel}
                </p>
              </div>
              <div className="glass-panel rounded-2xl border border-theme p-4 text-center bg-theme-tertiary/10">
                <p className="text-[9px] text-theme-secondary uppercase tracking-[0.15em] font-black opacity-50">ETA</p>
                <p className="text-[11px] font-black text-theme-primary mt-2 uppercase tracking-widest">
                  {shipment.eta_hours ? `${shipment.eta_hours}h` : '—'}
                </p>
              </div>
            </div>

            {/* Risk reason alert */}
            {shipment.risk?.current?.reason && (isCritical || isWarning) && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'p-3 rounded-xl border flex items-start gap-3',
                  isCritical ? 'bg-red-500/5 border-red-500/20' : 'bg-yellow-500/5 border-yellow-500/20'
                )}
              >
                <ShieldAlert className={cn(
                  'w-4 h-4 shrink-0 mt-0.5',
                  isCritical ? 'text-red-400' : 'text-yellow-400'
                )} />
                <p className="text-xs text-theme-primary leading-relaxed">
                  {shipment.risk.current.reason}
                </p>
              </motion.div>
            )}

            {/* Risk Breakdown — expandable */}
            {loadingRisk ? (
              <div className="bg-theme-secondary rounded-2xl border border-theme p-6 flex items-center justify-center gap-3">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-theme-secondary">Loading risk analysis...</span>
              </div>
            ) : riskData ? (
              <RiskBreakdown riskAssessment={riskData} />
            ) : null}

            {/* Cascade Panel — expandable */}
            <CascadePanel shipmentId={shipment.id} />

            {/* Action buttons */}
            {(isCritical || isWarning) && (
              <div className="pt-4 border-t border-theme">
                <button
                  onClick={() => {
                    onReroute?.(shipment.id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-accent hover:bg-accent/90 text-white rounded-2xl text-[13px] font-black shadow-xl shadow-accent/20 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer uppercase tracking-[0.1em] group"
                >
                  <Navigation className="w-5 h-5 transition-transform group-hover:rotate-12" />
                  Initiate Reroute Options
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
});

export default ShipmentDetailPanel;
