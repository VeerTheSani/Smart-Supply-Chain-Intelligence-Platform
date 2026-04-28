import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import AlertItem from './AlertItem';
import { useAlertStore } from '../../stores/alertStore';

const LiveAlertPanel = memo(function LiveAlertPanel() {
  const { realAlerts, simAlerts, wsConnected, markAlertAsRead, dismissPopup } = useAlertStore();

  // Small wrapper for popups to auto-dismiss after a timeout (seconds)
  // Note: dismissPopup keeps the alert UNREAD in the main panel.
  function PopupAlert({ alert, seconds = 5 }) {
    const { id, read, popupDismissed } = alert || {};
    React.useEffect(() => {
      if (!id || read || popupDismissed) return;
      const t = setTimeout(() => {
        dismissPopup(id);
      }, seconds * 1000);
      return () => clearTimeout(t);
    }, [id, read, popupDismissed, seconds]);

    return (
      <AlertItem
        key={alert.id}
        alert={alert}
        onMarkRead={markAlertAsRead}
        variant="compact"
      />
    );
  }

  return (
    <div className="fixed bottom-6 right-6 max-w-[320px] z-[60] flex flex-col-reverse gap-3 pointer-events-none">
      {/* Reconnection Alert */}
      {!wsConnected && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1a1a1a] border border-red-500/30 text-red-400 px-4 py-2.5 rounded-xl flex items-center gap-3 backdrop-blur-xl shadow-lg pointer-events-auto"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-widest">Reconnecting...</span>
        </motion.div>
      )}

      {/* REAL SYSTEM ALERTS (3 max) */}
      <div className="flex flex-col-reverse gap-3 pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {realAlerts.slice(0, 3).map((alert) => (
            <PopupAlert key={alert.id} alert={alert} seconds={5} />
          ))}
        </AnimatePresence>
      </div>

      {/* SIMULATOR ALERTS (2 max) */}
      {simAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/80 border border-blue-500/20 rounded-xl p-3 backdrop-blur-lg shadow-lg pointer-events-auto"
        >
          <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest px-2 py-1 mb-2">
            🧪 SCENARIO LAB
          </div>
          <div className="flex flex-col-reverse gap-2">
            <AnimatePresence mode="popLayout">
              {simAlerts.slice(0, 2).map((alert) => (
                <PopupAlert key={alert.id} alert={alert} seconds={5} />
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </div>
  );
});

export default LiveAlertPanel;
