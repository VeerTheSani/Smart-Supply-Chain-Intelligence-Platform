import { create } from 'zustand';

/**
 * ========================================
 * UNIFIED ALERT STORE
 * ========================================
 * Single source of truth for all alerts (real + simulator).
 * All WebSocket events → Zustand → UI components
 *
 * Structure:
 * - allAlerts: Combined chronological list of ALL alerts (100 max)
 * - realAlerts: Filtered view of production alerts (50 max, for popup)
 * - simAlerts: Filtered view of simulator alerts
 * - wsConnected: Connection status
 */

function normalizeAlert(alert) {
  return {
    id: alert.id || `${alert.timestamp}-${alert.shipment_id || alert.scenario_id}-${alert.type}`,
    type: alert.type,
    severity: alert.level || alert.severity || 'medium',
    source: alert.source || 'REAL_SYSTEM',
    timestamp: alert.timestamp || new Date().toISOString(),
    message: alert.message || 'Alert detected',
    shipment_id: alert.shipment_id,
    shipment_name: alert.shipment_name,
    scenario_id: alert.scenario_id,
    title: alert.title || alert.message?.split('\n')[0],
    read: alert.read || false,
    popupDismissed: alert.popupDismissed || false, // New: track if dismissed from popup
    ...alert,
  };
}

