/**
 * ========================================
 * NOTIFICATION SOUND & DESKTOP UTILITY
 * ========================================
 * Provides safe wrappers for:
 * - Playing audio notifications (Web Audio API fallback)
 * - Sending browser desktop notifications
 *
 * All methods are safe to call even if APIs are unavailable.
 */

// Audio context singleton (lazy-initialized on first user interaction)
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/**
 * Play a synthetic notification tone using Web Audio API.
 * No external sound files required — generates tones procedurally.
 *
 * @param {'low'|'medium'|'high'|'critical'} severity
 * @param {number} volume - 0.0 to 1.0
 */
export function playNotificationSound(severity = 'medium', volume = 0.5) {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    // Different tones per severity
    const configs = {
      low: { freq: 440, duration: 0.15, type: 'sine' },
      medium: { freq: 600, duration: 0.2, type: 'sine' },
      high: { freq: 800, duration: 0.25, type: 'triangle' },
      critical: { freq: 900, duration: 0.4, type: 'square' },
    };

    const cfg = configs[severity] || configs.medium;

    const osc = ctx.createOscillator();
    osc.type = cfg.type;
    osc.frequency.setValueAtTime(cfg.freq, now);
    osc.connect(gain);

    // Volume envelope
    const safeVolume = Math.max(0, Math.min(1, volume)) * 0.3; // Cap max volume
    gain.gain.setValueAtTime(safeVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + cfg.duration);

    osc.start(now);
    osc.stop(now + cfg.duration + 0.05);

    // For critical: add a second beep
    if (severity === 'critical') {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      gain2.connect(ctx.destination);
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1100, now + 0.5);
      osc2.connect(gain2);
      gain2.gain.setValueAtTime(safeVolume * 0.8, now + 0.5);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc2.start(now + 0.5);
      osc2.stop(now + 1.0);
    }
  } catch {
    // Fail silently — audio is a nice-to-have
  }
}

/**
 * Show a browser desktop notification.
 * Safe to call even if permission is denied.
 *
 * @param {string} title
 * @param {string} body
 * @param {string} severity
 */
export function showDesktopNotification(title, body, severity = 'high') {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  try {
    const icons = {
      critical: '🚨',
      high: '⚠️',
      medium: '📋',
      low: '📌',
    };

    const icon = icons[severity] || '🔔';

    const notification = new Notification(`${icon} ${title}`, {
      body: body || 'New alert from Smart Supply Chain',
      tag: `ssc-${Date.now()}`, // Prevent stacking duplicates
      requireInteraction: severity === 'critical',
      silent: true, // We handle sound separately
    });

    // Auto-close after 8 seconds (except critical)
    if (severity !== 'critical') {
      setTimeout(() => {
        try { notification.close(); } catch { /* ignore */ }
      }, 8000);
    }

    // Focus the app on click
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Fail silently
  }
}
