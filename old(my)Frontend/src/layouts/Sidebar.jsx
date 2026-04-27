import { memo, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Package,
  AlertTriangle,
  Route,
  BarChart3,
  Settings,
  ChevronLeft,
  Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useUIStore } from '../stores/uiStore';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/shipments', label: 'Shipments', icon: Package },
  { path: '/disruptions', label: 'Disruptions', icon: AlertTriangle },
  { path: '/routes', label: 'Routes', icon: Route },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const SidebarLink = memo(function SidebarLink({ item, collapsed }) {
  const location = useLocation();
  const isActive = location.pathname === item.path;
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-accent/15 text-accent shadow-glow'
          : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary'
      )}
    >
      <Icon
        className={cn(
          'w-5 h-5 shrink-0 transition-colors',
          isActive ? 'text-accent' : 'text-theme-secondary group-hover:text-theme-primary'
        )}
      />
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="whitespace-nowrap overflow-hidden"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      {isActive && !collapsed && (
        <motion.div
          layoutId="sidebar-active"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-accent"
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      )}
    </NavLink>
  );
});

const Sidebar = memo(function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const collapsed = !sidebarOpen;

  const navItems = useMemo(() => NAV_ITEMS, []);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed left-0 top-0 bottom-0 z-40 flex flex-col glass-panel border-r border-theme"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-theme">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <h1 className="text-sm font-bold gradient-text whitespace-nowrap">
                Smart Supply Chain
              </h1>
              <p className="text-[10px] text-theme-secondary whitespace-nowrap">
                Real-Time Intelligence
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <SidebarLink key={item.path} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div className="px-3 py-3 border-t border-theme">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-xl 
                     text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary 
                     transition-colors cursor-pointer"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.div>
        </button>
      </div>
    </motion.aside>
  );
});

export default Sidebar;
