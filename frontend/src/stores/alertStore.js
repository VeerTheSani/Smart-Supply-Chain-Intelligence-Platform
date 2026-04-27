import { create } from 'zustand';

/**
 * Split alert store: separate REAL system alerts from SIMULATOR alerts.
 * This prevents simulator scenarios from contaminating production data.
 */
export const useAlertStore = create((set) => ({
  // REAL SYSTEM ALERTS - Production logic
  realAlerts: [],
  
  // SIMULATOR ALERTS - Scenario Lab only
  simAlerts: [],
  
  wsConnected: false,

  // Add alert to REAL system
  addRealAlert: (alert) =>
    set((state) => {
      const alertId = alert.id || `${alert.timestamp}-${alert.shipment_id}-${alert.type}`;
      if (state.realAlerts.some((a) => a.id === alertId)) return state;
      return {
        realAlerts: [{ ...alert, id: alertId }, ...state.realAlerts].slice(0, 50),
      };
    }),

  // Add alert to SIMULATOR
  addSimAlert: (alert) =>
    set((state) => {
      const alertId = alert.id || `${alert.timestamp}-${alert.shipment_id}-${alert.type}`;
      if (state.simAlerts.some((a) => a.id === alertId)) return state;
      return {
        simAlerts: [{ ...alert, id: alertId }, ...state.simAlerts].slice(0, 50),
      };
    }),

  setWsConnected: (status) => set({ wsConnected: status }),

  dismissRealAlert: (id) =>
    set((state) => ({
      realAlerts: state.realAlerts.filter((a) => a.id !== id),
    })),

  dismissSimAlert: (id) =>
    set((state) => ({
      simAlerts: state.simAlerts.filter((a) => a.id !== id),
    })),

  clearRealAlerts: () => set({ realAlerts: [] }),
  clearSimAlerts: () => set({ simAlerts: [] }),
  clearAll: () => set({ realAlerts: [], simAlerts: [] }),
}));
