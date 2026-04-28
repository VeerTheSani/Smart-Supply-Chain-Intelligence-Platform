import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Route, Navigation, MapPin, Clock, ShieldAlert, Truck, ExternalLink } from 'lucide-react';
import RiskBreakdown from './RiskBreakdown';
import CascadePanel from './CascadePanel';
import CountdownBar from './CountdownBar';
import apiClient from '../../api/apiClient';
import { useShipmentStore } from '../../stores/shipmentStore';
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

  const allShipments = useShipmentStore(s => s.shipments);
  const upstreamShipment = shipment?.upstream_shipment_id
    ? allShipments.find(s => s.id === shipment.upstream_shipment_id)
    : null;
  // Effective departure: prefer stored field, fall back to upstream's original_eta from store
  const departureDt = shipment?.scheduled_departure
    ? new Date(shipment.scheduled_departure)
    : upstreamShipment?.original_eta
      ? new Date(upstreamShipment.original_eta)
      : null;
  const upstreamName = shipment?.upstream_shipment_name || upstreamShipment?.shipment_name || 'Upstream shipment';

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
                  {departureDt && (
                    <p className="text-[10px] font-mono text-blue-400 mt-1 uppercase tracking-wider font-bold">DEP: {departureDt.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</p>
                  )}
                </div>
              </div>
              {shipment.via_points?.map((vp, i) => (
                <div key={i}>
                  <div className="ml-4 border-l border-dashed border-theme h-10 flex flex-col justify-center gap-1">
                    {vp.stop_duration_minutes > 0 && (
                      <span className="ml-6 text-[10px] font-bold text-orange-500 dark:text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full flex items-center gap-1.5 border border-orange-500/20 shadow-sm shadow-orange-500/5 max-w-fit">
                        <Clock className="w-3 h-3" /> {vp.stop_duration_minutes}m dwell
                      </span>
                    )}
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                      <MapPin className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-theme-secondary uppercase tracking-[0.2em] font-black opacity-50 mb-0.5">Via Node • {vp.type}</p>
                      <p className="text-sm text-theme-primary font-bold truncate tracking-tight">{vp.location_name}</p>
                      {vp.eta_arrival && (
                        <p className="text-[10px] font-mono text-green-400 mt-1 uppercase tracking-wider font-bold">ETA: {new Date(vp.eta_arrival).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="ml-4 border-l border-dashed border-theme h-10" />
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20">
                  <MapPin className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-theme-secondary uppercase tracking-[0.2em] font-black opacity-50 mb-0.5">Target Destination</p>
                  <p className="text-sm text-theme-primary font-bold truncate tracking-tight">{shipment.destination || shipment.destination_name}</p>
                  {departureDt && (
                    <p className="text-[10px] font-mono text-green-400 mt-1 uppercase tracking-wider font-bold">
                      ETA: {new Date(departureDt.getTime() + (parseFloat(shipment.eta_hours) || 0) * 3_600_000)
                        .toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  )}
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
                  {(() => {
                    const own = parseFloat(shipment.eta_hours) || 0;
                    const wait = shipment.scheduled_departure
                      ? Math.max(0, (new Date(shipment.scheduled_departure) - Date.now()) / 3_600_000)
                      : 0;
                    const total = wait + own;
                    if (!total) return '—';
                    const d = Math.floor(total / 24);
                    const remH = Math.floor(total % 24);
                    return d > 0 ? `${d}d ${remH}h` : `${remH}h`;
                  })()}
                </p>
              </div>
            </div>

            {/* Departure timeline — shown only for dependent shipments */}
            {departureDt && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.12em] mb-3">
                  Departure Timeline
                </p>
                <div className="space-y-0">
                  {/* Upstream arrives */}
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] text-theme-secondary font-bold">
                        {upstreamName} arrives
                      </p>
                    </div>
                    <p className="text-[10px] font-mono text-theme-primary">
                      {departureDt.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                  <div className="ml-[3px] w-px h-4 bg-blue-400/30" />

                  {/* This shipment departs */}
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] text-theme-secondary font-bold">This shipment departs</p>
                      <p className="text-[9px] text-theme-secondary opacity-60">
                        Travel: {shipment.eta_hours}h
                      </p>
                    </div>
                    <p className="text-[10px] font-mono text-theme-primary">
                      {departureDt.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                  <div className="ml-[3px] w-px h-4 bg-accent/30" />

                  {/* Estimated arrival */}
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] text-theme-secondary font-bold">Estimated arrival</p>
                      {shipment.is_delayed && (
                        <p className="text-[9px] text-red-400 font-bold">
                          +{(shipment.delay_minutes / 60).toFixed(1)}h cascaded delay
                        </p>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-green-400 font-bold">
                      {new Date(departureDt.getTime() + (parseFloat(shipment.eta_hours) || 0) * 3_600_000)
                        .toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              </div>
            )}

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
