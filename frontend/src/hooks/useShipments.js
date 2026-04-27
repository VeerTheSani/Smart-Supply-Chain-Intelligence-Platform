import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchShipments, createShipment, updateShipment, deleteShipment, fetchRerouteData, scoreRerouteAlternatives } from '../api/shipmentApi';

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
 * Hook for updating a shipment.
 */
export const useUpdateShipment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => updateShipment(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shipments'] }),
  });
};

/**
 * Hook for deleting a shipment.
 */
export const useDeleteShipment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => deleteShipment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shipments'] }),
  });
};

/**
 * Hook for fetching rerouting alternatives (fast — traffic only).
 */
export const useRerouting = (shipmentId, options = {}) => {
  return useQuery({
    queryKey: ['reroute', shipmentId],
    queryFn: () => fetchRerouteData(shipmentId),
    enabled: !!shipmentId,
    retry: 1,
    staleTime: Infinity,
    ...options,
  });
};

/**
 * Hook for on-demand full risk scoring (weather + traffic).
 */
export const useScoreReroute = () => {
  return useMutation({
    mutationFn: ({ id, alternatives }) => scoreRerouteAlternatives(id, alternatives),
  });
};
