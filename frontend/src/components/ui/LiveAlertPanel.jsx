import React, { memo, useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Beaker } from 'lucide-react';
import AlertItem from './AlertItem';
import { useAlertStore } from '../../stores/alertStore';
import { useNotificationPrefsStore } from '../../stores/notificationPrefsStore';
import { playNotificationSound, showDesktopNotification } from '../../lib/notificationUtils';

/**
 * Smart Popup Alert Wrapper
 * - Auto-dismisses based on severity timing from preferences
 * - Pauses timer on mouse hover
 * - Never auto-dismisses CRITICAL alerts (must be manually acknowledged)
 * - Plays sound + desktop notification on first appearance
 */
function PopupAlert({ alert, onDismissPopup, onMarkRead }) {
  const { id, read, popupDismissed, severity } = alert || {};
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef(null);
  const remainingRef = useRef(null);
  const startTimeRef = useRef(null);
  const hasFiredEffectsRef = useRef(false);

  const prefs = useNotificationPrefsStore();
  const dismissSeconds = prefs.getAutoDismissSeconds(severity);

  // Play sound + desktop notification on first mount only
  useEffect(() => {
    if (!id || read || popupDismissed || hasFiredEffectsRef.current) return;
    hasFiredEffectsRef.current = true;

    const sev = (severity || 'medium').toLowerCase();

    if (prefs.soundEnabled) {
      playNotificationSound(sev, prefs.soundVolume);
    }

    if (prefs.desktopEnabled && (sev === 'critical' || sev === 'high')) {
      showDesktopNotification(
        alert.title || 'Supply Chain Alert',
        alert.message || 'New alert detected',
        sev
      );
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss timer with hover pause
  useEffect(() => {
    if (!id || read || popupDismissed) return;

    // Critical alerts never auto-dismiss
    const sev = (severity || 'medium').toLowerCase();
    if (sev === 'critical') return;

    const startTimer = (duration) => {
      clearTimeout(timerRef.current);
      startTimeRef.current = Date.now();
      remainingRef.current = duration;
      timerRef.current = setTimeout(() => {
        onDismissPopup(id);
      }, duration);
    };

    if (!isHovered) {
      const remaining = remainingRef.current || dismissSeconds * 1000;
      startTimer(remaining);
    } else {
      // Paused — calculate remaining
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const elapsed = Date.now() - (startTimeRef.current || Date.now());
        remainingRef.current = Math.max(500, (remainingRef.current || dismissSeconds * 1000) - elapsed);
      }
    }

    return () => clearTimeout(timerRef.current);
  }, [id, read, popupDismissed, isHovered, dismissSeconds, onDismissPopup, severity]);

  if (!alert) return null;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AlertItem
        alert={alert}
        onMarkRead={onMarkRead}
        variant="compact"
      />
    </div>
  );
}

const LiveAlertPanel = memo(function LiveAlertPanel() {
  const { realAlerts, simAlerts, wsConnected, markAlertAsRead, dismissPopup, checkSnoozes } = useAlertStore();
  const toastsEnabled = useNotificationPrefsStore((s) => s.toastsEnabled);
  const mutedTypes = useNotificationPrefsStore((s) => s.mutedTypes);

  // Periodically check for expired snoozes (every 30s)
  useEffect(() => {
    const interval = setInterval(() => {
      checkSnoozes();
    }, 30000);
    return () => clearInterval(interval);
  }, [checkSnoozes]);

  // Filter out muted alert types
  const filteredReal = realAlerts.filter((a) => !mutedTypes.includes(a.type));
  const filteredSim = simAlerts.filter((a) => !mutedTypes.includes(a.type));

  if (!toastsEnabled && wsConnected) return null;

  return (
    <div className="fixed top-3 right-3 sm:top-auto sm:bottom-6 sm:right-6 max-w-[calc(100vw-1.5rem)] sm:max-w-[320px] z-[60] flex flex-col gap-3 pointer-events-none">
      {/* Reconnection Alert */}
      {!wsConnected && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1a1a1a] border border-red-500/30 text-red-400 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl flex items-center gap-2 sm:gap-3 backdrop-blur-xl shadow-lg pointer-events-auto"
        >
          <WifiOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">Reconnecting...</span>
        </motion.div>
      )}

      {/* REAL SYSTEM ALERTS (3 max) */}
      {toastsEnabled && (
        <div className="flex flex-col-reverse gap-3 pointer-events-auto">
          <AnimatePresence mode="popLayout">
            {filteredReal.slice(0, 3).map((alert) => (
              <PopupAlert
                key={alert.id}
                alert={alert}
                onDismissPopup={dismissPopup}
                onMarkRead={markAlertAsRead}
              />
            ))}
          </AnimatePresence>
        </div>
      )}


    </div>
  );
});

export default LiveAlertPanel;
