'use client';

import { Skeleton, MetricSkeleton, ChartSkeleton, GaugeSkeleton } from '@/components/ui/Skeleton';

export function LiveMonitorSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton width={140} height={20} />
          <Skeleton width={220} variant="text" />
        </div>
        <Skeleton width={140} height={32} />
      </div>

      {/* Gauge hero + event feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 surface-card p-6 flex items-center justify-center gap-10">
          <GaugeSkeleton size={200} />
          <GaugeSkeleton size={120} />
        </div>
        <div className="surface-card p-5 space-y-3">
          <Skeleton variant="text" width="50%" />
          <Skeleton height={18} />
          <Skeleton height={18} width="80%" />
          <Skeleton height={18} width="70%" />
        </div>
      </div>

      {/* 7 metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => <MetricSkeleton key={i} />)}
      </div>

      {/* 2 charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Compliance row */}
      <div className="surface-card p-5 space-y-3">
        <Skeleton variant="text" width="20%" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} width={88} height={28} />)}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <MetricSkeleton key={i} />)}
      </div>
    </div>
  );
}
