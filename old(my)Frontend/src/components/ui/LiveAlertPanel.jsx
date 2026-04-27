import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, WifiOff } from 'lucide-react';
import { useAlertStore } from '../../stores/alertStore';

const LiveAlertPanel = memo(function LiveAlertPanel() {
  const { alerts, dismissAlert, wsConnected } = useAlertStore();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-[400px] max-w-[calc(100vw-48px)]">
      {!wsConnected && (
        <div className="bg-theme-secondary/90 border border-danger/30 text-danger p-3 rounded-xl flex items-center gap-3 backdrop-blur-xl shadow-lg">
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
            className={`bg-theme-secondary/95 backdrop-blur-md rounded-xl p-4 shadow-xl border-l-4 border-theme ${
              alert.level === 'high' ? 'border-l-danger bg-danger/5' : 'border-l-warning bg-warning/5'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${alert.level === 'high' ? 'text-danger' : 'text-warning'}`} />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-theme-primary">
                  Risk Alert: Shipment {alert.shipment_id.slice(-6)}
                </h4>
                <p className="text-xs text-theme-secondary mt-1">{alert.message}</p>
              </div>
              <button 
                onClick={() => dismissAlert(alert.id)}
                className="text-theme-secondary hover:text-theme-primary transition-colors p-1"
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
