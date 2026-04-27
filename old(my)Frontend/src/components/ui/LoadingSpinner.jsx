import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const DOT_VARIANTS = {
  bounce: (i) => ({
    y: ['0%', '-60%', '0%'],
    opacity: [0.4, 1, 0.4],
    transition: {
      duration: 0.7,
      repeat: Infinity,
      ease: 'easeInOut',
      delay: i * 0.12,
    },
  }),
};

/**
 * Synced bouncing dots loader.
 * Props:
 *   size   — 'sm' | 'md' (default) | 'lg'
 *   label  — optional text below dots
 *   color  — tailwind text color class (default: text-accent)
 */
const LoadingSpinner = memo(function LoadingSpinner({
  size = 'md',
  label,
  className,
  color = 'bg-accent',
}) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : size === 'lg' ? 'w-3 h-3' : 'w-2 h-2';
  const gap     = size === 'sm' ? 'gap-1'       : size === 'lg' ? 'gap-2.5'  : 'gap-1.5';

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div className={cn('flex items-center', gap)}>
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className={cn('rounded-full', dotSize, color)}
            custom={i}
            variants={DOT_VARIANTS}
            animate="bounce"
          />
        ))}
      </div>
      {label && (
        <p className="text-sm text-theme-secondary font-medium tracking-wide">{label}</p>
      )}
    </div>
  );
});

export default LoadingSpinner;
