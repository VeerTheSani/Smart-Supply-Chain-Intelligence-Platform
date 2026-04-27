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
 * Updates a shipment partially (status, current_location, auto_reroute_enabled).
 * @param {string} id
 * @param {Object} payload
 */
export const updateShipment = async (id, payload) => {
  const { data } = await apiClient.patch(`/api/shipments/${id}`, payload);
  return data;
};

/**
 * Deletes a shipment by ID.
 * @param {string} id
 */
export const deleteShipment = async (id) => {
  await apiClient.delete(`/api/shipments/${id}`);
};

/**
 * Fetches rerouting options (fast — traffic only, no weather).
 * @param {string} shipmentId
 */
export const fetchRerouteData = async (shipmentId) => {
  if (!shipmentId) return null;
  const { data } = await apiClient.get(`/api/reroute/${shipmentId}`, { timeout: 30000 });
  return data;
};

/**
 * On-demand full risk scoring (weather + traffic) for alternatives.
 * @param {string} shipmentId
 * @param {Array}  alternatives  — from the initial fetchRerouteData response
 */
export const scoreRerouteAlternatives = async (shipmentId, alternatives) => {
  const { data } = await apiClient.post(
    `/api/reroute/${shipmentId}/score`,
    { alternatives },
    { timeout: 60000 },
  );
  return data;
};
