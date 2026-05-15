'use client';

import { PauseCircle } from 'lucide-react';
import { useNodeSource } from '@/hooks/useNodeSource';
import Link from 'next/link';

/**
 * Banner shown across dashboard pages when the active node has both data
 * sources disabled. Returns null otherwise so it can be sprinkled on every
 * page without affecting layout when not paused.
 */
export function PausedBanner() {
  const { node, paused } = useNodeSource();
  if (!paused) return null;
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl border"
      style={{
        background: 'linear-gradient(90deg, rgba(249, 115, 22, 0.12), rgba(249, 115, 22, 0.04))',
        borderColor: 'rgba(249, 115, 22, 0.35)',
        color: 'rgb(249, 115, 22)',
      }}
    >
      <PauseCircle size={18} />
      <div className="text-xs flex-1">
        <span className="font-semibold uppercase tracking-wider">Data sources paused</span>
        <span className="ml-2 text-muted">
          Both Mock and Hardware are off for <span className="font-data">{node?.nodeId ?? 'this node'}</span>.
          Gauges and charts will resume the moment you enable a source.
        </span>
      </div>
      <Link
        href="/dashboard/nodes"
        className="text-xs font-semibold underline hover:opacity-80"
      >
        Open Node Manager →
      </Link>
    </div>
  );
}
