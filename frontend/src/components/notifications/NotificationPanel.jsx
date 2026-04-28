import React, { memo, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, Trash2, Archive, Search, Bell, History, ShieldAlert, Filter, CheckCheck } from 'lucide-react';
import AlertItem from '../ui/AlertItem';
import { useAlertStore } from '../../stores/alertStore';
import { cn } from '../../lib/utils';

/**
 * Notification Panel (REDESIGNED)
 * =============================
 * Premium, organized design with two primary tabs:
 * 1. ACTIVE — New, unread alerts that require attention.
 * 2. HISTORY — Past alerts, archived for reference.
 */
const NotificationPanel = memo(function NotificationPanel({ isOpen }) {
  const { allAlerts, clearHistory, markAlertAsRead, markAllAsRead, dismissAlert, fetchNotifications } = useAlertStore();

  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'history'
  const [filterSource, setFilterSource] = useState('all'); // 'all', 'real', 'sim'
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch notifications from backend on open
  React.useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Separate and filter notifications
  const { filteredActive, filteredHistory } = useMemo(() => {
    const unread = allAlerts.filter((a) => !a.read);
    const read = allAlerts.filter((a) => a.read);

    const applyFilters = (alerts) => {
      return alerts.filter((a) => {
        const sourceMatch =
          filterSource === 'all' ||
          (filterSource === 'real' && a.source === 'REAL_SYSTEM') ||
          (filterSource === 'sim' && a.source === 'SIMULATOR');

        const searchMatch =
          !searchTerm ||
          a.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          a.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          a.shipment_id?.toLowerCase().includes(searchTerm.toLowerCase());

        return sourceMatch && searchMatch;
      });
    };

    return {
      filteredActive: applyFilters(unread),
      filteredHistory: applyFilters(read),
    };
  }, [allAlerts, filterSource, searchTerm]);

  const stats = useMemo(() => ({
    unread: allAlerts.filter((a) => !a.read).length,
    history: allAlerts.filter((a) => a.read).length,
    critical: allAlerts.filter((a) => !a.read && (a.severity === 'critical' || a.severity === 'high')).length,
  }), [allAlerts]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 15, scale: 0.95 }}
      className="absolute top-[calc(100%+12px)] right-0 w-[480px] max-h-[85vh] flex flex-col bg-theme-secondary dark:bg-[#0f172a] shadow-[0_30px_90px_rgba(0,0,0,0.5)] border border-theme dark:border-slate-800 rounded-[28px] overflow-hidden z-[9999] origin-top-right backdrop-blur-3xl"
    >
      {/* --- HEADER --- */}
      <div className="p-6 pb-4 border-b border-theme/50 dark:border-slate-800/50 bg-theme-secondary dark:bg-[#0f172a] shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-theme-primary dark:text-slate-100 text-base uppercase tracking-wider">
                Intelligence Center
              </h3>
              <p className="text-[10px] font-bold text-theme-secondary dark:text-slate-500 uppercase tracking-widest">
                Real-time System Audit Log
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {stats.unread > 0 && (
              <button
                onClick={markAllAsRead}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/5 hover:bg-accent/10 text-accent transition-all border border-accent/10"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Mark All Read</span>
              </button>
            )}
            {activeTab === 'history' && stats.history > 0 && (
              <button
                onClick={clearHistory}
                className="p-2 rounded-xl text-theme-secondary dark:text-slate-500 hover:text-danger dark:hover:text-red-400 hover:bg-danger/5 transition-all"
                title="Clear History"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* --- TABS --- */}
        <div className="flex p-1 bg-theme-tertiary dark:bg-slate-900/50 rounded-2xl border border-theme dark:border-slate-800/50 mb-4">
          <button
            onClick={() => setActiveTab('active')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all relative",
              activeTab === 'active' 
                ? "bg-theme-secondary dark:bg-slate-800 text-theme-primary dark:text-white shadow-lg shadow-black/20 border border-theme dark:border-slate-700" 
                : "text-theme-secondary dark:text-slate-500 hover:text-theme-primary"
            )}
          >
            <ShieldAlert className={cn("w-3.5 h-3.5", activeTab === 'active' ? "text-accent" : "text-slate-500")} />
            Active Alerts
            {stats.unread > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-danger animate-pulse" />
            )}
            {stats.unread > 0 && (
               <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-accent/10 text-accent text-[9px]">
                 {stats.unread}
               </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all",
              activeTab === 'history' 
                ? "bg-theme-secondary dark:bg-slate-800 text-theme-primary dark:text-white shadow-lg shadow-black/20 border border-theme dark:border-slate-700" 
                : "text-theme-secondary dark:text-slate-500 hover:text-theme-primary"
            )}
          >
            <History className={cn("w-3.5 h-3.5", activeTab === 'history' ? "text-accent" : "text-slate-500")} />
            History Log
          </button>
        </div>

        {/* --- SEARCH & FILTERS --- */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-secondary dark:text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by shipment or message..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-theme-tertiary dark:bg-slate-900/50 border border-theme dark:border-slate-800 rounded-xl text-theme-primary dark:text-slate-200 placeholder:text-theme-secondary dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>
          <div className="flex bg-theme-tertiary dark:bg-slate-900/50 rounded-xl border border-theme dark:border-slate-800 overflow-hidden">
            <button 
              onClick={() => setFilterSource('all')}
              className={cn("px-3 text-[9px] font-black uppercase tracking-tighter transition-all border-r border-theme dark:border-slate-800", 
                filterSource === 'all' ? "bg-accent/20 text-accent" : "text-theme-secondary hover:bg-theme-secondary/50")}
            >
              All
            </button>
            <button 
              onClick={() => setFilterSource('real')}
              className={cn("px-3 text-[9px] font-black uppercase tracking-tighter transition-all border-r border-theme dark:border-slate-800", 
                filterSource === 'real' ? "bg-danger/20 text-danger" : "text-theme-secondary hover:bg-theme-secondary/50")}
            >
              Live
            </button>
            <button 
              onClick={() => setFilterSource('sim')}
              className={cn("px-3 text-[9px] font-black uppercase tracking-tighter transition-all", 
                filterSource === 'sim' ? "bg-blue-500/20 text-blue-400" : "text-theme-secondary hover:bg-theme-secondary/50")}
            >
              Sim
            </button>
          </div>
        </div>
      </div>

      {/* --- CONTENT --- */}
      <div className="overflow-y-auto flex-1 custom-scrollbar min-h-[300px] bg-theme-tertiary/20 dark:bg-slate-950/20">
        <AnimatePresence mode="wait">
          {activeTab === 'active' ? (
            <motion.div
              key="active-list"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="divide-y divide-theme/5 dark:divide-slate-800/30"
            >
              {filteredActive.length > 0 ? (
                filteredActive.map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    onMarkRead={markAlertAsRead}
                    onDismiss={dismissAlert}
                    variant="full"
                  />
                ))
              ) : (
                <EmptyState 
                  icon={<Inbox className="w-12 h-12" />}
                  title="No Active Alerts"
                  description="Everything is running smoothly. Any new system anomalies or automated reroutes will appear here."
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="history-list"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="divide-y divide-theme/5 dark:divide-slate-800/30"
            >
              {filteredHistory.length > 0 ? (
                filteredHistory.map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    onDismiss={dismissAlert}
                    variant="full"
                  />
                ))
              ) : (
                <EmptyState 
                  icon={<Archive className="w-12 h-12" />}
                  title="History Empty"
                  description="Read notifications are moved here. You can reference past reroutes and risk assessments anytime."
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- FOOTER STATS --- */}
      <div className="px-6 py-3 border-t border-theme/50 dark:border-slate-800/50 bg-theme-secondary/50 dark:bg-slate-900/50 backdrop-blur-md flex items-center justify-between">
        <div className="flex gap-3">
          <StatBadge label="Total" value={allAlerts.length} color="gray" />
          {stats.critical > 0 && <StatBadge label="Critical" value={stats.critical} color="red" />}
        </div>
        <div className="text-[9px] font-black text-theme-secondary dark:text-slate-600 uppercase tracking-[0.2em]">
          Smart Logistics Intelligence v2.0
        </div>
      </div>
    </motion.div>
  );
});

