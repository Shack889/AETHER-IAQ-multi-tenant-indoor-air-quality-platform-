'use client';

import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

/**
 * AETHER branded spinner — teal ring with accent arc.
 * Used for all loading states across the app.
 */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div className={cn('relative', sizeMap[size], className)}>
      <svg
        viewBox="0 0 36 36"
        className={cn('aether-spinner', sizeMap[size])}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background ring */}
        <circle cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="2.5" className="text-surface-3 opacity-40" />
        {/* Animated arc */}
        <circle
          cx="18" cy="18" r="15"
          stroke="url(#aether-grad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="60 36"
          strokeDashoffset="0"
        />
        <defs>
          <linearGradient id="aether-grad" x1="0" y1="0" x2="36" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-aether-400" />
      </div>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-surface-0">
      <Spinner size="lg" />
      <p className="text-sm text-secondary animate-pulse">Loading AETHER...</p>
    </div>
  );
}
