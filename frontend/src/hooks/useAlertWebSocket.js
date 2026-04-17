import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAlertStore } from '../stores/alertStore';
import { BASE_URL } from '../config/api';
import toast from 'react-hot-toast';

export const useAlertWebSocket = () => {
  const queryClient = useQueryClient();
  const { addAlert, setWsConnected } = useAlertStore();
  const wsRef = useRef(null);
  const reconnectTimeout = useRef(null);

  useEffect(() => {
    const connect = () => {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/ws/alerts';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
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
                  return {
                    ...shipment,
                    risk: { ...shipment.risk, current: { risk_level: data.level, reason: data.message } },
                  };
                }
                return shipment;
              });
            });
          }
        } catch (e) {
          console.error("WS parse error", e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        reconnectTimeout.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [addAlert, setWsConnected, queryClient]);
};
