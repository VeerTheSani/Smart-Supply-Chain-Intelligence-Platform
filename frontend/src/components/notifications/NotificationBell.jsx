import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import NotificationPanel from './NotificationPanel';
import api from '../../api/apiClient';
import { ENDPOINTS } from '../../config/api';

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const bellRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.NOTIFICATIONS);
      return data;
    },
    refetchInterval: 30000, // Poll every 30s as backup
  });

  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      await api.post(ENDPOINTS.NOTIFICATION_READ(id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.post(ENDPOINTS.NOTIFICATION_MARK_ALL_READ);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const unreadCount = notifications.filter(n => !n.read).length;

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
        className={`relative p-2 rounded-xl transition-colors cursor-pointer ${isOpen
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
            notifications={notifications}
            isLoading={isLoading}
            onMarkRead={(id) => markReadMutation.mutate(id)}
            onMarkAllRead={() => markAllReadMutation.mutate()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
