import { useQuery } from '@tanstack/react-query';
import { fetchDashboardStats } from '../api/dashboardApi';

/**
 * Hook for fetching dashboard analytics and performance metrics.
 * Refetches every 30s.
 */
export const useDashboard = () => {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboardStats,
    refetchInterval: 30000, 
  });
};
