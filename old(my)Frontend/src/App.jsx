import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { router } from './router';
import ErrorBoundary from './components/ErrorBoundary';
import PageLoader from './components/ui/PageLoader';

/**
 * Root App component — wraps the app with:
 * 1. ErrorBoundary for crash protection
 * 2. QueryClientProvider for TanStack Query
 * 3. Suspense for lazy-loaded route fallback
 * 4. RouterProvider for React Router v6
 */
function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<PageLoader />}>
          <RouterProvider router={router} />
        </Suspense>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
