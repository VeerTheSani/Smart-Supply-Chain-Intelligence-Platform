import { memo, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, X, Timer } from 'lucide-react';
import { useCountdownStore } from '../../stores/countdownStore';
import apiClient from '../../api/apiClient';
import toast from 'react-hot-toast';

/**
 * CountdownBar — Shows auto-reroute countdown with cancel button.
 * Appears when the backend starts a countdown for HIGH/CRITICAL risk shipments.
 * Uses local interval for smooth second-by-second updates between WS ticks.
 */
const CountdownBar = memo(function CountdownBar({ shipmentId }) {
  const countdown = useCountdownStore((s) => s.countdowns[shipmentId]);
  const updateCountdown = useCountdownStore((s) => s.updateCountdown);
  const cancelCountdown = useCountdownStore((s) => s.cancelCountdown);
  const [cancelling, setCancelling] = useState(false);
  const intervalRef = useRef(null);

  // Local tick every second for smooth countdown display
  useEffect(() => {
    if (!countdown || countdown.status !== 'active') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      const current = useCountdownStore.getState().countdowns[shipmentId];
      if (!current || current.seconds_remaining <= 1) {
        clearInterval(intervalRef.current);
        return;
      }
      updateCountdown(shipmentId, current.seconds_remaining - 1);
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [shipmentId, countdown?.status, updateCountdown]);

  if (!countdown) return null;

  const { seconds_remaining, seconds_total, shipment_name } = countdown;
  const progress = ((seconds_total - seconds_remaining) / seconds_total) * 100;
  const isUrgent = seconds_remaining <= 30;

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await apiClient.post(`/api/countdown/${shipmentId}/cancel`);
      cancelCountdown(shipmentId);
      toast.success('Auto-reroute cancelled');
    } catch (err) {
      toast.error('Failed to cancel countdown');
    } finally {
      setCancelling(false);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
        animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.3 }}
        className={`rounded-2xl overflow-hidden border ${
          isUrgent
            ? 'bg-red-500/5 border-red-500/30'
            : 'bg-amber-500/5 border-amber-500/20'
        }`}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${isUrgent ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>
                <Shield className={`w-4 h-4 ${isUrgent ? 'text-red-400 animate-pulse' : 'text-amber-400'}`} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-theme-primary">
                  Auto-Reroute Countdown
                </h4>
                <p className="text-[11px] text-theme-secondary">
                  {shipment_name || `Shipment ${shipmentId.slice(-6)}`} — rerouting in {formatTime(seconds_remaining)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Countdown display */}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm font-black ${
                isUrgent ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
              }`}>
                <Timer className="w-3.5 h-3.5" />
                {formatTime(seconds_remaining)}
              </div>

              {/* Cancel button */}
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold 
                           bg-theme-tertiary hover:bg-danger/15 text-theme-secondary hover:text-danger
                           border border-theme hover:border-danger/30 
                           transition-all disabled:opacity-50 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                {cancelling ? 'Cancelling...' : 'Cancel'}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full bg-theme-tertiary rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${isUrgent ? 'bg-red-500' : 'bg-amber-500'}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'linear' }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

export default CountdownBar;
