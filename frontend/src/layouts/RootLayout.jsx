import { memo, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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
/**
 * Root layout — sidebar + header + animated page content.
 * Content area shifts based on sidebar collapsed state.
 */
const RootLayout = memo(function RootLayout() {
  const location = useLocation();
  const { sidebarOpen } = useUIStore();

  // Initiate Global WebSockets
  useAlertWebSocket();

  const { inspectingShipmentId, setInspectingShipmentId, rerouteId, setRerouteId } = useUIStore();

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
      <div
        className="flex flex-col min-h-screen transition-[margin] duration-300 ease-out"
        style={{ marginLeft: undefined }}
      >
        {/* Desktop sidebar margin — animated via framer motion */}
        <style>{`
          @media (min-width: 768px) {
            .sidebar-content-shift {
              margin-left: ${sidebarOpen ? 256 : 72}px !important;
              transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
          }
          @media (max-width: 767px) {
            .sidebar-content-shift {
              margin-left: 0 !important;
            }
          }
        `}</style>
        <div className="sidebar-content-shift flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-3 sm:p-4 md:p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </main>
        </div>
      </div>

      {/* Global Modals */}
      {selectedShipment && (
        <ShipmentDetailPanel
          shipment={selectedShipment}
          onClose={() => setInspectingShipmentId(null)}
          onReroute={(id) => setRerouteId(id)}
        />
      )}
      {rerouteId && <DecisionPanel shipmentId={rerouteId} onClose={() => setRerouteId(null)} />}
    </div>
  );
});

export default RootLayout;
