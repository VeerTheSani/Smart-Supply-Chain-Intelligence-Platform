import { memo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Error boundary fallback UI.
 * Shows error message with retry action.
 */
const ErrorFallback = memo(function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-primary p-6">
      <div className="bg-theme-secondary rounded-2xl p-8 max-w-md w-full text-center space-y-6 border border-theme shadow-2xl">
        <div className="mx-auto w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center border border-danger/20">
          <AlertTriangle className="w-8 h-8 text-danger" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-theme-primary tracking-tight">
            System Logic Exception
          </h2>
          <p className="text-sm text-theme-secondary leading-relaxed">
            {error?.message || 'An unexpected telemetry error occurred. Please attempt to re-synchronize.'}
          </p>
        </div>
        {resetErrorBoundary && (
          <button
            onClick={resetErrorBoundary}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl 
                       bg-accent text-white font-bold text-sm
                       hover:opacity-90 transition-opacity cursor-pointer shadow-lg shadow-accent/20"
          >
            <RefreshCw className="w-4 h-4" />
            Re-synchronize Data Feeds
          </button>
        )}
      </div>
    </div>
  );
});

export default ErrorFallback;
