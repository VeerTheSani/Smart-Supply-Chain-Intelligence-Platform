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
    initial={{ opacity: 0, x: 40 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 40 }}
    onMouseEnter={() => setIsPaused(true)}
    onMouseLeave={() => setIsPaused(false)}
    onClick={handleAction}
    className="relative group bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-xl p-3 w-[300px] shadow-xl hover:border-slate-500 transition-all cursor-pointer"
  >
    {/* HEADER */}
    {(() => {
      const isGemini = alert.primary_driver === 'historical';
      const bypassMatch = isGemini && alert.message?.match(/bypass via ([^.–—]+)/i);
      const bypassCity  = bypassMatch ? bypassMatch[1].trim() : null;

      return (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] font-semibold uppercase ${
              isGemini ? 'text-violet-400' : alert.badge === 'REAL' ? 'text-red-400' : 'text-blue-400'
            }`}>
              {isGemini ? '🤖 AI ROAD INTEL' : alert.badge === 'REAL' ? 'REAL SYSTEM' : 'SCENARIO LAB'}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(alert.id); }}
              className="text-gray-500 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>

          {/* MAIN CONTENT */}
          <div className="flex items-start gap-2 text-xs text-gray-300">
            <span className={isGemini ? 'text-violet-400 mt-0.5' : 'text-yellow-400 mt-0.5'}>
              {isGemini ? '🤖' : '⚠️'}
            </span>
            <span className="line-clamp-2 leading-relaxed">
              {alert.message || 'Alert detected'}
            </span>
          </div>

          {/* GEMINI BYPASS CHIP */}
          {bypassCity && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-[9px] text-violet-400 font-black uppercase tracking-wider">Bypass:</span>
              <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[10px] font-bold">
                {bypassCity}
              </span>
            </div>
          )}

          {/* STATUS */}
          <div className={`text-[10px] font-semibold mt-2 ${isGemini ? 'text-violet-400' : 'text-green-400'}`}>
            ● {isGemini ? 'GEMINI INTELLIGENCE' : 'STATUS UPDATE'}
          </div>

          {/* FOOTER */}
          <div className="text-[10px] text-gray-500 mt-1">
            {alert.shipment_id?.slice(-6)}
          </div>
        </>
      );
    })()}

  </motion.div>
);
});

const LiveAlertPanel = memo(function LiveAlertPanel() {
  const { realAlerts, simAlerts, dismissRealAlert, dismissSimAlert, wsConnected } = useAlertStore();

  return (
    <div className="fixed bottom-6 right-6 max-w-[320px] z-[60] flex flex-col-reverse gap-3 pointer-events-none">
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
      
      {/* SECTION 1: REAL SYSTEM ALERTS (Production) */}
      <div className="flex flex-col-reverse gap-3 pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {realAlerts.slice(0, 3).map((alert) => (
            <motion.div key={alert.id} layout initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <LiveAlertItem 
                alert={{...alert, badge: "REAL"}}
                onDismiss={dismissRealAlert}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* SECTION 2: SIMULATOR ALERTS (Scenario Lab) */}
      {simAlerts.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
     className="bg-slate-900/80 border border-blue-500/20 rounded-xl p-3 backdrop-blur-lg shadow-lg"
        >
          <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest px-2 py-1 mb-2">
            🧪 SCENARIO LAB
          </div>
          <div className="flex flex-col-reverse gap-2 pointer-events-auto">
            <AnimatePresence mode="popLayout">
              {simAlerts.slice(0, 2).map((alert) => (
                <motion.div key={alert.id} layout initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                  <LiveAlertItem 
                    alert={{...alert, badge: "SIM"}}
                    onDismiss={dismissSimAlert}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </div>
  );
});

export default LiveAlertPanel;
