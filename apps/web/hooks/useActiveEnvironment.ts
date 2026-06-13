'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAetherStore } from '@/lib/store';

export interface ActiveEnvironment {
  id: string;
  name: string;
  profile: string;
}

/**
 * Resolves the active node's room + profile from the server — the source of
 * truth for which environment new data is being attributed to. Also syncs the
 * store's activeProfile so display surfaces never show a profile the server
 * isn't actually using.
 */
export function useActiveEnvironment() {
  const { activeNodeId, setActiveProfile } = useAetherStore();
  const [room, setRoom] = useState<ActiveEnvironment | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [roomsRaw, nodesRaw] = await Promise.all([api.getRooms(), api.getNodes()]);
      const nodes = nodesRaw as Array<{ nodeId: string; roomId: string | null }>;
      const rooms = roomsRaw as ActiveEnvironment[];
      const node = nodes.find((n) => n.nodeId === activeNodeId);
      const r = node?.roomId ? rooms.find((x) => x.id === node.roomId) ?? null : null;
      setRoom(r);
      if (r) setActiveProfile(r.profile);
    } finally {
      setLoaded(true);
    }
  }, [activeNodeId, setActiveProfile]);

  useEffect(() => {
    refresh().catch(() => setLoaded(true));
  }, [refresh]);

  return { room, loaded, refresh };
}
