import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchShipments, createShipment, fetchRerouteData } from '../api/shipmentApi';

import { useEffect } from 'react';
import { useCountdownStore } from '../stores/countdownStore';

/**
 * Hook for fetching and managing all shipments.
 * Includes real-time polling every 5s.
 */
export const useShipments = () => {
  const queryClient = useQueryClient();
  const cancelCountdown = useCountdownStore(s => s.cancelCountdown);

  const query = useQuery({
    queryKey: ['shipments'],
    queryFn: async () => {
      const newData = await fetchShipments();
      const oldData = queryClient.getQueryData(['shipments']);
      if (!oldData) return newData;
      
      // HTTP Freshness Guard: Prevent stale HTTP data from overwriting fresh WS data
      return newData.map(newS => {
        const oldS = oldData.find(s => s.id === newS.id);
        if (oldS?.updated_at && newS.updated_at && newS.updated_at < oldS.updated_at) {
          return oldS;
        }
        return newS;
      });
    },
    staleTime: 5000, 
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  // Cleanup completed and ghost shipments
  useEffect(() => {
    if (query.data) {
      const activeIds = new Set(query.data.map(s => s.id));
      
      query.data.forEach(s => {
        if (s.status === 'delivered') {
          cancelCountdown(s.id);
        }
      });
      
      const currentCountdowns = useCountdownStore.getState().countdowns;
      Object.keys(currentCountdowns).forEach(id => {
        if (!activeIds.has(id)) {
          cancelCountdown(id);
        }
      });
    }
  }, [query.data, cancelCountdown]);

  return query;
};

/**
 * Hook for creating a new shipment.
 */
export const useCreateShipment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createShipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
    },
  });
};

/**
 * Hook for fetching rerouting advice for a specific shipment.
 * @param {string} shipmentId 
 * @param {Object} options React Query options
 */
export const useRerouting = (shipmentId, options = {}) => {
  return useQuery({
    queryKey: ['reroute', shipmentId],
    queryFn: () => fetchRerouteData(shipmentId),
    enabled: !!shipmentId,
    retry: 1,
    ...options
  });
};
