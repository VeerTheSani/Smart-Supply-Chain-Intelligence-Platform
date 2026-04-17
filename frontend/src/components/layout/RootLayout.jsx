import { memo, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Header from './Header';
import { useUIStore } from '../../stores/uiStore';
import LiveAlertPanel from '../ui/LiveAlertPanel';
import { useAlertWebSocket } from '../../hooks/useAlertWebSocket';
import { Toaster } from 'react-hot-toast';
import { useShipments } from '../../hooks/useApi';
import { useShipmentStore } from '../../stores/shipmentStore';
/**
 * Root layout — sidebar + header + animated page content.
 * Content area shifts based on sidebar collapsed state.
 */
const RootLayout = memo(function RootLayout() {
  const { sidebarOpen } = useUIStore();

  // Initiate Global WebSockets
  useAlertWebSocket();

  // GLOBAL SYNC: React Query Server State -> Zustand Local State
  const { data: activeShipments } = useShipments();
  const setShipments = useShipmentStore(state => state.setShipments);

  useEffect(() => {
    if (activeShipments) {
      setShipments(activeShipments);
    }
  }, [activeShipments, setShipments]);

  return (
    <div className="min-h-screen bg-surface-950">
      <Toaster position="top-right" />
      <LiveAlertPanel />
      <Sidebar />
      <motion.div
        initial={false}
        animate={{ marginLeft: sidebarOpen ? 256 : 72 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex flex-col min-h-screen"
      >
        <Header />
        <main className="flex-1 p-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </main>
      </motion.div>
    </div>
  );
});

export default RootLayout;
