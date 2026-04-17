import { memo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Error boundary fallback UI.
 * Shows error message with retry action.
 */
const ErrorFallback = memo(function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950 p-6">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-danger-500/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-danger-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-surface-100">
            Something went wrong
          </h2>
          <p className="text-sm text-surface-400 leading-relaxed">
            {error?.message || 'An unexpected error occurred. Please try again.'}
          </p>
        </div>
        {resetErrorBoundary && (
          <button
            onClick={resetErrorBoundary}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl 
                       gradient-primary text-white font-medium text-sm
                       hover:opacity-90 transition-opacity cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
});

export default ErrorFallback;
