import apiClient from './apiClient';

/**
 * Fetches dashboard statistics and analytical data.
 */
export const fetchDashboardStats = async () => {
  const { data } = await apiClient.get('/api/dashboard');
  return data;
};
