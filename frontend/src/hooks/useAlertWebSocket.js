import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAlertStore } from '../stores/alertStore';
import { useCountdownStore } from '../stores/countdownStore';
import { webSocketService } from '../services/websocket';
import toast from 'react-hot-toast';

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

  const wsConnected = useAlertStore(state => state.wsConnected);
  const processedEvents = useRef(new Set());

  // Reconnect State Resync — force fresh data from backend on reconnect
  useEffect(() => {
    if (wsConnected) {
      // Clear dedup cache on reconnect so we don't ignore new events
      processedEvents.current.clear();
      queryClient.refetchQueries({ queryKey: ['shipments'], type: 'active' });
      queryClient.refetchQueries({ queryKey: ['notifications'], type: 'active' });
    }
  }, [wsConnected, queryClient]);

  // Processing timeout sweep — runs every 10s to catch stuck countdowns
  useEffect(() => {
    const sweepInterval = setInterval(() => {
      sweepStaleProcessing();
    }, 10_000);
    return () => clearInterval(sweepInterval);
  }, [sweepStaleProcessing]);

  useEffect(() => {
    const handleMessage = (data) => {
      // Idempotency guard — works with or without backend event_id
      const eventKey = data.event_id || `${data.type}-${data.shipment_id}-${data.timestamp}`;
      if (processedEvents.current.has(eventKey)) return;
      processedEvents.current.add(eventKey);
      if (processedEvents.current.size > 200) {
        processedEvents.current.delete(processedEvents.current.values().next().value);
      }

      // ── Existing: risk_alert ──────────────────────────────────────────
      if (data.type === 'risk_alert') {
        addAlert({ id: `${data.timestamp}-${data.shipment_id}`, ...data });

        // Additive Toast System
        if (data.level === 'high' || data.level === 'critical') {
          toast.error(
            `Risk Alert: ${data.message} (Shipment ${data.shipment_id.slice(-6)})`,
            {
              id: data.shipment_id, // prevents duplicate spam
              duration: 5000,
            }
          );
        } else if (data.level === 'medium') {
          toast(
            `Risk Warning: ${data.message} (Shipment ${data.shipment_id.slice(-6)})`,
            {
              id: data.shipment_id,
              icon: '⚠️',
              duration: 4000,
            }
          );
        }

        // Optimistic update of React Query cache
        queryClient.setQueryData(['shipments'], (oldData) => {
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

        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }

      // ── New: position_update ──────────────────────────────────────────
      if (data.type === 'position_update') {
        if (typeof data.lat !== 'number' || typeof data.lng !== 'number' ||
            !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) {
          return;
        }
        queryClient.setQueryData(['shipments'], (oldData) => {
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

      // ── New: countdown_started ────────────────────────────────────────
      if (data.type === 'countdown_started') {
        startCountdown(
          data.shipment_id,
          data.shipment_name,
          data.seconds_remaining,
          data.seconds_remaining
        );
        toast(
          `Auto-reroute countdown started for ${data.shipment_name || data.shipment_id.slice(-6)}`,
          { icon: '⏱️', duration: 4000, id: `cd-${data.shipment_id}` }
        );

        queryClient.invalidateQueries({ queryKey: ['shipments'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }

      // ── New: countdown_update ─────────────────────────────────────────
      if (data.type === 'countdown_update') {
        syncFromServer(data.shipment_id, data.seconds_remaining, data.shipment_name);
      }

      // ── New: countdown_cancelled ──────────────────────────────────────
      if (data.type === 'countdown_cancelled') {
        cancelCountdown(data.shipment_id);
        toast(`Countdown cancelled`, { icon: '✅', duration: 3000, id: `cd-cancel-${data.shipment_id}` });
      }

      // ── New: reroute_executed ─────────────────────────────────────────
      if (data.type === 'reroute_executed') {
        completeCountdown(data.shipment_id);

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

        // Refresh shipment data and notifications
        queryClient.invalidateQueries({ queryKey: ['shipments'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    };

    webSocketService.connect(handleMessage, setWsConnected);

    return () => {
      webSocketService.disconnect();
    };
  }, [addAlert, setWsConnected, queryClient, startCountdown, syncFromServer, cancelCountdown, completeCountdown, sweepStaleProcessing]);
};
