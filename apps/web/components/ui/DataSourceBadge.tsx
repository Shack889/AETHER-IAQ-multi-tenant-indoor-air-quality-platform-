'use client';

import { cn } from '@/lib/utils';

interface Props {
  simulated: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function DataSourceBadge({ simulated, size = 'sm', className }: Props) {
  const sizeClass = size === 'sm'
    ? 'px-2 py-0.5 text-[10px]'
    : 'px-3 py-1 text-xs';

  if (simulated) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-semibold tracking-wider uppercase',
          sizeClass,
          'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
          className,
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
        Simulated
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold tracking-wider uppercase',
        sizeClass,
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Live Hardware
    </span>
  );
}
