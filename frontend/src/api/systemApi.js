import apiClient from './apiClient';

export const fetchSystemStatus = async () => {
  const { data } = await apiClient.get('/api/system/status');
  return data;
};
