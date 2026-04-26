import { memo, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, WifiOff, MapPin, Info } from 'lucide-react';
import { useAlertStore } from '../../stores/alertStore';
import { useUIStore } from '../../stores/uiStore';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '../../lib/utils';
import api from '../../api/apiClient';
import { ENDPOINTS } from '../../config/api';

/**
 * Individual alert item with severity-based auto-dismissal
 * and pause-on-hover behavior.
 */
const LiveAlertItem = memo(function LiveAlertItem({ alert, onDismiss }) {
  const { setInspectingShipmentId } = useUIStore();
  const queryClient = useQueryClient();
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  // Severity-based timing (LOW: 3s, MEDIUM: 5s, HIGH/CRITICAL: 7s)
  const getDuration = (level) => {
    switch (level?.toLowerCase()) {
      case 'low': return 3000;
      case 'medium': return 5000;
      case 'high':
      case 'critical': return 7000;
      default: return 5000;
    }
  };

  useEffect(() => {
    if (!isPaused) {
      timerRef.current = setTimeout(() => {
        onDismiss(alert.id);
      }, getDuration(alert.level));
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [alert.id, alert.level, onDismiss, isPaused]);

  const handleAction = async (e) => {
    e.stopPropagation();
    
    // 1. Open Detail Panel
    setInspectingShipmentId(alert.shipment_id);
    
    // 2. Mark as read (best effort: find matching unread notification)
    try {
      const notifications = queryClient.getQueryData(['notifications']) || [];
      const matching = notifications.find(n => 
        !n.read && n.shipment_id === alert.shipment_id
      );
      if (matching) {
        await api.post(ENDPOINTS.NOTIFICATION_READ(matching._id));
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }

    // 3. Dismiss popup
    onDismiss(alert.id);
  };

  const getSeverityStyles = (level) => {
    switch (level?.toLowerCase()) {
      case 'high':
      case 'critical': return 'border-l-danger text-danger bg-danger/5';
      case 'medium': return 'border-l-warning text-warning bg-warning/5';
      default: return 'border-l-green-500 text-green-500 bg-green-500/5';
    }
  };

  const getImpactColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'high':
      case 'critical': return 'text-danger';
      case 'medium': return 'text-warning';
      default: return 'text-green-400';
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onClick={handleAction}
      className={cn(
        "relative group bg-[#0f172a]/95 backdrop-blur-xl border border-white/5 shadow-2xl rounded-2xl p-4 w-[380px] cursor-pointer hover:border-white/10 transition-all border-l-4",
        getSeverityStyles(alert.level),
        alert.level === 'high' || alert.level === 'critical' ? "shadow-[0_0_20px_rgba(239,68,68,0.15)]" : ""
      )}
    >
      <div className="flex flex-col gap-2">
        {/* Header: Title + Close */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              alert.level === 'high' || alert.level === 'critical' ? "bg-danger/20 text-danger" : "bg-warning/20 text-warning"
            )}>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <span className="text-sm font-black text-white truncate uppercase tracking-tight">
              Shipment {alert.shipment_id?.slice(-6)} • {alert.level}
            </span>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onDismiss(alert.id); }}
            className="text-gray-500 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content: Location • Issue */}
        <div className="flex items-center gap-2 text-[11px] text-gray-400 font-bold">
          <span className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-lg">
            <MapPin className="w-3.5 h-3.5" />
            {alert.location || 'Vadodara'}
          </span>
          <span className="opacity-30">/</span>
          <span className="truncate max-w-[160px] opacity-80">
            {alert.message?.slice(0, 60) || 'Route disruption detected'}
          </span>
        </div>

        {/* Impact Highlight */}
        <div className={cn(
          "text-[11px] font-black flex items-center gap-2 mt-1",
          getImpactColor(alert.level)
        )}>
          <div className={cn(
            "w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_currentColor]",
            alert.level === 'high' || alert.level === 'critical' ? 'bg-danger' : 'bg-warning'
          )} />
          <span className="uppercase tracking-widest">{alert.impact || 'Delays and diversions expected'}</span>
        </div>

        {/* View Details Hint (only on hover) */}
        <div className="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-bold text-white/40">
          <Info className="w-3 h-3" />
          CLICK TO ANALYZE
        </div>
      </div>
    </motion.div>
  );
});

const LiveAlertPanel = memo(function LiveAlertPanel() {
  const { alerts, dismissAlert, wsConnected } = useAlertStore();

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col-reverse gap-3 pointer-events-none">
      {/* Reconnection Alert */}
      {!wsConnected && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1a1a1a] border border-danger/30 text-danger px-4 py-2.5 rounded-xl flex items-center gap-3 backdrop-blur-xl shadow-lg pointer-events-auto"
        >
          <WifiOff className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest">Reconnecting live feeds...</span>
        </motion.div>
      )}
      
      <div className="flex flex-col-reverse gap-3 pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {alerts.slice(0, 3).map((alert) => (
            <LiveAlertItem 
              key={alert.id} 
              alert={alert} 
              onDismiss={dismissAlert} 
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
});

export default LiveAlertPanel;
