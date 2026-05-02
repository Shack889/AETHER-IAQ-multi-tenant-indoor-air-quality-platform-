'use client';

import { useEffect, useState } from 'react';
import { useAetherStore } from '@/lib/store';
import { api } from '@/lib/api';

export function useSensorData() {
  const { latestSnapshot, latestRaw, chartHistory, activeNodeId } = useAetherStore();
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial data on mount
  useEffect(() => {
    async function fetchInitial() {
      try {
        const [latest, history] = await Promise.all([
          api.getLatest(activeNodeId),
          api.getHistory(activeNodeId),
        ]);
        // Store will be updated when WebSocket connects and sends first update
        setIsLoading(false);
      } catch {
        setIsLoading(false);
      }
    }
    void fetchInitial();
  }, [activeNodeId]);

  // Once WebSocket starts sending data, loading is done
  useEffect(() => {
    if (latestSnapshot) setIsLoading(false);
  }, [latestSnapshot]);

  return {
    snapshot: latestSnapshot,
    raw: latestRaw,
    chartHistory,
    isLoading,
    nodeId: activeNodeId,
  };
}
