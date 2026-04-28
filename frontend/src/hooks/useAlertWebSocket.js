import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAlertStore } from '../stores/alertStore';
import { useCountdownStore } from '../stores/countdownStore';
import { BASE_URL } from '../config/api';
import { getWebSocket } from '../services/websocketSingleton';
import toast from 'react-hot-toast';

const API_KEY = import.meta.env.VITE_API_KEY || 'sc-dev-key-2026';

/**
 * ========================================
 * MESSAGE VALIDATION — Strict Event Contract
 * ========================================
 * Every message MUST have:
 * - type (required)
 * - source: "REAL_SYSTEM" | "SIMULATOR"
 * - timestamp (required)
 */

function validateMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    return { isValid: false, error: 'Message must be an object' };
  }

  // Required fields
  if (!msg.type) return { isValid: false, error: 'Missing type field' };
  if (!msg.source) return { isValid: false, error: 'Missing source field' };
  if (!msg.timestamp) return { isValid: false, error: 'Missing timestamp field' };

  // Validate source
  if (!['REAL_SYSTEM', 'SIMULATOR'].includes(msg.source)) {
    return { isValid: false, error: `Invalid source: ${msg.source}` };
  }

  // Valid message types
  const validTypes = [
    'risk_alert',
    'countdown_started',
    'countdown_update',
    'countdown_cancelled',
    'reroute_executed',
    'decision_triggered',
    'scenario_update',
    'gps_stuck',
    'api_failure',
  ];

  if (!validTypes.includes(msg.type)) {
    return { isValid: false, error: `Unknown message type: ${msg.type}` };
  }

  // Type-specific validation
  if (msg.type === 'risk_alert') {
    if (!msg.shipment_id) return { isValid: false, error: 'risk_alert: missing shipment_id' };
    if (!msg.level) return { isValid: false, error: 'risk_alert: missing level' };
  }

  return { isValid: true, error: null };
}

/**
 * ========================================
 * HANDLER: REAL SYSTEM ALERTS
 * ========================================
 */
function handleRealAlert(msg, callbacks) {
  const { type } = msg;

  switch (type) {
    case 'risk_alert':
      callbacks.addRealAlert({
        id: `${msg.timestamp}-${msg.shipment_id}`,
        ...msg,
      });

      if (msg.level === 'high' || msg.level === 'critical') {
        toast.error(
          `[REAL] Risk Alert: ${msg.message} (${msg.shipment_id.slice(-6)})`,
          { id: msg.shipment_id, duration: 5000 }
        );
      } else if (msg.level === 'medium') {
        toast(
          `[REAL] Risk Warning: ${msg.message} (${msg.shipment_id.slice(-6)})`,
          { id: msg.shipment_id, icon: '⚠️', duration: 4000 }
        );
      }

      // Update shipment in query cache
      callbacks.queryClient.setQueryData(['shipments'], (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((shipment) => {
          if (shipment.id === msg.shipment_id) {
            if (msg.timestamp && shipment.updated_at && msg.timestamp < shipment.updated_at)
              return shipment;
            return {
              ...shipment,
              updated_at: msg.timestamp || shipment.updated_at,
              risk: {
                ...shipment.risk,
                current: {
                  ...shipment.risk.current,
                  risk_level: msg.level,
                  risk_score: msg.score ?? shipment.risk.current?.risk_score,
                  reason: msg.message,
                },
              },
            };
          }
          return shipment;
        });
      });
      break;

    case 'countdown_started':
      callbacks.startCountdown(
        msg.shipment_id,
        msg.shipment_name,
        msg.seconds_remaining,
        msg.seconds_remaining
      );
      toast(
        `Auto-reroute countdown: ${msg.shipment_name || msg.shipment_id.slice(-6)}`,
        { icon: '⏱️', duration: 4000, id: `cd-${msg.shipment_id}` }
      );
      callbacks.queryClient.invalidateQueries({ queryKey: ['shipments'] });
      break;

    case 'countdown_update':
      callbacks.syncFromServer(msg.shipment_id, msg.seconds_remaining, msg.shipment_name);
      break;

    case 'countdown_cancelled':
      callbacks.cancelCountdown(msg.shipment_id);
      toast(`Countdown cancelled`, { icon: '✅', duration: 3000, id: `cd-cancel-${msg.shipment_id}` });
      break;

    case 'reroute_executed':
      callbacks.completeCountdown(msg.shipment_id);
      if (msg.success) {
        toast.success(
          `Auto-reroute executed for ${msg.shipment_name || msg.shipment_id.slice(-6)}`,
          { duration: 5000, id: `rr-${msg.shipment_id}` }
        );
      } else {
        toast.error(
          `Auto-reroute failed for ${msg.shipment_name || msg.shipment_id.slice(-6)}`,
          { duration: 5000, id: `rr-${msg.shipment_id}` }
        );
      }
      callbacks.queryClient.invalidateQueries({ queryKey: ['shipments'] });
      break;

    case 'gps_stuck':
      toast(
        msg.message || `GPS stuck: ${msg.shipment_name || msg.shipment_id?.slice(-6)} — monitor manually`,
        {
          icon: '📍',
          duration: 7000,
          id: `gps-stuck-${msg.shipment_id}`,
          style: { background: '#7c3aed', color: '#fff' },
        }
      );
      callbacks.addRealAlert({
        id: `gps-${msg.timestamp}-${msg.shipment_id}`,
        ...msg,
      });
      break;

    case 'api_failure':
      toast.error(
        `${msg.message} (${msg.service_name})`,
        { id: `api-fail-${msg.service_name}-${msg.shipment_id}`, duration: 7000 }
      );
      callbacks.addRealAlert({
        id: `apifail-${msg.timestamp}-${msg.shipment_id || msg.service_name}`,
        ...msg,
      });
      break;

    default:
      console.warn(`[WS] Unhandled real alert type: ${type}`);
  }
}

