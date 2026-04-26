import { memo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Clock, MapPin, Truck, ExternalLink } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

const severityConfig = {
  critical: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  high: 'text-danger bg-danger/10 border-danger/20',
  medium: 'text-warning bg-warning/10 border-warning/20',
  low: 'text-info bg-info/10 border-info/20'
};

const NotificationItem = memo(function NotificationItem({ notification, onRead }) {
  const { setInspectingShipmentId } = useUIStore();
  const isUnread = !notification.read;
  const severityStyle = severityConfig[notification.severity] || severityConfig.medium;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 border-b border-theme/50 hover:bg-theme-tertiary/50 transition-colors ${isUnread ? 'bg-theme-tertiary/20' : 'opacity-70 hover:opacity-100'
        }`}
      onClick={() => isUnread && onRead(notification._id)}
    >
      <div className="flex gap-3">
        {/* Icon Badge */}
        <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${severityStyle}`}>
          {notification.action_taken === 'rerouted' ? (
            <Truck className="w-4 h-4" />
          ) : notification.action_taken === 'countdown_started' ? (
            <Clock className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-1">
          <div className="flex justify-between items-start gap-2">
            <h4 className={`text-sm font-semibold ${isUnread ? 'text-theme-primary' : 'text-theme-secondary'}`}>
              {notification.title}
            </h4>
            <span className="text-xs text-theme-secondary whitespace-nowrap shrink-0 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <p className="text-[13px] text-theme-secondary line-clamp-3 leading-relaxed">
            {notification.message}
          </p>

          {notification.impact && notification.impact !== notification.message && (
            <div className="mt-2.5 p-2 rounded-xl bg-accent/5 border border-accent/10 text-[11px] text-theme-secondary flex gap-2">
              <span className="font-black text-accent uppercase tracking-wider shrink-0">Impact:</span>
              <span className="leading-tight">{notification.impact}</span>
            </div>
          )}

          {/* Action Footer */}
          <div className="mt-3 flex items-center justify-between pt-2 border-t border-theme/30">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-lg bg-theme-tertiary border border-theme text-[10px] font-black font-mono text-theme-secondary">
                #{notification.shipment_id?.slice(-6)}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-theme-secondary opacity-60">
                {notification.action_taken?.replace('_', ' ') || 'Alert'}
              </span>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); setInspectingShipmentId(notification.shipment_id); }}
              className="text-[11px] font-black text-accent hover:text-accent-hover flex items-center gap-1 transition-all uppercase tracking-tight group"
            >
              Intelligence <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Unread Indicator */}
        {isUnread && (
          <div className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
        )}
      </div>
    </motion.div>
  );
});

export default NotificationItem;
