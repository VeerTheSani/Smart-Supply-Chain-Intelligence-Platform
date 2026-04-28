import { create } from 'zustand';

/**
 * Global UI store — manages sidebar, theme, and notification state.
 * Kept minimal per Zustand best practices.
 */
export const useUIStore = create((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  // Mobile sidebar — overlay behavior, hidden by default
  mobileSidebarOpen: false,
  toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
  closeMobileSidebar: () => set({ mobileSidebarOpen: false }),

  notifications: [],
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        { id: Date.now(), timestamp: new Date().toISOString(), ...notification },
        ...state.notifications,
      ].slice(0, 50), // Keep max 50 notifications
    })),
  clearNotifications: () => set({ notifications: [] }),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  inspectingShipmentId: null,
  setInspectingShipmentId: (id) => set({ inspectingShipmentId: id }),

  rerouteId: null,
  setRerouteId: (id) => set({ rerouteId: id }),
}));
