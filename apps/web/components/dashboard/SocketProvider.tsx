'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useSocket } from '@/hooks/useSocket';
import { useAetherStore } from '@/lib/store';
import { api } from '@/lib/api';
import type { AlertRecord } from '@aether/shared';
import { DataSourceToast } from '@/components/dashboard/DataSourceToast';

interface ApiAlert {
  id: string;
  nodeId: string;
  level: number;
  message: string;
  parameter: string;
  value: number;
  threshold: number;
  acknowledged: boolean;
  createdAt: string;
}

/**
 * Initializes WebSocket connection inside dashboard layout.
 * Also seeds the userId into the store and hydrates the alert list from
 * the backend so existing unack'd alerts show up in the bell on page load.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const setUserId = useAetherStore((s) => s.setUserId);
  const setAlerts = useAetherStore((s) => s.setAlerts);
  const userId = useAetherStore((s) => s.userId);

  useEffect(() => {
    const id = (session?.user as { id?: string } | undefined)?.id ?? null;
    setUserId(id);
  }, [session?.user, setUserId]);

  // Hydrate alerts once we know the user id.
  useEffect(() => {
    if (!userId) return;
    void api.getAllAlerts(true)
      .then((rows) => {
        const alerts: AlertRecord[] = (rows as ApiAlert[]).map((a) => ({
          id: a.id,
          nodeId: a.nodeId,
          level: a.level as AlertRecord['level'],
          message: a.message,
          parameter: a.parameter,
          value: a.value,
          threshold: a.threshold,
          acknowledged: a.acknowledged,
          createdAt: new Date(a.createdAt),
        }));
        setAlerts(alerts);
      })
      .catch(() => undefined);
  }, [userId, setAlerts]);

  useSocket();
  return (
    <>
      {children}
      <DataSourceToast />
    </>
  );
}
