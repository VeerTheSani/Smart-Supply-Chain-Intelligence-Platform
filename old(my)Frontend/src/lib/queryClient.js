import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query client configured for real-time supply chain data.
 * - staleTime: 30s (data stays fresh for 30s before refetching)
 * - gcTime: 5min (garbage collect unused cache after 5min)
 * - retry: 2 attempts with exponential backoff
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
