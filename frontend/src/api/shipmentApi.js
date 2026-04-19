import apiClient from './apiClient';

/**
 * Fetches all active shipments with legacy data filtering.
 */
export const fetchShipments = async () => {
  const { data } = await apiClient.get('/api/shipments');
  
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
};

/**
 * Creates a new shipment.
 * @param {Object} payload Shipment data
 */
export const createShipment = async (payload) => {
  const { data } = await apiClient.post('/api/shipments', payload);
  return data;
};

/**
 * Fetches rerouting options for a specific shipment.
 * @param {string} shipmentId 
 */
export const fetchRerouteData = async (shipmentId) => {
  if (!shipmentId) return null;
  const { data } = await apiClient.get(`/api/reroute/${shipmentId}`);
  return data;
};
