import React, { memo, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox, Trash2, Archive, Search, Bell, History, ShieldAlert,
  CheckCheck, Settings, Download, Star, Volume2, VolumeX,
  Monitor, X,
} from 'lucide-react';
import AlertItem from '../ui/AlertItem';
import { useAlertStore } from '../../stores/alertStore';
import { useNotificationPrefsStore } from '../../stores/notificationPrefsStore';
import { cn } from '../../lib/utils';

/**
 * Notification Panel (COMPLETE v3)
 * ================================
 * - Tabbed: Active | History | Flagged
 * - Settings drawer for preferences
 * - Export CSV button
 * - Flag, snooze, search, filter
 */
const NotificationPanel = memo(function NotificationPanel({ isOpen }) {
  const {
    allAlerts, clearHistory, markAlertAsRead, markAllAsRead,
    dismissAlert, fetchNotifications, toggleFlag, snoozeAlert,
    exportAsCSV,
  } = useAlertStore();

  const prefs = useNotificationPrefsStore();

  const [activeTab, setActiveTab] = useState('active');
  const [filterSource, setFilterSource] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Fetch notifications from backend on open
  React.useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Filter + separate
  const { filteredActive, filteredHistory, filteredFlagged } = useMemo(() => {
    const applyFilters = (alerts) =>
      alerts.filter((a) => {
        const sourceMatch =
          filterSource === 'all' ||
          (filterSource === 'real' && a.source === 'REAL_SYSTEM') ||
          (filterSource === 'sim' && a.source === 'SIMULATOR');

        const searchMatch =
          !searchTerm ||
          (a.message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (a.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (a.shipment_id || '').toLowerCase().includes(searchTerm.toLowerCase());

        return sourceMatch && searchMatch;
      });

    return {
      filteredActive: applyFilters(allAlerts.filter((a) => !a.read)),
      filteredHistory: applyFilters(allAlerts.filter((a) => a.read)),
      filteredFlagged: applyFilters(allAlerts.filter((a) => a.flagged)),
    };
  }, [allAlerts, filterSource, searchTerm]);

  const stats = useMemo(() => ({
    unread: allAlerts.filter((a) => !a.read).length,
    history: allAlerts.filter((a) => a.read).length,
    flagged: allAlerts.filter((a) => a.flagged).length,
    critical: allAlerts.filter((a) => !a.read && (a.severity === 'critical' || a.severity === 'high')).length,
  }), [allAlerts]);

  const handleRequestDesktop = useCallback(async () => {
    await prefs.requestDesktopPermission();
  }, [prefs]);

  if (!isOpen) return null;

  const currentList =
    activeTab === 'active' ? filteredActive :
      activeTab === 'flagged' ? filteredFlagged :
        filteredHistory;

  const emptyConfig = {
    active: { icon: <Inbox className="w-10 h-10" />, title: 'Operational Clarity', desc: 'No active anomalies detected. Your supply chain is performing within standard parameters.' },
    history: { icon: <Archive className="w-10 h-10" />, title: 'Archive Empty', desc: 'Historical logs and acknowledged alerts will be indexed here.' },
    flagged: { icon: <Star className="w-10 h-10" />, title: 'No Priorities', desc: 'Flagged events for follow-up will appear here for prioritized monitoring.' },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.98 }}
      className="absolute top-[calc(100%+16px)] right-0 sm:right-0 w-[calc(100vw-2rem)] sm:w-[460px] max-h-[80vh] flex flex-col bg-theme-secondary dark:bg-[#0f172a] shadow-[0_20px_70px_-15px_rgba(0,0,0,0.5)] border border-theme dark:border-slate-800 rounded-2xl overflow-hidden z-[9999] origin-top-right backdrop-blur-2xl"
    >
      {/* ========== HEADER ========== */}
      <div className="p-4 border-b bg-theme-secondary border-theme shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-sm">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-theme-primary dark:text-slate-100 text-sm tracking-tight">
                {showSettings ? 'Audit Preferences' : 'Control Tower'}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1 text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                  <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                  {showSettings ? 'Configuration' : 'Live Audit'}
                </span>
                <span className="text-theme-secondary dark:text-slate-600 text-[9px] uppercase tracking-widest">• Intelligence v3.4</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {stats.unread > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-theme-secondary hover:bg-theme-tertiary text-theme-primary hover:text-accent transition-all border border-theme text-[10px] font-bold uppercase tracking-tight"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Clear All
              </button>
            )}
            <div className="w-px h-4 bg-theme mx-1" />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "p-2 rounded-lg transition-all",
                showSettings
                  ? "bg-theme-secondary"
                  : "bg-theme-secondary dark:bg-slate-950/20"
              )}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========== SEARCH & TABS ========== */}
        {!showSettings && (
          <div className="space-y-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-theme-secondary dark:text-slate-500 group-focus-within:text-accent transition-colors" />
              <input
                type="text"
                placeholder="Search shipment logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-theme-secondary border border-theme rounded-xl text-theme-primary focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
              />
            </div>

            <div className="flex p-1 bg-theme-tertiary dark:bg-slate-900/40 rounded-xl border border-theme dark:border-slate-800/50">
              {[
                { key: 'active', label: 'Active', count: stats.unread },
                { key: 'flagged', label: 'Flagged', count: stats.flagged },
                { key: 'history', label: 'History' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === tab.key
                      ? "bg-theme-secondary hover:bg-theme-tertiary text-accent shadow-sm border border-theme dark:border-slate-700"
                      : "text-theme-secondary dark:text-slate-500 hover:text-theme-primary"
                  )}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-accent text-white text-[8px] font-black">{tab.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========== CONTENT ========== */}
      <div className="overflow-y-auto flex-1 custom-scrollbar min-h-[300px] bg-theme-secondary dark:bg-slate-950/20">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="divide-y divide-theme/50 dark:divide-slate-800/50"
          >
            {showSettings ? (
              <SettingsView prefs={prefs} />
            ) : currentList.length > 0 ? (
              currentList.map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onMarkRead={markAlertAsRead}
                  onDismiss={dismissAlert}
                  onFlag={toggleFlag}
                  onSnooze={snoozeAlert}
                  variant="full"
                />
              ))
            ) : (
              <EmptyState
                icon={emptyConfig[activeTab].icon}
                title={emptyConfig[activeTab].title}
                description={emptyConfig[activeTab].desc}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ========== FOOTER ========== */}
      <div className="px-4 py-3 bg-theme-tertiary dark:bg-[#0f172a] border-t border-theme dark:border-slate-800 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={exportAsCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-theme-secondary hover:text-accent hover:bg-accent/5 transition-all border border-transparent hover:border-accent/10"
          >
            <Download className="w-3 h-3" />
            Export Audit
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-theme-secondary dark:bg-slate-900 rounded-lg border border-theme dark:border-slate-800 overflow-hidden">
            {[
              { key: 'all', label: 'ALL' },
              { key: 'real', label: 'LIVE' },
              { key: 'sim', label: 'SIM' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterSource(f.key)}
                className={cn(
                  "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all border-r border-theme dark:border-slate-800 last:border-r-0",
                  filterSource === f.key ? "bg-accent/10 text-accent" : "text-theme-secondary hover:text-theme-primary"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

function SettingsView({ prefs }) {
  return (
    <div className="p-6 space-y-8 bg-theme-secondary text-theme-primary">
      <div>
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-4">Audio Feedback</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-theme-tertiary text-theme-primary">
                {prefs.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-xs font-bold text-theme-primary">Alert Sounds</p>
                <p className="text-[10px] text-theme-secondary">Play audio for new critical events</p>
              </div>
            </div>
            <button
              onClick={() => prefs.setSoundEnabled(!prefs.soundEnabled)}
              className={cn(
                "w-10 h-5 rounded-full transition-all relative border",
                prefs.soundEnabled ? "bg-accent border-accent" : "bg-theme-tertiary border-theme"
              )}
            >
              <div className={cn(
                "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-theme-secondary transition-all shadow-sm",
                prefs.soundEnabled ? "left-[22px]" : "left-0.5"
              )} />
            </button>
          </div>

          {prefs.soundEnabled && (
            <div className="space-y-2 pl-11">
              <div className="flex justify-between text-[9px] font-bold text-theme-secondary uppercase tracking-widest">
                <span>Volume</span>
                <span>{Math.round(prefs.soundVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={prefs.soundVolume}
                onChange={(e) => prefs.setSoundVolume(parseFloat(e.target.value))}
                className="w-full accent-accent h-1.5 bg-theme-tertiary rounded-lg appearance-none"
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-4">Visual Alerts</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-theme-tertiary text-theme-primary">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-theme-primary">Desktop Notifications</p>
                <p className="text-[10px] text-theme-secondary">Show browser popups when minimized</p>
              </div>
            </div>
            <button
              onClick={() => prefs.setDesktopEnabled(!prefs.desktopEnabled)}
              className={cn(
                "w-10 h-5 rounded-full transition-all relative border",
                prefs.desktopEnabled ? "bg-accent border-accent" : "bg-theme-tertiary border-theme"
              )}
            >
              <div className={cn(
                "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-theme-secondary transition-all shadow-sm",
                prefs.desktopEnabled ? "left-[22px]" : "left-0.5"
              )} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-theme-tertiary text-theme-primary">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-theme-primary">Toast Popups</p>
                <p className="text-[10px] text-theme-secondary">Show in-app overlay alerts</p>
              </div>
            </div>
            <button
              onClick={() => prefs.setToastsEnabled(!prefs.toastsEnabled)}
              className={cn(
                "w-10 h-5 rounded-full transition-all relative border",
                prefs.toastsEnabled ? "bg-accent border-accent" : "bg-theme-tertiary border-theme"
              )}
            >
              <div className={cn(
                "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-theme-secondary transition-all shadow-sm",
                prefs.toastsEnabled ? "left-[22px]" : "left-0.5"
              )} />
            </button>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-theme">
        <button
          onClick={prefs.resetPrefs}
          className="w-full py-2.5 rounded-xl border border-dashed border-theme hover:border-danger/30 hover:bg-danger/5 text-[10px] font-bold text-theme-secondary hover:text-danger uppercase tracking-widest transition-all"
        >
          Reset to Factory Defaults
        </button>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, description }) {
  return (
    <div className="py-20 px-10 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-theme-tertiary dark:bg-slate-900 flex items-center justify-center mb-4 border border-theme dark:border-slate-800/50 shadow-sm text-theme-secondary opacity-30">
        {icon}
      </div>
      <h4 className="text-sm font-bold text-theme-primary dark:text-slate-200 uppercase tracking-tight mb-2">{title}</h4>
      <p className="text-xs text-theme-secondary dark:text-slate-500 leading-relaxed max-w-[240px] font-medium">{description}</p>
    </div>
  );
}

function StatBadge({ label, value, color }) {
  const colors = {
    gray: "bg-theme-tertiary dark:bg-slate-800 text-theme-secondary dark:text-slate-400 border-theme dark:border-slate-700",
    red: "bg-danger/10 text-danger border-danger/20 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    yellow: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20",
  };

  return (
    <div className={cn("px-2 py-0.5 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1", colors[color] || colors.gray)}>
      <span>{label}</span>
      <span className="w-0.5 h-0.5 rounded-full bg-current opacity-30" />
      <span className="opacity-80">{value}</span>
    </div>
  );
}

export default NotificationPanel;
