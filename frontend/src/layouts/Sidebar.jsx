import { memo, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
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
  FlaskConical,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useUIStore } from '../stores/uiStore';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/shipments', label: 'Shipments', icon: Package },
  { path: '/disruptions', label: 'Disruptions', icon: AlertTriangle },
  { path: '/routes', label: 'Routes', icon: Route },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/scenario-lab', label: 'Scenario Lab', icon: FlaskConical },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const SidebarLink = memo(function SidebarLink({ item, collapsed, onNavigate }) {
  const location = useLocation();
  const isActive = location.pathname === item.path;
  const Icon = item.icon;

  return (
    <a
      href={item.path}
      onClick={(e) => {
        // We still call onNavigate for mobile sidebar closing
        if (onNavigate) onNavigate();
      }}
      className={cn(
        'group flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-bold transition-all duration-300 relative overflow-hidden',
        isActive
          ? 'bg-accent text-white shadow-xl shadow-accent/20'
          : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary/80'
      )}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-bg"
          className="absolute inset-0 bg-gradient-to-r from-accent to-accent/90 -z-10"
        />
      )}
      <Icon
        className={cn(
          'w-5 h-5 shrink-0 transition-transform duration-300 group-hover:scale-110',
          isActive ? 'text-white' : 'text-theme-secondary group-hover:text-accent'
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
    </a>
  );
});

const Sidebar = memo(function Sidebar() {
  const { sidebarOpen, toggleSidebar, mobileSidebarOpen, closeMobileSidebar } = useUIStore();
  const collapsed = !sidebarOpen;

  const navItems = useMemo(() => NAV_ITEMS, []);

  return (
    <>
      {/* ─── Mobile overlay backdrop ─── */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={closeMobileSidebar}
          />
        )}
      </AnimatePresence>

      {/* ─── Desktop sidebar (hidden on mobile) ─── */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 256 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed left-0 top-0 bottom-0 z-40 hidden md:flex flex-col glass-panel border-r border-theme"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-theme">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <h1 className="text-[13px] font-black tracking-tight text-theme-primary whitespace-nowrap">
                  SMART <span className="text-accent">SUPPLY</span>
                </h1>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-theme-secondary/60 whitespace-nowrap">
                  Intelligence Platform
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

      {/* ─── Mobile sidebar (slide-in overlay) ─── */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-64 flex flex-col glass-panel border-r border-theme md:hidden"
          >
            {/* Mobile Logo + Close */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-theme">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-[13px] font-black tracking-tight text-theme-primary whitespace-nowrap">
                    SMART <span className="text-accent">SUPPLY</span>
                  </h1>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-theme-secondary/60">
                    Intelligence Platform
                  </p>
                </div>
              </div>
              <button
                onClick={closeMobileSidebar}
                className="p-2 rounded-xl text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Navigation — always expanded labels */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <SidebarLink key={item.path} item={item} collapsed={false} onNavigate={closeMobileSidebar} />
              ))}
            </nav>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
});

export default Sidebar;
