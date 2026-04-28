import { create } from 'zustand';

/**
 * ========================================
 * UNIFIED ALERT STORE (ENHANCED v2)
 * ========================================
 * Single source of truth for all alerts (real + simulator).
 * All WebSocket events → Zustand → UI components
 *
 * Structure:
 * - allAlerts: Combined chronological list of ALL alerts (200 max)
 * - realAlerts: Filtered view of production alerts (for popup)
 * - simAlerts: Filtered view of simulator alerts (for popup)
 * - wsConnected: Connection status
 *
 * Enhanced Features:
 * - Flag/star important alerts
 * - Snooze with auto-resurface
 * - Export as CSV
 * - Duplicate detection helpers
 */

function normalizeAlert(alert) {
  if (!alert) return null;
  return {
    id: alert.id || `${alert.timestamp || Date.now()}-${alert.shipment_id || alert.scenario_id || 'sys'}-${alert.type || 'alert'}`,
    type: alert.type || 'system',
    severity: alert.level || alert.severity || 'medium',
    source: alert.source || 'REAL_SYSTEM',
    timestamp: alert.timestamp || new Date().toISOString(),
    message: alert.message || 'Alert detected',
    shipment_id: alert.shipment_id || null,
    shipment_name: alert.shipment_name || null,
    scenario_id: alert.scenario_id || null,
    title: alert.title || (alert.message ? alert.message.split('\n')[0] : 'Alert'),
    read: alert.read || false,
    popupDismissed: alert.popupDismissed || false,
    flagged: alert.flagged || false,
    snoozedUntil: alert.snoozedUntil || null,
    // Spread remaining fields (reason, factors, eta, etc.)
    ...alert,
  };
}

/** Helper: rebuild popup arrays from the main list */
function rebuildPopups(allAlerts) {
  return {
    realAlerts: allAlerts
      .filter((a) => a.source === 'REAL_SYSTEM' && !a.read && !a.popupDismissed && !isSnoozed(a))
      .slice(0, 50),
    simAlerts: allAlerts
      .filter((a) => a.source === 'SIMULATOR' && !a.read && !a.popupDismissed && !isSnoozed(a))
      .slice(0, 50),
  };
}

function isSnoozed(alert) {
  if (!alert.snoozedUntil) return false;
  return new Date(alert.snoozedUntil) > new Date();
}

