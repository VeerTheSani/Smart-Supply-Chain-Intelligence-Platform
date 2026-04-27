import { BASE_URL } from '../config/api';

/**
 * API key for WebSocket authentication.
 * Must match the backend API_KEY env var.
 */
const API_KEY = import.meta.env.VITE_API_KEY || 'sc-dev-key-2026';

/**
 * Enterprise-grade WebSocket Service for real-time telemetry.
 * Handles automatic reconnection, event dispatching, and error recovery.
 */
class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    // Token appended as query param for WS auth
    this.url = BASE_URL.replace(/^http/, 'ws') + `/ws/alerts?token=${API_KEY}`;
  }

  connect(onMessage, onStatusChange) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      onStatusChange(true);
      console.log("[WS] Secure connection established");
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error("[WS] Parse error", e);
      }
    };

    this.ws.onclose = (event) => {
      onStatusChange(false);
      this.ws = null;
      // Code 1008 = Policy Violation (auth failed) — do NOT reconnect
      if (event.code === 1008) {
        console.error("[WS] Authentication rejected — will not reconnect");
        return;
      }
      this.attemptReconnect(onMessage, onStatusChange);
    };

    this.ws.onerror = () => {
      if (this.ws) this.ws.close();
    };
  }

  attemptReconnect(onMessage, onStatusChange) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(30000, Math.pow(2, this.reconnectAttempts) * 1000);
      console.log(`[WS] Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
      this.reconnectTimeout = setTimeout(() => this.connect(onMessage, onStatusChange), delay);
    }
  }

  disconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      this.ws.onclose = null; // Prevent auto-reconnect on manual close
      this.ws.close();
      this.ws = null;
    }
  }
}

export const webSocketService = new WebSocketService();
