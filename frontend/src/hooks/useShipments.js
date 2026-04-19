import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchShipments, createShipment, fetchRerouteData } from '../api/shipmentApi';

/**
 * Hook for fetching and managing all shipments.
 * Includes real-time polling every 5s.
 */
export const useShipments = () => {
  return useQuery({
    queryKey: ['shipments'],
    queryFn: fetchShipments,
    staleTime: 5000, 
    refetchInterval: 5000,
  });
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