export const useAlertStore = create((set, get) => ({
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
      if (!normalized) return state;
      const alertId = normalized.id;

      // Check if already exists (dedup)
      if (state.allAlerts.some((a) => a.id === alertId)) {
        return state;
      }

      // Add to unified list (newest first)
      const updated = [normalized, ...state.allAlerts].slice(0, 200);

      return {
        allAlerts: updated,
        ...rebuildPopups(updated),
      };
    }),

  // LEGACY: Add alert to REAL system
  addRealAlert: (alert) => {
    get().addAlert({ ...alert, source: 'REAL_SYSTEM' });
  },

  // LEGACY: Add alert to SIMULATOR
  addSimAlert: (alert) => {
    get().addAlert({ ...alert, source: 'SIMULATOR' });
  },

  setWsConnected: (status) => set({ wsConnected: status }),

  dismissAlert: (id) =>
    set((state) => {
      const updated = state.allAlerts.filter((a) => a.id !== id);
      return { allAlerts: updated, ...rebuildPopups(updated) };
    }),

  dismissRealAlert: (id) => get().dismissAlert(id),
  dismissSimAlert: (id) => get().dismissAlert(id),

  // DISMISS FROM POPUP ONLY (keeps as unread in panel)
  dismissPopup: (id) =>
    set((state) => {
      const updated = state.allAlerts.map((a) =>
        a.id === id ? { ...a, popupDismissed: true } : a
      );
      return { allAlerts: updated, ...rebuildPopups(updated) };
    }),

  // MARK AS READ (with backend sync)
  markAlertAsRead: async (id) => {
    set((state) => {
      const updated = state.allAlerts.map((a) =>
        a.id === id ? { ...a, read: true } : a
      );
      return { allAlerts: updated, ...rebuildPopups(updated) };
    });

    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    } catch (e) {
      // Silently fail — local state is still correct
    }
  },

  // MARK ALL AS READ (with backend sync)
  markAllAsRead: async () => {
    set((state) => {
      const updated = state.allAlerts.map((a) => ({ ...a, read: true }));
      return { allAlerts: updated, ...rebuildPopups(updated) };
    });

    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
    } catch (e) {
      // Silently fail
    }
  },

  // ========== FLAG / STAR ==========
  toggleFlag: (id) =>
    set((state) => ({
      allAlerts: state.allAlerts.map((a) =>
        a.id === id ? { ...a, flagged: !a.flagged } : a
      ),
    })),

  // ========== SNOOZE ==========
  snoozeAlert: (id, minutes) =>
    set((state) => {
      const until = new Date(Date.now() + minutes * 60000).toISOString();
      const updated = state.allAlerts.map((a) =>
        a.id === id ? { ...a, snoozedUntil: until, popupDismissed: true } : a
      );
      return { allAlerts: updated, ...rebuildPopups(updated) };
    }),

  unsnoozeAlert: (id) =>
    set((state) => {
      const updated = state.allAlerts.map((a) =>
        a.id === id ? { ...a, snoozedUntil: null, popupDismissed: false } : a
      );
      return { allAlerts: updated, ...rebuildPopups(updated) };
    }),

  // Check and resurface expired snoozes (call periodically)
  checkSnoozes: () =>
    set((state) => {
      const now = new Date();
      let changed = false;
      const updated = state.allAlerts.map((a) => {
        if (a.snoozedUntil && new Date(a.snoozedUntil) <= now) {
          changed = true;
          return { ...a, snoozedUntil: null, popupDismissed: false };
        }
        return a;
      });
      if (!changed) return state;
      return { allAlerts: updated, ...rebuildPopups(updated) };
    }),

  // FETCH FROM BACKEND
  fetchNotifications: async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const docs = await res.json();

      set((state) => {
        const existingIds = new Set(state.allAlerts.map((a) => a.id));
        const newAlerts = docs
          .map((doc) => normalizeAlert({ ...doc, id: doc._id }))
          .filter((a) => a && !existingIds.has(a.id));

        if (newAlerts.length === 0) return state;

        const combined = [...newAlerts, ...state.allAlerts]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 200);

        return {
          allAlerts: combined,
          ...rebuildPopups(combined),
        };
      });
    } catch (e) {
      // Silently fail — WebSocket is the primary source
    }
  },

  // GET UNREAD COUNT
  getUnreadCount: () => {
    const state = get();
    return state.allAlerts.filter((a) => !a.read).length;
  },

  // CLEAR HISTORY (all read alerts)
  clearHistory: () =>
    set((state) => {
      const unread = state.allAlerts.filter((a) => !a.read);
      return { allAlerts: unread, ...rebuildPopups(unread) };
    }),

  clearAll: () =>
    set({ allAlerts: [], realAlerts: [], simAlerts: [] }),

  clearRealAlerts: () =>
    set((state) => {
      const updated = state.allAlerts.filter((a) => a.source !== 'REAL_SYSTEM');
      return { allAlerts: updated, ...rebuildPopups(updated) };
    }),

  clearSimAlerts: () =>
    set((state) => {
      const updated = state.allAlerts.filter((a) => a.source !== 'SIMULATOR');
      return { allAlerts: updated, ...rebuildPopups(updated) };
    }),

  // ========== EXPORT AS CSV ==========
  exportAsCSV: () => {
    const state = get();
    const headers = ['Timestamp', 'Severity', 'Source', 'Type', 'Title', 'Message', 'Shipment ID', 'Status', 'Flagged'];
    const rows = state.allAlerts.map((a) => [
      a.timestamp || '',
      a.severity || '',
      a.source || '',
      a.type || '',
      (a.title || '').replace(/,/g, ';'),
      (a.message || '').replace(/,/g, ';').replace(/\n/g, ' '),
      a.shipment_id || '',
      a.read ? 'Read' : 'Unread',
      a.flagged ? 'Yes' : 'No',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ssc-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
}));
