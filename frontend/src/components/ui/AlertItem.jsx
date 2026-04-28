import React, { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  MapPin,
  Trash2,
  Truck,
  Link2,
  Server,
  Beaker,
  Star,
  AlarmClock,
  Navigation,
  ShieldAlert,
  Activity,
  Info,
  ChevronRight,
  Wifi,
  X,
  CheckCheck
} from 'lucide-react';
import { cn } from '../../lib/utils';

const AlertItem = memo(function AlertItem({
  alert,
  onDismiss,
  onMarkRead,
  onFlag,
  onSnooze,
  variant = 'compact', // 'compact' for popup, 'full' for panel
}) {
  const navigate = useNavigate();
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

  if (!alert) return null;

  const { id, title, message, severity, timestamp, type, read, flagged, shipment_id } = alert;
  const isSnoozed = alert.snoozedUntil && new Date(alert.snoozedUntil) > new Date();

  // Location Display Logic
  const locationName = alert.last_location || alert.location || alert.current_location?.name;
  const coords = alert.coordinates || (alert.current_location?.lat ? alert.current_location : null);

  const handleViewOnMap = (e) => {
    e.stopPropagation();
    if (shipment_id) {
      navigate(`/shipments?id=${shipment_id}`);
    } else {
      navigate('/shipments');
    }
  };

  const getSeverityConfig = (sev) => {
    switch (sev?.toLowerCase()) {
      case 'critical':
        return { icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', accent: 'text-red-500' };
      case 'high':
        return { icon: ShieldAlert, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20', accent: 'text-orange-500' };
      case 'medium':
        return { icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', accent: 'text-blue-500' };
      default:
        return { icon: Info, color: 'text-slate-400', bg: 'bg-slate-400/5', border: 'border-slate-400/10', accent: 'text-slate-400' };
    }
  };

  const getIconForType = (t) => {
    switch (t?.toLowerCase()) {
      case 'risk_alert':
      case 'high_risk_alert':
      case 'critical_risk': return <AlertTriangle className="w-full h-full" />;
      case 'cascade_alert': return <Link2 className="w-full h-full" />;
      case 'gps_stuck': return <MapPin className="w-full h-full" />;
      case 'api_failure': return <Server className="w-full h-full" />;
      case 'reroute_executed': return <Truck className="w-full h-full" />;
      case 'simulator_scenario': return <Beaker className="w-full h-full" />;
      default: return <AlertCircle className="w-full h-full" />;
    }
  };

  const formatTime = (ts) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffSecs = Math.floor((now - date) / 1000);
      if (diffSecs < 60) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  const config = getSeverityConfig(severity || alert.level);
  const Icon = config.icon;

  // ======== COMPACT (POPUP) VARIANT ========
  if (variant === 'compact') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        onClick={handleViewOnMap}
        className={cn(
          "group relative flex flex-col p-3.5 transition-all duration-200 cursor-pointer border border-theme dark:border-slate-800 rounded-xl",
          read ? "opacity-60 bg-transparent" : "bg-theme-secondary dark:bg-[#1e293b]/40 shadow-lg hover:border-accent/30",
          !read && severity === 'critical' && "border-l-4 border-l-red-500"
        )}
      >
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className={cn("w-6 h-6 p-1 rounded-lg border border-current/10", config.bg, config.color)}>
              {getIconForType(type)}
            </div>
            <span className="text-[9px] font-black text-theme-secondary dark:text-slate-500 uppercase tracking-widest">
              {alert.source === 'REAL_SYSTEM' ? 'LIVE FEED' : 'SIMULATION'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-theme-secondary dark:text-slate-600 uppercase">
              {formatTime(timestamp)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss?.(id); }}
              className="p-1 rounded-md text-theme-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors"
              aria-label="Dismiss alert"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="text-xs font-bold text-theme-primary dark:text-slate-200 line-clamp-2 leading-snug">
          {alert.shipment_name && (
            <span className="text-accent mr-1.5 uppercase tracking-tighter">[{alert.shipment_name}]</span>
          )}
          {message?.replace('another ship', 'shipment')}
        </div>
      </motion.div>
    );
  }

  // ======== FULL (PANEL) VARIANT ========
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "p-4 transition-all cursor-pointer relative bg-theme-secondary border-theme dark:border-slate-800/50",
        read ? "opacity-60" : "opacity-100",
        !read && severity === 'critical' && "bg-red-500/[0.02]",
        isSnoozed && "opacity-40"
      )}
      onClick={() => onMarkRead?.(id)}
    >
      <div className="flex items-start gap-4">
        {/* Severity Icon */}
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 shadow-sm transition-transform group-hover:scale-105",
          config.bg, config.color, config.border
        )}>
          <div className="w-5 h-5">{getIconForType(type)}</div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("text-[10px] font-black uppercase tracking-[0.1em]", config.accent)}>
                  {severity || 'SYSTEM'} LOG
                </span>
                <span className="text-[10px] truncate font-bold text-theme-secondary dark:text-slate-600 uppercase tracking-widest">• {alert.source === 'REAL_SYSTEM' ? 'Live' : 'Simulation'}</span>
              </div>
              <h4 className={cn(
                "text-sm font-bold tracking-tight",
                read ? "text-theme-secondary" : "text-theme-primary"
              )}>
                {alert.shipment_name ? (
                  <div className="flex flex-col">
                    <span className="text-[10px] truncate font-black text-accent dark:text-blue-400 uppercase tracking-widest leading-none mb-1">[{alert.shipment_name}]</span>
                    <span>{title || message?.split('\n')[0] || 'Anomalous Event'}</span>
                  </div>
                ) : (
                  title || message?.split('\n')[0] || 'Anomalous Event'
                )}
              </h4>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-theme-secondary dark:text-slate-500 whitespace-nowrap pt-1">
              <Clock className="w-3 h-3" />
              {formatTime(timestamp)}
            </div>
          </div>

          <p className={cn(
            "text-xs leading-relaxed mb-3",
            read ? "text-theme-secondary" : "text-theme-primary/90"
          )}>
            {message?.replace('another ship', 'shipment')}
          </p>

          {/* Integrated Location Detail */}
          {(type === 'gps_stuck' || locationName || coords) && (
            <div
              onClick={handleViewOnMap}
              className="mb-3 p-3 rounded-xl bg-theme-tertiary dark:bg-slate-900/50 border border-theme dark:border-slate-800/80 shadow-sm group/loc hover:border-accent/40 transition-all"
            >
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-theme-secondary dark:bg-slate-800 flex items-center justify-center text-accent border border-theme dark:border-slate-700">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-theme-secondary dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Current telemetry</span>
                    <span className="text-xs font-bold text-theme-primary dark:text-slate-200">
                      {locationName || (coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'In Transit')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-accent opacity-0 group-hover/loc:opacity-100 transition-all transform translate-x-2 group-hover/loc:translate-x-0">
                  <span className="text-[10px] truncate font-black uppercase tracking-widest">Intercept</span>
                  <Navigation className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 pt-2 border-t border-theme/30">
            <div className="flex items-center gap-4 min-w-0">
              {shipment_id && (
                <span className="text-[10px] truncate font-black font-mono text-theme-secondary/50 uppercase tracking-tighter">
                  Log Ref: #{shipment_id.slice(-6)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 flex-wrap sm:flex-nowrap">
              <button
                onClick={(e) => { e.stopPropagation(); onFlag?.(id); }}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  flagged ? "text-yellow-500 bg-yellow-500/10" : "text-theme-secondary hover:text-yellow-500 hover:bg-yellow-500/5"
                )}
              >
                <Star className={cn("w-4 h-4", flagged && "fill-current")} />
              </button>

              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSnoozeMenu(!showSnoozeMenu); }}
                  className="p-2 rounded-lg text-theme-secondary hover:text-accent hover:bg-accent/10 transition-all"
                >
                  <AlarmClock className="w-4 h-4" />
                </button>
                {showSnoozeMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-theme-secondary dark:bg-slate-800 border border-theme dark:border-slate-700 rounded-xl shadow-2xl p-1 z-50 min-w-[140px]">
                    {[
                      { label: '5 min', mins: 5 },
                      { label: '1 hour', mins: 60 },
                      { label: '4 hours', mins: 240 },
                    ].map((opt) => (
                      <button
                        key={opt.mins}
                        onClick={(e) => { e.stopPropagation(); onSnooze(id, opt.mins); setShowSnoozeMenu(false); }}
                        className="w-full text-left px-3 py-2 text-[10px] font-bold text-theme-primary dark:text-slate-300 hover:bg-accent/10 rounded-lg transition-all uppercase tracking-widest"
                      >
                        ⏱️ {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!read && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkRead(id); }}
                  className="px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 rounded-lg bg-theme-tertiary dark:bg-slate-800 text-[10px] font-black text-theme-primary dark:text-slate-200 uppercase tracking-widest border border-theme dark:border-slate-700 hover:bg-accent hover:text-white hover:border-accent transition-all"
                >
                  Acknowledge
                </button>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); onDismiss?.(id); }}
                className="p-2 rounded-lg text-theme-secondary hover:text-red-500 hover:bg-red-500/5 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

export default AlertItem;
