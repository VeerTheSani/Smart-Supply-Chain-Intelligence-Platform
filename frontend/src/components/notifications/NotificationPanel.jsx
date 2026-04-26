import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCheck, Inbox, RefreshCw } from 'lucide-react';
import NotificationItem from './NotificationItem';

const NotificationPanel = memo(function NotificationPanel({ 
  isOpen, 
  notifications, 
  onMarkRead, 
  onMarkAllRead,
  isLoading 
}) {
  if (!isOpen) return null;

  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = {
    today: [],
    yesterday: [],
    earlier: []
  };

  notifications?.forEach(n => {
    const d = new Date(n.timestamp);
    if (d >= today) groups.today.push(n);
    else if (d >= yesterday) groups.yesterday.push(n);
    else groups.earlier.push(n);
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      className="absolute top-[calc(100%+12px)] right-0 w-[420px] max-h-[85vh] flex flex-col bg-theme-secondary shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-theme rounded-[24px] overflow-hidden z-[9999] origin-top-right backdrop-blur-2xl"
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-theme/50 bg-theme-secondary flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-black text-theme-primary text-sm uppercase tracking-[0.15em]">System Notifications</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-accent text-white text-[10px] font-black shadow-lg shadow-accent/20">
              {unreadCount} NEW
            </span>
          )}
        </div>
        
        {unreadCount > 0 && (
          <button 
            onClick={onMarkAllRead}
            className="text-[10px] font-black text-theme-secondary hover:text-accent flex items-center gap-1.5 transition-all uppercase tracking-widest p-1"
          >
            <CheckCheck className="w-4 h-4" /> Clear All
          </button>
        )}
      </div>

      {/* Content */}
      <div className="overflow-y-auto flex-1 overscroll-contain">
        {isLoading ? (
          <div className="p-8 flex flex-col items-center justify-center text-theme-secondary gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-accent" />
            <p className="text-sm">Loading notifications...</p>
          </div>
        ) : notifications?.length === 0 ? (
          <div className="p-8 flex flex-col items-center justify-center text-theme-secondary gap-3 opacity-70">
            <Inbox className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs">No new alerts or system events.</p>
          </div>
        ) : (
          <div className="pb-2">
            {groups.today.length > 0 && (
              <div className="mt-2">
                <div className="px-4 py-1 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-danger/80" />
                  <span className="text-xs font-bold text-theme-secondary uppercase tracking-wider">Today</span>
                </div>
                {groups.today.map(n => <NotificationItem key={n._id} notification={n} onRead={onMarkRead} />)}
              </div>
            )}
            
            {groups.yesterday.length > 0 && (
              <div className="mt-4">
                <div className="px-4 py-1 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-theme-secondary" />
                  <span className="text-xs font-bold text-theme-secondary uppercase tracking-wider">Yesterday</span>
                </div>
                {groups.yesterday.map(n => <NotificationItem key={n._id} notification={n} onRead={onMarkRead} />)}
              </div>
            )}

            {groups.earlier.length > 0 && (
              <div className="mt-4">
                <div className="px-4 py-1 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-theme-tertiary" />
                  <span className="text-xs font-bold text-theme-secondary uppercase tracking-wider">Earlier</span>
                </div>
                {groups.earlier.map(n => <NotificationItem key={n._id} notification={n} onRead={onMarkRead} />)}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Footer */}
      {notifications?.length > 0 && (
        <div className="p-4 border-t border-theme/50 bg-theme-tertiary/30 text-center shrink-0">
          <button className="text-[11px] font-black text-theme-secondary hover:text-accent transition-all uppercase tracking-[0.2em]">
            Access Full History Archive
          </button>
        </div>
      )}
    </motion.div>
  );
});

export default NotificationPanel;
