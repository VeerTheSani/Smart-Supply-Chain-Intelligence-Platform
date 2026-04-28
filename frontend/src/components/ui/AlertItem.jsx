import React, { memo } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  MapPin,
  Zap,
  TrendingUp,
  Package,
  Trash2,
  Truck,
  Link2,
  Server,
  Beaker,
} from 'lucide-react';

const AlertItem = memo(function AlertItem({
  alert,
  onDismiss,
  onMarkRead,  // New: callback to mark as read
  variant = 'compact', // 'compact' for popup, 'full' for panel
}) {
  if (!alert) return null;

  const getSeverityStyles = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return {
          badge:
            'bg-danger/20 text-danger border-danger/30 dark:bg-red-500/10 dark:text-red-400',
          icon: 'text-danger dark:text-red-400',
          accent: 'text-danger dark:text-red-400',
          bg: 'hover:bg-danger/5 dark:hover:bg-red-500/5',
          border: 'border-danger/20 dark:border-red-500/10',
          highlight: 'bg-danger/5 border-l-4 border-l-danger',
        };
      case 'high':
        return {
          badge:
            'bg-warning/20 text-warning border-warning/30 dark:bg-orange-500/10 dark:text-orange-400',
          icon: 'text-warning dark:text-orange-400',
          accent: 'text-warning dark:text-orange-400',
          bg: 'hover:bg-warning/5 dark:hover:bg-orange-500/5',
          border: 'border-warning/20 dark:border-orange-500/10',
          highlight: 'bg-warning/5 border-l-4 border-l-warning',
        };
      case 'medium':
        return {
          badge:
            'bg-yellow-500/20 text-yellow-600 border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-400',
          icon: 'text-yellow-600 dark:text-yellow-400',
          accent: 'text-yellow-600 dark:text-yellow-400',
          bg: 'hover:bg-yellow-500/5 dark:hover:bg-yellow-500/5',
          border: 'border-yellow-500/20 dark:border-yellow-500/10',
          highlight: '',
        };
      default:
        return {
          badge:
            'bg-green-500/20 text-green-600 border-green-500/30 dark:bg-green-500/10 dark:text-green-400',
          icon: 'text-green-600 dark:text-green-400',
          accent: 'text-green-600 dark:text-green-400',
          bg: 'hover:bg-green-500/5 dark:hover:bg-green-500/5',
          border: 'border-green-500/20 dark:border-green-500/10',
          highlight: '',
        };
    }
  };

  const getIconForType = (type) => {
    switch (type?.toLowerCase()) {
      case 'risk_alert':
      case 'high_risk_alert':
        return <AlertTriangle className="w-4 h-4" />;
      case 'critical_risk':
        return <AlertTriangle className="w-5 h-5" />;
      case 'cascade_alert':
        return <Link2 className="w-4 h-4" />;
      case 'gps_stuck':
        return <MapPin className="w-4 h-4" />;
      case 'api_failure':
        return <Server className="w-4 h-4" />;
      case 'reroute_executed':
        return <Truck className="w-4 h-4" />;
      case 'shipment_created':
        return <Package className="w-4 h-4" />;
      case 'shipment_deleted':
        return <Trash2 className="w-4 h-4" />;
      case 'simulator_scenario':
        return <Beaker className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const formatTime = (timestamp) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffSecs = Math.floor(diffMs / 1000);

      if (diffSecs < 60) return `${diffSecs}s ago`;
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;

      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const styles = getSeverityStyles(alert.severity || alert.level);

  if (variant === 'compact') {
    // POPUP STYLE - Minimal, dismissible, theme-aware
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        className={`relative group bg-theme-secondary dark:bg-slate-900/80 backdrop-blur-xl border ${styles.border} dark:border-slate-700 rounded-xl p-3 w-[300px] shadow-xl hover:border-accent transition-all`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div
            className={`flex items-center gap-1.5 text-xs font-semibold uppercase ${styles.accent}`}
          >
            <span className={styles.icon}>{getIconForType(alert.type)}</span>
            {alert.source === 'REAL_SYSTEM' ? '🔴 LIVE' : '🧪 SIMULATOR'}
          </div>
          {onDismiss && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(alert.id);
              }}
              className="text-theme-secondary dark:text-gray-500 hover:text-theme-primary dark:hover:text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
          )}
        </div>

        {/* Message */}
        <div className="text-xs text-theme-secondary dark:text-gray-300 line-clamp-3 mb-2">
          {alert.message || 'Alert detected'}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-theme-secondary dark:text-gray-500">
          <span>{alert.shipment_id?.slice(-6) || 'System'}</span>
          <span>{formatTime(alert.timestamp)}</span>
        </div>
      </motion.div>
    );
  }

  // PANEL STYLE - Full details, theme-aware
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`p-5 border-b border-theme/50 dark:border-slate-800/50 transition-all cursor-pointer relative bg-theme-secondary dark:bg-[#0f172a] ${
        alert.read ? 'opacity-60 grayscale-[0.3]' : 'opacity-100'
      } ${styles.bg} ${!alert.read ? styles.highlight : ''}`}
    >
      {/* Status Badges */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {!alert.read && (
          <span className="px-1.5 py-0.5 rounded bg-accent text-white text-[8px] font-black uppercase tracking-widest animate-pulse shadow-lg shadow-accent/20">
            New
          </span>
        )}
        {alert.type === 'reroute_executed' && (
          <span className="px-1.5 py-0.5 rounded bg-blue-500 text-white text-[8px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20">
            Auto-Reroute
          </span>
        )}
      </div>

      <div className="flex gap-3">
        {/* Icon Badge */}
        <div
          className={`mt-1 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${styles.badge}`}
        >
          {getIconForType(alert.type)}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-1.5">
          {/* Title & Time */}
          <div className="flex justify-between items-start gap-2">
            <div>
              <h4 className={`text-sm font-semibold ${alert.read ? 'text-theme-secondary dark:text-slate-400' : 'text-theme-primary dark:text-slate-200'}`}>
                {alert.title || alert.message?.split('\n')[0] || 'Alert'}
              </h4>
              <p className="text-xs text-theme-secondary dark:text-slate-400 mt-0.5">
                {alert.source === 'REAL_SYSTEM' ? '🔴 Live System' : '🧪 Simulator'}
              </p>
            </div>
            <span className="text-xs text-theme-secondary dark:text-slate-400 whitespace-nowrap shrink-0 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(alert.timestamp)}
            </span>
          </div>

          {/* Message */}
          <p className={`text-sm line-clamp-3 leading-relaxed ${alert.read ? 'text-theme-secondary dark:text-slate-400' : 'text-theme-secondary dark:text-slate-300'}`}>
            {alert.message}
          </p>

          {/* Reason (for reroute, risk, cascade alerts) */}
          {alert.reason && (
            <div className="mt-2 p-2 rounded-lg bg-accent/5 dark:bg-blue-500/5 border border-accent/10 dark:border-blue-500/10 text-[11px] text-theme-secondary dark:text-slate-300">
              <span className="font-black text-accent dark:text-blue-400 uppercase tracking-wider">
                Reason:{' '}
              </span>
              {alert.reason}
            </div>
          )}

          {/* Reroute Details */}
          {alert.type === 'reroute_executed' && (
            <div className="mt-2 space-y-1.5 p-2 rounded-lg bg-theme-tertiary dark:bg-slate-800 border border-theme dark:border-slate-700">
              <div className="text-[10px] font-black text-accent dark:text-blue-400 uppercase tracking-wider">
                Route Change Details
              </div>
              {alert.original_eta && alert.new_eta && (
                <div className="flex justify-between text-[11px] text-theme-secondary dark:text-slate-300">
                  <span>ETA: {alert.original_eta} → {alert.new_eta}</span>
                  {alert.eta_change && (
                    <span className={`font-semibold ${
                      alert.eta_change > 0 ? styles.accent : 'text-green-600 dark:text-green-400'
                    }`}>
                      {alert.eta_change > 0 ? '+' : ''}{alert.eta_change}min
                    </span>
                  )}
                </div>
              )}
              {alert.distance_change && (
                <div className="text-[11px] text-theme-secondary dark:text-slate-300">
                  Distance: {alert.distance_change}
                </div>
              )}
              {alert.cost_impact && (
                <div className="text-[11px] text-theme-secondary dark:text-slate-300">
                  Cost Impact: {alert.cost_impact}
                </div>
              )}
            </div>
          )}

          {/* Risk Factors */}
          {alert.factors && alert.factors.length > 0 && (
            <div className="mt-2 p-2 rounded-lg bg-theme-tertiary dark:bg-slate-800 border border-theme dark:border-slate-700">
              <div className="text-[10px] font-black text-accent dark:text-blue-400 uppercase tracking-wider mb-1">
                Risk Factors
              </div>
              <div className="space-y-0.5">
                {alert.factors.map((factor, idx) => (
                  <div key={idx} className="text-[10px] text-theme-secondary dark:text-slate-300">
                    • {factor}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cascade Details */}
          {alert.type === 'cascade_alert' && alert.upstream_name && (
            <div className="mt-2 p-2 rounded-lg bg-theme-tertiary dark:bg-slate-800 border border-theme dark:border-slate-700">
              <div className="text-[10px] font-black text-accent dark:text-blue-400 uppercase tracking-wider mb-1">
                Upstream Delay
              </div>
              <div className="space-y-0.5 text-[11px] text-theme-secondary dark:text-slate-300">
                <div>Upstream: {alert.upstream_name}</div>
                <div>Delay: {alert.delay_minutes}m</div>
              </div>
            </div>
          )}

          {/* GPS Details */}
          {alert.type === 'gps_stuck' && alert.last_location && (
            <div className="mt-2 p-2 rounded-lg bg-theme-tertiary dark:bg-slate-800 border border-theme dark:border-slate-700">
              <div className="text-[10px] font-black text-accent dark:text-blue-400 uppercase tracking-wider mb-1">
                Last Location
              </div>
              <div className="text-[11px] text-theme-secondary dark:text-slate-300">
                {alert.last_location}
              </div>
            </div>
          )}

          {/* Severity Badge + Shipment ID */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-theme dark:border-slate-700/30">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${styles.badge}`}>
                {alert.severity || alert.level || 'Info'}
              </span>
              {alert.shipment_id && (
                <span className="text-xs text-theme-secondary dark:text-slate-400 font-mono">
                  #{alert.shipment_id.slice(-6)}
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              {!alert.read && onMarkRead && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkRead(alert.id);
                  }}
                  className="text-[10px] px-2 py-0.5 rounded-md text-accent dark:text-blue-400 hover:bg-accent/10 dark:hover:bg-blue-500/10 transition-all font-black uppercase tracking-wider"
                  title="Mark as read"
                >
                  ✓ Mark Read
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(alert.id);
                  }}
                  className="text-[10px] px-2 py-0.5 rounded-md text-danger dark:text-red-400 hover:bg-danger/10 dark:hover:bg-red-500/10 transition-all font-black uppercase tracking-wider"
                  title="Remove from history"
                >
                  ✕ Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

export default AlertItem;
