import { create } from 'zustand';

export const useAlertStore = create((set) => ({
  alerts: [],
  wsConnected: false,
  addAlert: (alert) => set((state) => {
    const alertId = alert.id || `${alert.timestamp}-${alert.shipment_id}-${alert.type}`;
    if (state.alerts.some(a => a.id === alertId)) return state;
    return { alerts: [{ ...alert, id: alertId }, ...state.alerts].slice(0, 50) };
  }),
  setWsConnected: (status) => set({ wsConnected: status }),
  dismissAlert: (id) => set((state) => ({
    alerts: state.alerts.filter((a) => a.id !== id)
  })),
  clearAlerts: () => set({ alerts: [] }),
}));