export const useAlertStore = create((set) => ({
  // UNIFIED: All alerts in chronological order
  allAlerts: [],

  // REAL SYSTEM ALERTS - Production logic (for popup)
  realAlerts: [],

  // SIMULATOR ALERTS - Scenario Lab only (for popup)
  simAlerts: [],

  wsConnected: false,

  /**
   * PRIMARY METHOD: Add alert to unified store.
   * Automatically deduplicates and categorizes by source.
   */
  addAlert: (alert) =>
    set((state) => {
      if (!alert) return state;

      const normalized = normalizeAlert(alert);
      const alertId = normalized.id;

      // Check if already exists
      if (state.allAlerts.some((a) => a.id === alertId)) {
        return state;
      }

      // Add to unified list (newest first)
      const updated = [normalized, ...state.allAlerts].slice(0, 100);

      // Categorize for popups (only unread and not dismissed)
      const realAlerts = updated
        .filter((a) => a.source === 'REAL_SYSTEM' && !a.read && !a.popupDismissed)
        .slice(0, 50);
      const simAlerts = updated
        .filter((a) => a.source === 'SIMULATOR' && !a.read && !a.popupDismissed)
        .slice(0, 50);

      return {
        allAlerts: updated,
        realAlerts,
        simAlerts,
      };
    }),

  // LEGACY: Add alert to REAL system (redirects to addAlert)
  addRealAlert: (alert) =>
    set((state) => {
      const normalized = normalizeAlert({ ...alert, source: 'REAL_SYSTEM' });
      const alertId = normalized.id;

      if (state.allAlerts.some((a) => a.id === alertId)) {
        return state;
      }

      const updated = [normalized, ...state.allAlerts].slice(0, 100);
      const realAlerts = updated
        .filter((a) => a.source === 'REAL_SYSTEM')
        .slice(0, 50);
      const simAlerts = updated
        .filter((a) => a.source === 'SIMULATOR')
        .slice(0, 50);

      return {
        allAlerts: updated,
        realAlerts,
        simAlerts,
      };
    }),

  // LEGACY: Add alert to SIMULATOR (redirects to addAlert)
  addSimAlert: (alert) =>
    set((state) => {
      const normalized = normalizeAlert({ ...alert, source: 'SIMULATOR' });
      const alertId = normalized.id;

      if (state.simAlerts.some((a) => a.id === alertId)) {
        return state;
      }

      const updated = [normalized, ...state.allAlerts].slice(0, 100);
      const realAlerts = updated
        .filter((a) => a.source === 'REAL_SYSTEM')
        .slice(0, 50);
      const simAlerts = updated
        .filter((a) => a.source === 'SIMULATOR')
        .slice(0, 50);

      return {
        allAlerts: updated,
        realAlerts,
        simAlerts,
      };
    }),

  setWsConnected: (status) => set({ wsConnected: status }),

  dismissAlert: (id) =>
    set((state) => {
      const updated = state.allAlerts.filter((a) => a.id !== id);
      return {
        allAlerts: updated,
        realAlerts: updated.filter((a) => a.source === 'REAL_SYSTEM'),
        simAlerts: updated.filter((a) => a.source === 'SIMULATOR'),
      };
    }),

  dismissRealAlert: (id) =>
    set((state) => {
      const updated = state.allAlerts.filter((a) => a.id !== id);
      return {
        allAlerts: updated,
        realAlerts: updated.filter((a) => a.source === 'REAL_SYSTEM'),
        simAlerts: updated.filter((a) => a.source === 'SIMULATOR'),
      };
    }),

  dismissSimAlert: (id) =>
    set((state) => {
      const updated = state.allAlerts.filter((a) => a.id !== id);
      return {
        allAlerts: updated,
        realAlerts: updated.filter((a) => a.source === 'REAL_SYSTEM' && !a.read && !a.popupDismissed),
        simAlerts: updated.filter((a) => a.source === 'SIMULATOR' && !a.read && !a.popupDismissed),
      };
    }),

  // DISMISS FROM POPUP ONLY (keeps as unread)
  dismissPopup: (id) =>
    set((state) => {
      const updated = state.allAlerts.map((a) =>
        a.id === id ? { ...a, popupDismissed: true } : a
      );
      return {
        allAlerts: updated,
        realAlerts: updated.filter((a) => a.source === 'REAL_SYSTEM' && !a.read && !a.popupDismissed),
        simAlerts: updated.filter((a) => a.source === 'SIMULATOR' && !a.read && !a.popupDismissed),
      };
    }),

  // MARK AS READ (with backend sync)
  markAlertAsRead: async (id) => {
    set((state) => ({
      allAlerts: state.allAlerts.map((a) =>
        a.id === id ? { ...a, read: true } : a
      ),
      realAlerts: state.realAlerts.filter((a) => a.id !== id),
      simAlerts: state.simAlerts.filter((a) => a.id !== id),
    }));

    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to sync read status', e);
    }
  },

  // MARK ALL AS READ (with backend sync)
  markAllAsRead: async () => {
    set((state) => ({
      allAlerts: state.allAlerts.map((a) => ({ ...a, read: true })),
      realAlerts: [],
      simAlerts: [],
    }));

    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
    } catch (e) {
      console.error('Failed to mark all as read', e);
    }
  },

  // FETCH FROM BACKEND
  fetchNotifications: async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const docs = await res.json();
      
      set((state) => {
        // Merge with existing alerts (deduplicate by id)
        const existingIds = new Set(state.allAlerts.map(a => a.id));
        const newAlerts = docs
          .map(doc => normalizeAlert({ ...doc, id: doc._id }))
          .filter(a => !existingIds.has(a.id));
        
        const combined = [...newAlerts, ...state.allAlerts]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 100);

        return {
          allAlerts: combined,
          realAlerts: combined.filter(a => a.source === 'REAL_SYSTEM' && !a.read && !a.popupDismissed).slice(0, 50),
          simAlerts: combined.filter(a => a.source === 'SIMULATOR' && !a.read && !a.popupDismissed).slice(0, 50),
        };
      });
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  },

  // GET UNREAD COUNT
  getUnreadCount: () => {
    const state = useAlertStore.getState();
    return state.allAlerts.filter((a) => !a.read).length;
  },

  // CLEAR HISTORY (all read alerts)
  clearHistory: () =>
    set((state) => {
      const unread = state.allAlerts.filter((a) => !a.read);
      return {
        allAlerts: unread,
        realAlerts: unread.filter((a) => a.source === 'REAL_SYSTEM'),
        simAlerts: unread.filter((a) => a.source === 'SIMULATOR'),
      };
    }),

  clearAll: () =>
    set({
      allAlerts: [],
      realAlerts: [],
      simAlerts: [],
    }),

  clearRealAlerts: () =>
    set((state) => {
      const updated = state.allAlerts.filter((a) => a.source === 'SIMULATOR');
      return {
        allAlerts: updated,
        realAlerts: [],
        simAlerts: updated,
      };
    }),

  clearSimAlerts: () =>
    set((state) => {
      const updated = state.allAlerts.filter((a) => a.source === 'REAL_SYSTEM');
      return {
        allAlerts: updated,
        realAlerts: updated,
        simAlerts: [],
      };
    }),
}));
