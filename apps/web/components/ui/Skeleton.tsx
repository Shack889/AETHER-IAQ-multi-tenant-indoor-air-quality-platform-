'use client';

import { cn } from '@/lib/utils';

/**
 * Pulsing skeleton placeholder. Use while data loads — the spec is explicit
 * that no page should ever show blank white space.
 *
 * Compose multiple <Skeleton /> blocks inside a Card to mimic the eventual
 * layout (rect rows, circle for gauges, etc.) so the page doesn't reflow when
 * real content arrives.
 */
interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, variant = 'rect', width, height }: SkeletonProps) {
  const base = 'animate-pulse bg-surface-3/60';
  const shape =
    variant === 'circle' ? 'rounded-full' :
    variant === 'text'   ? 'rounded-md h-3' :
                            'rounded-lg';
  return (
    <div
      className={cn(base, shape, className)}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}

/** A skeleton block sized like a typical sensor metric card. */
export function MetricSkeleton() {
  return (
    <div className="surface-card p-5 flex flex-col gap-2 min-w-0">
      <Skeleton variant="text" width="40%" />
      <Skeleton height={36} width="60%" />
      <Skeleton variant="text" width="30%" />
    </div>
  );
}

/** A skeleton block sized like a chart card. */
export function ChartSkeleton({ height = 180 }: { height?: number }) {
  return (
    <div className="surface-card p-5 flex flex-col gap-3">
      <Skeleton variant="text" width="35%" />
      <Skeleton height={height} />
    </div>
  );
}

/** A skeleton block sized like a gauge card. */
export function GaugeSkeleton({ size = 180 }: { size?: number }) {
  return (
    <div className="surface-card p-5 flex flex-col items-center gap-3">
      <Skeleton variant="circle" width={size} height={size} />
      <Skeleton variant="text" width={80} />
      <Skeleton variant="text" width={48} />
    </div>
  );
}
