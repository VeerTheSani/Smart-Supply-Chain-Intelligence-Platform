import { memo } from 'react';
import { Bell, Search, User } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { cn } from '../../lib/utils';

const Header = memo(function Header() {
  const { notifications } = useUIStore();
  const { user } = useAuthStore();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="h-16 glass border-b border-surface-800/50 flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
        <input
          type="text"
          placeholder="Search shipments, routes, alerts..."
          className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface-800/50 border border-surface-700/50
                     text-sm text-surface-200 placeholder:text-surface-500
                     focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50
                     transition-all"
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-4 ml-6">
        {/* Notifications */}
        <button
          className="relative p-2 rounded-xl text-surface-400 hover:text-surface-200 
                     hover:bg-surface-800/50 transition-colors cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger-500 
                           text-[10px] font-bold text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold',
            'bg-accent-600/20 text-accent-400 border border-accent-500/30'
          )}>
            {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </div>
        </div>
      </div>
    </header>
  );
});

export default Header;