function EmptyState({ icon, title, description }) {
  return (
    <div className="p-16 flex flex-col items-center justify-center text-center">
      <div className="w-24 h-24 rounded-full bg-theme-tertiary dark:bg-slate-900/50 flex items-center justify-center mb-6 border border-theme dark:border-slate-800/50 shadow-inner">
        <div className="text-theme-secondary dark:text-slate-600 opacity-20">
          {icon}
        </div>
      </div>
      <h4 className="text-sm font-black text-theme-primary dark:text-slate-300 uppercase tracking-widest mb-2">
        {title}
      </h4>
      <p className="text-[11px] text-theme-secondary dark:text-slate-500 max-w-[240px] leading-relaxed font-medium">
        {description}
      </p>
    </div>
  );
}

function StatBadge({ label, value, color }) {
  const colors = {
    gray: "bg-theme-tertiary dark:bg-slate-800 text-theme-secondary dark:text-slate-400 border-theme dark:border-slate-700",
    red: "bg-danger/10 text-danger border-danger/20 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    blue: "bg-accent/10 text-accent border-accent/20 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
  };

  return (
    <div className={cn("px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5", colors[color] || colors.gray)}>
      <span>{label}</span>
      <span className="w-1 h-1 rounded-full bg-current opacity-30" />
      <span className="opacity-80">{value}</span>
    </div>
  );
}

export default NotificationPanel;

