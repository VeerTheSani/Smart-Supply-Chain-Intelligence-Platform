import { create } from 'zustand';

/**
 * Countdown store — manages auto-reroute countdown state per shipment.
 * Populated by WebSocket events: countdown_started, countdown_update, 
 * countdown_cancelled, reroute_executed.
 */
export const useCountdownStore = create((set, get) => ({
  // Map of shipment_id -> { seconds_remaining, seconds_total, shipment_name, status }
  countdowns: {},

  startCountdown: (shipmentId, shipmentName, secondsRemaining, secondsTotal = 120) =>
    set((state) => ({
      countdowns: {
        ...state.countdowns,
        [shipmentId]: {
          shipment_name: shipmentName,
          seconds_remaining: secondsRemaining,
          seconds_total: secondsTotal || 120,
          status: 'active',
        },
      },
    })),

  updateCountdown: (shipmentId, secondsRemaining) =>
    set((state) => {
      const existing = state.countdowns[shipmentId];
      if (!existing) return state;
      return {
        countdowns: {
          ...state.countdowns,
          [shipmentId]: { ...existing, seconds_remaining: secondsRemaining },
        },
      };
    }),

  cancelCountdown: (shipmentId) =>
    set((state) => {
      const copy = { ...state.countdowns };
      delete copy[shipmentId];
      return { countdowns: copy };
    }),

  completeCountdown: (shipmentId) =>
    set((state) => {
      const copy = { ...state.countdowns };
      delete copy[shipmentId];
      return { countdowns: copy };
    }),

  getCountdown: (shipmentId) => get().countdowns[shipmentId] || null,
}));
