import { memo } from 'react';
import { Bell, Search, User, Menu } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils';
import ThemeToggle from '../components/ThemeToggle';
import NotificationBell from '../components/notifications/NotificationBell';
import { useUIStore } from '../stores/uiStore';

const Header = memo(function Header() {
  const { user } = useAuthStore();
  const { toggleMobileSidebar } = useUIStore();

  return (
    <header className="h-14 md:h-16 glass-panel border-b border-theme flex items-center justify-between px-3 sm:px-4 md:px-6 sticky top-0 z-30 gap-2 sm:gap-4">
      {/* Mobile menu button */}
      <button
        onClick={toggleMobileSidebar}
        className="md:hidden p-2 rounded-xl text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
        aria-label="Toggle navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search */}
      <div className="relative flex-1 max-w-xs sm:max-w-sm md:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-secondary" />
        <input
          type="text"
          placeholder="Search..."
          className="w-full pl-10 pr-4 py-2 md:py-2.5 rounded-2xl bg-theme-tertiary/50 border border-theme
                     text-xs text-theme-primary placeholder:text-theme-secondary/50
                     focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30
                     transition-all shadow-inner font-medium"
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 shrink-0">
        <ThemeToggle />
        
        {/* Notifications */}
        <NotificationBell />

        {/* User Avatar */}
        <div className="flex items-center gap-3 pl-1 md:pl-2 sm:border-l border-theme md:ml-2">
          <div className={cn(
            'w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center text-sm font-black',
            'bg-accent text-white shadow-lg shadow-accent/20 border border-white/10 cursor-pointer hover:scale-105 transition-transform'
          )}>
            {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-4 h-4 md:w-5 md:h-5" />}
          </div>
        </div>
      </div>
    </header>
  );
});

export default Header;