/**
 * ========================================
 * HANDLER: SIMULATOR ALERTS
 * ========================================
 * SIM alerts are NEVER applied to real data.
 * They only appear in the SIM panel.
 */
function handleSimulatorAlert(msg, callbacks) {
  const { type } = msg;

  switch (type) {
    case 'risk_alert':
      callbacks.addSimAlert({
        id: `sim-${msg.timestamp}-${msg.shipment_id}`,
        ...msg,
      });
      toast(
        `[SIM] Scenario triggered: ${msg.message}`,
        { icon: '🧪', duration: 3000, id: `sim-${msg.shipment_id}` }
      );
      break;

    case 'scenario_update':
      callbacks.addSimAlert({
        id: `scenario-${msg.timestamp}-${msg.scenario_id}`,
        ...msg,
      });
      toast(
        `[SIM] ${msg.scenario_name}: ${msg.message}`,
        { icon: '🧪', duration: 3000 }
      );
      break;

    case 'countdown_started':
      callbacks.addSimAlert({
        id: `sim-countdown-${msg.shipment_id}`,
        ...msg,
      });
      break;

    case 'reroute_executed':
      callbacks.addSimAlert({
        id: `sim-reroute-${msg.shipment_id}`,
        ...msg,
      });
      break;

    default:
      console.warn(`[WS] Unhandled simulator alert type: ${type}`);
  }
}

/**
 * ========================================
 * MAIN HOOK
 * ========================================
 */
export const useAlertWebSocket = () => {
  const queryClient = useQueryClient();
  const { addRealAlert, addSimAlert, setWsConnected } = useAlertStore();
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

  // Callbacks ref to avoid re-triggering effect
  const callbacksRef = useRef({
    addRealAlert,
    addSimAlert,
    setWsConnected,
    queryClient,
    startCountdown,
    syncFromServer,
    cancelCountdown,
    completeCountdown,
    sweepStaleProcessing,
  });

  useEffect(() => {
    callbacksRef.current = {
      addRealAlert,
      addSimAlert,
      setWsConnected,
      queryClient,
      startCountdown,
      syncFromServer,
      cancelCountdown,
      completeCountdown,
      sweepStaleProcessing,
    };
  }, [addRealAlert, addSimAlert, setWsConnected, queryClient, startCountdown, syncFromServer, cancelCountdown, completeCountdown, sweepStaleProcessing]);

  // Sweep stale processing every 10s
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

      // Guard against duplicate hook usage
      if (window.__WS_CONNECTED__) {
        console.warn('[WS] Hook already active. Preventing duplicate.');
        return;
      }
      window.__WS_CONNECTED__ = true;

      // Prevent duplicate connects
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const ws = getWebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) {
          ws.close();
          return;
        }
        reconnectAttemptsRef.current = 0;
        callbacksRef.current.setWsConnected(true);

        // Clear dedup cache and refetch on reconnect
        processedEvents.current.clear();
        callbacksRef.current.queryClient.refetchQueries({ queryKey: ['shipments'], type: 'active' });
        callbacksRef.current.queryClient.refetchQueries({ queryKey: ['notifications'], type: 'active' });

        console.log('[WS] Secure connection established');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ping' || data.type === 'pong') return;

          // Dedup based on timestamp + type + shipment_id
          const eventKey = data.timestamp ? `${data.type}-${data.shipment_id || data.scenario_id}-${data.timestamp}` : null;
          if (eventKey && processedEvents.current.has(eventKey)) return;
          if (eventKey) {
            processedEvents.current.add(eventKey);
            if (processedEvents.current.size > 200) {
              processedEvents.current.delete(processedEvents.current.values().next().value);
            }
          }

          // VALIDATE MESSAGE
          const { isValid, error } = validateMessage(data);
          if (!isValid) {
            console.error('[WS] Invalid message — details:', { error, received: data });
            toast.error(`WebSocket error: ${error}`, { duration: 3000 });
            return;
          }

          // ROUTE BY SOURCE
          const cb = callbacksRef.current;
          if (data.source === 'REAL_SYSTEM') {
            handleRealAlert(data, cb);
          } else if (data.source === 'SIMULATOR') {
            handleSimulatorAlert(data, cb);
          }
        } catch (e) {
          console.error('[WS] Parse error', e);
        }
      };

      ws.onclose = (event) => {
        callbacksRef.current.setWsConnected(false);
        wsRef.current = null;
        window.__WS_CONNECTED__ = false;

        if (!isMounted) return;

        // Don't reconnect on auth or server rejection
        if ([1008, 1013, 403].includes(event.code)) {
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

    connect();

    return () => {
      isMounted = false;
      window.__WS_CONNECTED__ = false;

      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);
};
