import { create } from 'zustand';

export const useAlertStore = create((set) => ({
  alerts: [],
  wsConnected: false,
  addAlert: (alert) => set((state) => {
    // Prevent duplicate exact alerts if triggered simultaneously 
    if (state.alerts.some(a => a.id === alert.id)) return state;
    return { alerts: [alert, ...state.alerts].slice(0, 50) };
  }),
  setWsConnected: (status) => set({ wsConnected: status }),
  dismissAlert: (id) => set((state) => ({
    alerts: state.alerts.filter((a) => a.id !== id)
  })),
  clearAlerts: () => set({ alerts: [] }),
}));
