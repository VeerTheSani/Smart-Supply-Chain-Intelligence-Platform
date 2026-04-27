import { create } from 'zustand';

/**
 * Countdown store — manages auto-reroute countdown state per shipment.
 * Populated by WebSocket events: countdown_started, countdown_update, 
 * countdown_cancelled, reroute_executed.
 * 
 * Status lifecycle: active → processing → (removed by completeCountdown)
 * Safety: processing state has a 30s timeout to prevent infinite stuck UI.
 */

const PROCESSING_TIMEOUT_MS = 30_000;

export const useCountdownStore = create((set, get) => ({
  // Map of shipment_id -> { seconds_remaining, seconds_total, shipment_name, status, expires_at, processing_since }
  countdowns: {},

  startCountdown: (shipmentId, shipmentName, secondsRemaining, secondsTotal = 120) =>
    set((state) => {
      const existing = state.countdowns[shipmentId];
      if (existing && existing.status === 'active') {
        return state; // already active — ignore stale countdown_started
      }
      return {
        countdowns: {
          ...state.countdowns,
          [shipmentId]: {
            shipment_name: shipmentName,
            expires_at: Date.now() + secondsRemaining * 1000,
            seconds_remaining: secondsRemaining,
            seconds_total: secondsTotal || 120,
            status: 'active',
          },
        },
      };
    }),

  /**
   * Local tick: called with NO serverSecondsRemaining (just shipmentId).
   * Recomputes remaining from expires_at. Transitions to 'processing' at 0.
   */
  tickCountdown: (shipmentId) =>
    set((state) => {
      const existing = state.countdowns[shipmentId];
      if (!existing || !existing.expires_at || existing.status !== 'active') return state;

      const remaining = Math.max(0, Math.floor((existing.expires_at - Date.now()) / 1000));

      if (remaining === 0) {
        return {
          countdowns: {
            ...state.countdowns,
            [shipmentId]: {
              ...existing,
              seconds_remaining: 0,
              status: 'processing',
              processing_since: Date.now(),
            },
          },
        };
      }

      return {
        countdowns: {
          ...state.countdowns,
          [shipmentId]: { ...existing, seconds_remaining: remaining },
        },
      };
    }),

  /**
   * Server sync: called from WebSocket countdown_update with server data.
   * Recovers missing countdowns after refresh. Resyncs expires_at from server truth.
   */
  syncFromServer: (shipmentId, serverSecondsRemaining, shipmentName) =>
    set((state) => {
      const existing = state.countdowns[shipmentId];

      // Recovery: countdown doesn't exist locally (e.g. after page refresh)
      if (!existing) {
        if (serverSecondsRemaining !== undefined && serverSecondsRemaining > 0) {
          return {
            countdowns: {
              ...state.countdowns,
              [shipmentId]: {
                shipment_name: shipmentName || `Shipment ${shipmentId.slice(-6)}`,
                expires_at: Date.now() + serverSecondsRemaining * 1000,
                seconds_remaining: serverSecondsRemaining,
                seconds_total: 120,
                status: 'active',
              },
            },
          };
        }
        return state;
      }

      // If already processing, don't overwrite — wait for reroute_executed
      if (existing.status === 'processing') return state;

      // Resync expires_at from server to correct any local drift
      if (serverSecondsRemaining !== undefined && serverSecondsRemaining > 0) {
        return {
          countdowns: {
            ...state.countdowns,
            [shipmentId]: {
              ...existing,
              expires_at: Date.now() + serverSecondsRemaining * 1000,
              seconds_remaining: serverSecondsRemaining,
            },
          },
        };
      }

      return state;
    }),

  cancelCountdown: (shipmentId) =>
    set((state) => {
      if (!state.countdowns[shipmentId]) return state;
      const copy = { ...state.countdowns };
      delete copy[shipmentId];
      return { countdowns: copy };
    }),

  completeCountdown: (shipmentId) =>
    set((state) => {
      if (!state.countdowns[shipmentId]) return state;
      const copy = { ...state.countdowns };
      delete copy[shipmentId];
      return { countdowns: copy };
    }),

  /**
   * Safety sweep: removes any countdown stuck in 'processing' for > 30s.
   * Called periodically to prevent infinite UI states.
   */
  sweepStaleProcessing: () =>
    set((state) => {
      const now = Date.now();
      let changed = false;
      const copy = { ...state.countdowns };

      for (const [id, cd] of Object.entries(copy)) {
        if (cd.status === 'processing' && cd.processing_since && (now - cd.processing_since > PROCESSING_TIMEOUT_MS)) {
          delete copy[id];
          changed = true;
        }
      }

      return changed ? { countdowns: copy } : state;
    }),

  getCountdown: (shipmentId) => get().countdowns[shipmentId] || null,
}));
