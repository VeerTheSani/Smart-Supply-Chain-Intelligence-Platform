import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../lib/apiClient';

export const useShipments = () => {
  return useQuery({
    queryKey: ['shipments'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/shipments');
      // REAL DATA ENFORCEMENT: Filter out any incomplete legacy DB objects
      if (!Array.isArray(data)) return [];
      
      const seenIds = new Set();
      
      return data.filter(shipment => {
        if (!shipment.id || !shipment.tracking_number) return false;
        if (!shipment.origin || !shipment.destination) return false;
        if (!shipment.current_location?.lat || !shipment.current_location?.lng) return false;
        if (!shipment.risk?.current?.risk_level) return false;
        
        // Prevent map marker duplication bugs
        if (seenIds.has(shipment.id)) return false;
        seenIds.add(shipment.id);
        
        return true;
      });
    },
    staleTime: 5000, 
    refetchInterval: 5000, // REAL-TIME SYNC: Poll every 5s natively
  });
};

export const useCreateShipment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post('/api/shipments', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
    },
  });
};

export const useRerouting = (shipmentId, options = {}) => {
  return useQuery({
    queryKey: ['reroute', shipmentId],
    queryFn: async () => {
      if (!shipmentId) return null;
      const { data } = await apiClient.get(`/api/reroute/${shipmentId}`);
      return data;
    },
    enabled: !!shipmentId,
    retry: 1,
    ...options
  });
};

export const useDashboard = () => {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/dashboard');
      return data;
    },
    refetchInterval: 30000, 
  });
};
