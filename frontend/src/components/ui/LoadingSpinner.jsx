import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Reusable loading spinner with optional label.
 * Used as Suspense fallback and inline loading states.
 */
const LoadingSpinner = memo(function LoadingSpinner({ size = 24, className, label }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <Loader2
        size={size}
        className="animate-spin text-accent"
      />
      {label && (
        <p className="text-sm text-theme-secondary animate-pulse font-medium tracking-wide">{label}</p>
      )}
    </div>
  );
});

export default LoadingSpinner;
