'use client';

import { useAetherStore, isNodePaused } from '@/lib/store';
import type { NodeInfo } from '@aether/shared';

/**
 * Returns the active node's source state plus a derived `paused` flag.
 *
 * `paused` is true when the user has disabled BOTH mock and hardware for the
 * active node — there's no data flowing. The dashboard uses this to render
 * gauges at zero, flatten chart series, and show a "paused" banner so the user
 * isn't fooled by stale snapshot values.
 *
 * Simulation nodes are never considered paused (the sim engine writes
 * regardless of the flags).
 */
export function useNodeSource(): {
  node: NodeInfo | undefined;
  mockEnabled: boolean;
  hardwareEnabled: boolean;
  paused: boolean;
} {
  const activeNodeId = useAetherStore((s) => s.activeNodeId);
  const nodes = useAetherStore((s) => s.nodes);
  const node = nodes.find((n) => n.nodeId === activeNodeId);
  return {
    node,
    mockEnabled: node?.mockEnabled ?? false,
    hardwareEnabled: node?.hardwareEnabled ?? true,
    paused: isNodePaused(node),
  };
}
