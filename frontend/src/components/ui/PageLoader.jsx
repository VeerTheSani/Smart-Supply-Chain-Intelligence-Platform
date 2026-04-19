import { memo } from 'react';
import LoadingSpinner from './LoadingSpinner';

/**
 * Full-page loading screen — used as React.lazy Suspense fallback.
 */
const PageLoader = memo(function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-theme-primary/80 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
          <div className="relative bg-theme-secondary rounded-full p-6 border border-theme shadow-xl">
            <LoadingSpinner size={32} />
          </div>
        </div>
        <p className="text-theme-secondary text-sm font-bold tracking-widest uppercase animate-pulse">
          Loading module...
        </p>
      </div>
    </div>
  );
});

export default PageLoader;
