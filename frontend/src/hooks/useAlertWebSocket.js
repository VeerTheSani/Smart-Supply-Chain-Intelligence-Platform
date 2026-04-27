import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAlertStore } from '../stores/alertStore';
import { useCountdownStore } from '../stores/countdownStore';
import { BASE_URL } from '../config/api';
import { getWebSocket } from '../services/websocketSingleton';
import toast from 'react-hot-toast';

const API_KEY = import.meta.env.VITE_API_KEY || 'sc-dev-key-2026';

export const useAlertWebSocket = () => {
  const queryClient = useQueryClient();
  const { addAlert, setWsConnected } = useAlertStore();
  const {
    startCountdown,
    syncFromServer,
    cancelCountdown,
    completeCountdown,
    sweepStaleProcessing,
  } = useCountdownStore();

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const processedEvents = useRef(new Set());
  
  // Use a ref for callbacks to avoid re-triggering the effect when they change
  const callbacksRef = useRef({
    addAlert, setWsConnected, queryClient, startCountdown, syncFromServer, cancelCountdown, completeCountdown, sweepStaleProcessing
  });

  // Optimize: Runs only when dependencies change, not on EVERY render
  useEffect(() => {
    callbacksRef.current = {
      addAlert, setWsConnected, queryClient, startCountdown, syncFromServer, cancelCountdown, completeCountdown, sweepStaleProcessing
    };
  }, [addAlert, setWsConnected, queryClient, startCountdown, syncFromServer, cancelCountdown, completeCountdown, sweepStaleProcessing]);

  // Processing timeout sweep — runs every 10s to catch stuck countdowns
  useEffect(() => {
    const sweepInterval = setInterval(() => {
      callbacksRef.current.sweepStaleProcessing();
    }, 10_000);
    return () => clearInterval(sweepInterval);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const url = BASE_URL.replace(/^http/, 'ws') + `/ws/alerts?token=${API_KEY}`;

    const connect = () => {
      if (!isMounted) return;

      // FIX 2: Guard against duplicate hook usage
      if (window.__WS_CONNECTED__) {
          console.warn("[WS] useAlertWebSocket hook already active. Preventing duplicate.");
          return;
      }
      window.__WS_CONNECTED__ = true;
      
      // Prevent duplicate connects if already open or connecting
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return; 
      }

      // FIX 1: Make WebSocket GLOBAL
      const ws = getWebSocket(url);
      wsRef.current = ws;
      
      // FIX 3: Debug logging
      console.log("WS instance:", wsRef.current);

      ws.onopen = () => {
        if (!isMounted) {
          ws.close();
          return;
        }
        reconnectAttemptsRef.current = 0;
        callbacksRef.current.setWsConnected(true);
        
        // Clear dedup cache on reconnect so we don't ignore new events
        processedEvents.current.clear();
        callbacksRef.current.queryClient.refetchQueries({ queryKey: ['shipments'], type: 'active' });
        callbacksRef.current.queryClient.refetchQueries({ queryKey: ['notifications'], type: 'active' });
        
        console.log("[WS] Secure connection established");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ping' || data.type === 'pong') return;
          handleMessage(data);
        } catch (e) {
          console.error("[WS] Parse error", e);
        }
      };

      ws.onclose = (event) => {
        callbacksRef.current.setWsConnected(false);
        wsRef.current = null;
        window.__WS_CONNECTED__ = false; // Release lock so reconnect can occur
        
        if (!isMounted) return;

        // Code 1008 = Policy Violation, 1013 = Server overload/rejection. DO NOT reconnect.
        if (event.code === 1008 || event.code === 1013 || event.code === 403) {
          console.error(`[WS] Server rejected connection (code ${event.code}) — will not reconnect`);
          return;
        }

        attemptReconnect();
      };

      ws.onerror = () => {
        // onerror will be followed by onclose
      };
    };

    const attemptReconnect = () => {
      if (reconnectAttemptsRef.current < 5) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(30000, Math.pow(2, reconnectAttemptsRef.current) * 1000);
        console.log(`[WS] Reconnecting in ${delay}ms... (Attempt ${reconnectAttemptsRef.current})`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    const handleMessage = (data) => {
      const cb = callbacksRef.current;
      const eventKey = data.event_id || `${data.type}-${data.shipment_id}-${data.timestamp}`;
      if (processedEvents.current.has(eventKey)) return;
      processedEvents.current.add(eventKey);
      if (processedEvents.current.size > 200) {
        processedEvents.current.delete(processedEvents.current.values().next().value);
      }

      // ── risk_alert ──────────────────────────────────────────
      if (data.type === 'risk_alert') {
        cb.addAlert({ id: `${data.timestamp}-${data.shipment_id}`, ...data });

        if (data.level === 'high' || data.level === 'critical') {
          toast.error(
            `Risk Alert: ${data.message} (Shipment ${data.shipment_id.slice(-6)})`,
            { id: data.shipment_id, duration: 5000 }
          );
        } else if (data.level === 'medium') {
          toast(
            `Risk Warning: ${data.message} (Shipment ${data.shipment_id.slice(-6)})`,
            { id: data.shipment_id, icon: '⚠️', duration: 4000 }
          );
        }

        cb.queryClient.setQueryData(['shipments'], (oldData) => {
          if (!oldData) return oldData;
          return oldData.map(shipment => {
            if (shipment.id === data.shipment_id) {
              if (data.timestamp && shipment.updated_at && data.timestamp < shipment.updated_at) return shipment;
              return {
                ...shipment,
                updated_at: data.timestamp || shipment.updated_at,
                risk: {
                  ...shipment.risk,
                  current: {
                    ...shipment.risk.current,
                    risk_level: data.level,
                    risk_score: data.score ?? shipment.risk.current?.risk_score,
                    reason: data.message,
                  },
                },
              };
            }
            return shipment;
          });
        });
        cb.queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }

      // ── position_update ──────────────────────────────────────────
      if (data.type === 'position_update') {
        if (typeof data.lat !== 'number' || typeof data.lng !== 'number' ||
            !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) {
          return;
        }
        cb.queryClient.setQueryData(['shipments'], (oldData) => {
          if (!oldData) return oldData;
          return oldData.map(shipment => {
            if (shipment.id === data.shipment_id) {
              if (data.timestamp && shipment.updated_at && data.timestamp < shipment.updated_at) return shipment;
              return {
                ...shipment,
                updated_at: data.timestamp || shipment.updated_at,
                current_location: { lat: data.lat, lng: data.lng }
              };
            }
            return shipment;
          });
        });
      }

      // ── countdown_started ────────────────────────────────────────
      if (data.type === 'countdown_started') {
        cb.startCountdown(
          data.shipment_id,
          data.shipment_name,
          data.seconds_remaining,
          data.seconds_remaining
        );
        toast(
          `Auto-reroute countdown started for ${data.shipment_name || data.shipment_id.slice(-6)}`,
          { icon: '⏱️', duration: 4000, id: `cd-${data.shipment_id}` }
        );

        cb.queryClient.invalidateQueries({ queryKey: ['shipments'] });
        cb.queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }

      // ── countdown_update ─────────────────────────────────────────
      if (data.type === 'countdown_update') {
        cb.syncFromServer(data.shipment_id, data.seconds_remaining, data.shipment_name);
      }

      // ── countdown_cancelled ──────────────────────────────────────
      if (data.type === 'countdown_cancelled') {
        cb.cancelCountdown(data.shipment_id);
        toast(`Countdown cancelled`, { icon: '✅', duration: 3000, id: `cd-cancel-${data.shipment_id}` });
      }

      // ── reroute_executed ─────────────────────────────────────────
      if (data.type === 'reroute_executed') {
        cb.completeCountdown(data.shipment_id);

        if (data.success) {
          toast.success(
            `Auto-reroute executed for ${data.shipment_name || data.shipment_id.slice(-6)}`,
            { duration: 5000, id: `rr-${data.shipment_id}` }
          );
        } else {
          toast.error(
            `Auto-reroute failed for ${data.shipment_name || data.shipment_id.slice(-6)}`,
            { duration: 5000, id: `rr-${data.shipment_id}` }
          );
        }

        cb.queryClient.invalidateQueries({ queryKey: ['shipments'] });
        cb.queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    };

    connect();

    return () => {
      isMounted = false;
      window.__WS_CONNECTED__ = false; // Release the global lock

      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent auto-reconnect on manual close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // Empty dependency array ensures connection logic only runs once
};
