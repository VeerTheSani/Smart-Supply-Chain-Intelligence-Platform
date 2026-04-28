import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import NotificationPanel from './NotificationPanel';
import { useAlertStore } from '../../stores/alertStore';

/**
 * Notification Bell
 * ==================
 * Displays a badge count of unread alerts and opens a panel
 * showing the event log. Reads from Zustand alert store (WebSocket stream),
 * not from a separate API.
 */
export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const bellRef = useRef(null);

  // Read from Zustand — same source as popup alerts
  const { allAlerts } = useAlertStore();

  // Calculate unread count
  const unreadCount = allAlerts.filter((a) => !a.read).length;

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (bellRef.current && !bellRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={bellRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-xl transition-colors cursor-pointer ${
          isOpen
            ? 'bg-theme-tertiary text-theme-primary shadow-inner'
            : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary'
        }`}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger text-[10px] font-bold text-white flex items-center justify-center border-2 border-theme-secondary shadow-[0_0_8px_rgba(239,68,68,0.5)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <NotificationPanel
            isOpen={isOpen}
            alerts={allAlerts}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
