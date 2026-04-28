import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * ========================================
 * NOTIFICATION PREFERENCES STORE
 * ========================================
 * Persisted to localStorage.
 * Controls user-facing notification behaviors:
 * - Sound alerts (per severity)
 * - Desktop notifications (browser API)
 * - Auto-dismiss timing per severity
 * - Muted alert types
 * - Toast (popup) enable/disable
 */

const DEFAULT_PREFS = {
  // Sound
  soundEnabled: true,
  soundVolume: 0.5,            // 0.0 - 1.0

  // Desktop Notifications
  desktopEnabled: false,       // requires browser permission
  desktopPermission: 'default', // 'default', 'granted', 'denied'

  // Toast Popups
  toastsEnabled: true,

  // Auto-dismiss timing (seconds per severity)
  autoDismissTimings: {
    low: 3,
    medium: 3,
    high: 3,
    critical: 3,
  },

  // Muted alert types (set of type strings)
  mutedTypes: [],
};

export const useNotificationPrefsStore = create(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFS,

      // --- Setters ---

      setSoundEnabled: (enabled) => set({ soundEnabled: !!enabled }),

      setSoundVolume: (vol) => set({ soundVolume: Math.max(0, Math.min(1, vol)) }),

      setDesktopEnabled: (enabled) => set({ desktopEnabled: !!enabled }),

      setDesktopPermission: (perm) => set({ desktopPermission: perm }),

      setToastsEnabled: (enabled) => set({ toastsEnabled: !!enabled }),

      setAutoDismissTiming: (severity, seconds) =>
        set((state) => ({
          autoDismissTimings: {
            ...state.autoDismissTimings,
            [severity]: Math.max(1, Math.min(30, seconds)),
          },
        })),

      toggleMutedType: (type) =>
        set((state) => {
          const muted = new Set(state.mutedTypes);
          if (muted.has(type)) {
            muted.delete(type);
          } else {
            muted.add(type);
          }
          return { mutedTypes: Array.from(muted) };
        }),

      isMuted: (type) => get().mutedTypes.includes(type),

      // Get the auto-dismiss time for a given severity
      getAutoDismissSeconds: (severity) => {
        const s = (severity || 'medium').toLowerCase();
        return get().autoDismissTimings[s] || get().autoDismissTimings.medium;
      },

      // Request desktop notification permission
      requestDesktopPermission: async () => {
        if (typeof Notification === 'undefined') {
          set({ desktopPermission: 'denied', desktopEnabled: false });
          return 'denied';
        }
        try {
          const result = await Notification.requestPermission();
          set({
            desktopPermission: result,
            desktopEnabled: result === 'granted',
          });
          return result;
        } catch {
          set({ desktopPermission: 'denied', desktopEnabled: false });
          return 'denied';
        }
      },

      // Reset to defaults
      resetPrefs: () => set(DEFAULT_PREFS),
    }),
    {
      name: 'ssc-notification-prefs', // localStorage key
      version: 1,
    }
  )
);
