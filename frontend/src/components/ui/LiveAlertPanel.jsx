import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, WifiOff } from 'lucide-react';
import { useAlertStore } from '../../stores/alertStore';

const LiveAlertPanel = memo(function LiveAlertPanel() {
  const { alerts, dismissAlert, wsConnected } = useAlertStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-[400px] max-w-[calc(100vw-48px)]">
      {!wsConnected && (
        <div className="bg-surface-800/90 border border-red-500/30 text-red-400 p-3 rounded-xl flex items-center gap-3 backdrop-blur-xl shadow-lg">
          <WifiOff className="w-5 h-5" />
          <span className="text-sm font-medium">Reconnecting live feeds...</span>
        </div>
      )}
      
      <AnimatePresence>
        {alerts.slice(0, 3).map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`glass rounded-xl p-4 shadow-xl border-l-4 ${
              alert.level === 'high' ? 'border-primary-500 bg-red-950/20' : 'border-yellow-500 bg-yellow-950/20'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${alert.level === 'high' ? 'text-primary-500' : 'text-yellow-400'}`} />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-surface-100">
                  Risk Alert: Shipment {alert.shipment_id.slice(-6)}
                </h4>
                <p className="text-xs text-surface-400 mt-1">{alert.message}</p>
              </div>
              <button 
                onClick={() => dismissAlert(alert.id)}
                className="text-surface-500 hover:text-surface-200 transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});

export default LiveAlertPanel;
