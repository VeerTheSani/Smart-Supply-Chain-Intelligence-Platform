import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with clsx for conditional class names.
 * Prevents class conflicts and enables clean conditional styling.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
