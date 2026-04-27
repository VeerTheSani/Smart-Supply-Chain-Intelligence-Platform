import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAlertStore } from '../stores/alertStore';
import { webSocketService } from '../services/websocket';
import toast from 'react-hot-toast';

export const useAlertWebSocket = () => {
  const queryClient = useQueryClient();
  const { addAlert, setWsConnected } = useAlertStore();

  useEffect(() => {
    const handleMessage = (data) => {
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
    };

    webSocketService.connect(handleMessage, setWsConnected);

    return () => {
      webSocketService.disconnect();
    };
  }, [addAlert, setWsConnected, queryClient]);
};
