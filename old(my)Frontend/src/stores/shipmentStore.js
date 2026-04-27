import { create } from 'zustand';

export const useShipmentStore = create((set) => ({
  shipments: [],
  setShipments: (data) => set({ shipments: data }),
  updateShipment: (id, updates) => set((state) => ({
    shipments: state.shipments.map(s => 
      s.id === id ? { ...s, ...updates } : s
    )
  })),
}));
