import { memo, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Header from './Header';
import { useUIStore } from '../stores/uiStore';
import LiveAlertPanel from '../components/ui/LiveAlertPanel';
import { useAlertWebSocket } from '../hooks/useAlertWebSocket';
import { Toaster } from 'react-hot-toast';
import { useShipments } from '../hooks/useShipments';
import { useShipmentStore } from '../stores/shipmentStore';
import ShipmentDetailPanel from '../components/ui/ShipmentDetailPanel';
import DecisionPanel from '../components/ui/DecisionPanel';
import { useState } from 'react';
/**
 * Root layout — sidebar + header + animated page content.
 * Content area shifts based on sidebar collapsed state.
 */
const RootLayout = memo(function RootLayout() {
  const { sidebarOpen } = useUIStore();

  // Initiate Global WebSockets
  useAlertWebSocket();

  const { inspectingShipmentId, setInspectingShipmentId } = useUIStore();
  const [rerouteId, setRerouteId] = useState(null);

  // GLOBAL SYNC: React Query Server State -> Zustand Local State
  const { data: activeShipments } = useShipments();
  const { shipments, setShipments } = useShipmentStore();

  useEffect(() => {
    if (activeShipments) {
      setShipments(activeShipments);
    }
  }, [activeShipments, setShipments]);

  const selectedShipment = shipments.find(s => s.id === inspectingShipmentId);

  return (
    <div className="min-h-screen bg-theme-primary">
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

      {/* Global Modals */}
      {selectedShipment && (
        <ShipmentDetailPanel
          shipment={selectedShipment}
          onClose={() => setInspectingShipmentId(null)}
          onReroute={(id) => setRerouteId(id)}
        />
      )}
      <DecisionPanel shipmentId={rerouteId} onClose={() => setRerouteId(null)} />
    </div>
  );
});

export default RootLayout;
