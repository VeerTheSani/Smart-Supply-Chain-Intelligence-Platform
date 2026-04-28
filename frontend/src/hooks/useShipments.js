import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchShipments, createShipment, updateShipment, deleteShipment, fetchRerouteData, scoreRerouteAlternatives, applyReroute } from '../api/shipmentApi';

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

/**
 * Hook for applying a concrete alternative route logic, completely bypassing current state.
 */
export const useApplyReroute = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => applyReroute(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shipments'] }),
  });
};
