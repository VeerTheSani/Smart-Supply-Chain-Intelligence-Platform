import { memo } from 'react';
import { Bell, Search, User } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils';
import ThemeToggle from '../components/ThemeToggle';
import NotificationBell from '../components/notifications/NotificationBell';

const Header = memo(function Header() {
  const { user } = useAuthStore();

  return (
    <header className="h-16 glass-panel border-b border-theme flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-secondary" />
        <input
          type="text"
          placeholder="System Search (Shipments, Routes, Intel...)"
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-theme-tertiary/50 border border-theme
                     text-xs text-theme-primary placeholder:text-theme-secondary/50
                     focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30
                     transition-all shadow-inner font-medium"
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-4 ml-6">
        <ThemeToggle />
        
        {/* Notifications */}
        <NotificationBell />

        {/* User Avatar */}
        <div className="flex items-center gap-3 pl-2 border-l border-theme ml-2">
          <div className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black',
            'bg-accent text-white shadow-lg shadow-accent/20 border border-white/10 cursor-pointer hover:scale-105 transition-transform'
          )}>
            {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
          </div>
        </div>
      </div>
    </header>
  );
});

export default Header;
