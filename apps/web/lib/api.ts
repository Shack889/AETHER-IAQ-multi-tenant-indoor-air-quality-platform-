import { API_URL } from './constants';
import { useAetherStore } from './store';
import type { OccupancyEntry, OccupancyInput } from './types';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const userId = useAetherStore.getState().userId;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(userId ? { 'x-user-id': userId } : {}),
    ...((options?.headers as Record<string, string>) ?? {}),
  };
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // Surface the server's own message when available — generic statusText
    // hides actionable detail (e.g. "broker disconnected" reasons).
    let detail = response.statusText;
    try {
      const body = await response.clone().json() as { message?: string };
      if (body?.message) detail = body.message;
    } catch { /* not JSON, fall back to statusText */ }
    throw new Error(detail);
  }

  const json = await response.json() as { success: boolean; data: T };
  return json.data;
}

export const api = {
  getLatest: (nodeId: string) =>
    fetchApi<unknown>(`/api/data/latest/${nodeId}`),

  getHistory: (nodeId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    return fetchApi<unknown[]>(`/api/data/history/${nodeId}?${params.toString()}`);
  },

  getNodes: () => fetchApi<unknown[]>('/api/nodes'),

  getRooms: () => fetchApi<unknown[]>('/api/rooms'),

  getProfiles: () => fetchApi<unknown[]>('/api/profiles'),

  getCompliance: (nodeId: string) =>
    fetchApi<unknown>(`/api/compliance/${nodeId}`),

  getAlerts: (nodeId: string) =>
    fetchApi<unknown[]>(`/api/alerts/${nodeId}`),

  getAllAlerts: (onlyUnack = true) =>
    fetchApi<unknown[]>(`/api/alerts?unack=${onlyUnack}&limit=50`),

  ackAlert: (alertId: string) =>
    fetchApi<unknown>(`/api/alerts/${alertId}/ack`, { method: 'POST' }),

  ackAllAlerts: () =>
    fetchApi<{ acknowledged: number }>('/api/alerts/ack-all', { method: 'POST' }),

  getSpatial: (nodeId: string) =>
    fetchApi<unknown[]>(`/api/data/spatial/${nodeId}`),

  getBaselines: (nodeId: string) =>
    fetchApi<unknown[]>(`/api/baselines/${nodeId}`),

  runForecastBacktest: (nodeId: string, from?: string, to?: string) =>
    fetchApi<unknown>(`/api/predictions/backtest/${nodeId}`, {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    }),

  getForecastMetrics: (nodeId: string) =>
    fetchApi<unknown[]>(`/api/predictions/metrics/${nodeId}`),

  getDecayEvents: (nodeId: string, limit = 100) =>
    fetchApi<unknown>(`/api/decay-events/${nodeId}?limit=${limit}`),

  getOccupancy: (params: { nodeId?: string; roomId?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params.nodeId) qs.set('nodeId', params.nodeId);
    if (params.roomId) qs.set('roomId', params.roomId);
    if (params.from)   qs.set('from', params.from);
    if (params.to)     qs.set('to', params.to);
    return fetchApi<OccupancyEntry[]>(`/api/occupancy?${qs.toString()}`);
  },

  createOccupancy: (body: OccupancyInput) =>
    fetchApi<OccupancyEntry>('/api/occupancy', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateOccupancy: (id: string, body: OccupancyInput) =>
    fetchApi<OccupancyEntry>(`/api/occupancy/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteOccupancy: (id: string) =>
    fetchApi<unknown>(`/api/occupancy/${id}`, { method: 'DELETE' }),

  updateRoom: (roomId: string, data: Record<string, unknown>) =>
    fetchApi<unknown>(`/api/rooms/${roomId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  createRoom: (data: Record<string, unknown>) =>
    fetchApi<unknown>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Returns the structured 409 guard response instead of throwing, so the UI
   *  can show the acknowledgment dialog with row counts. */
  deleteRoom: async (roomId: string, acknowledge = false) => {
    const userId = useAetherStore.getState().userId;
    const res = await fetch(
      `${API_URL}/api/rooms/${roomId}${acknowledge ? '?acknowledge=true' : ''}`,
      { method: 'DELETE', headers: userId ? { 'x-user-id': userId } : {} },
    );
    const json = (await res.json()) as {
      success: boolean; code?: string; message?: string;
      data?: { readingCount: number; nodeCount: number };
    };
    return { ok: res.ok, status: res.status, ...json };
  },

  getRecomputePreview: (roomId: string, profile: string) =>
    fetchApi<{ oldProfile: string; newProfile: string | null; rowCount: number }>(
      `/api/rooms/${roomId}/recompute-preview?profile=${encodeURIComponent(profile)}`,
    ),

  setProfile: (roomId: string, profileKey: string, recomputeHistorical = false) =>
    fetchApi<unknown>('/api/config/profile', {
      method: 'POST',
      body: JSON.stringify({ roomId, profileKey, recomputeHistorical }),
    }),

  updateNode: (nodeId: string, data: Record<string, unknown>) =>
    fetchApi<unknown>(`/api/nodes/${nodeId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** Returns the structured 409 guard response instead of throwing, so the UI
   *  can require typed confirmation before re-calling with force=true. */
  deleteNode: async (nodeId: string, force = false) => {
    const userId = useAetherStore.getState().userId;
    const res = await fetch(
      `${API_URL}/api/nodes/${encodeURIComponent(nodeId)}${force ? '?force=true' : ''}`,
      { method: 'DELETE', headers: userId ? { 'x-user-id': userId } : {} },
    );
    const json = (await res.json()) as {
      success: boolean; code?: string; message?: string; realReadingCount?: number;
    };
    return { ok: res.ok, status: res.status, ...json };
  },

  sendNodeCommand: async (nodeId: string, command: 'reboot' | 'recalibrate' | 'toggle_ventilation') => {
    const userId = useAetherStore.getState().userId;
    const res = await fetch(`${API_URL}/api/nodes/${nodeId}/cmd`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'x-user-id': userId } : {}),
      },
      body: JSON.stringify({ command }),
    });
    const json = (await res.json()) as { success: boolean; message?: string; data?: unknown };
    return { ok: res.ok, status: res.status, ...json };
  },

  listSimulations: () => fetchApi<unknown[]>('/api/simulation'),

  createSimulation: (body: Record<string, unknown>) =>
    fetchApi<{ id: string; simNodeIds: string[] }>('/api/simulation/create', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  startSimulation: (id: string) =>
    fetchApi<unknown>('/api/simulation/start', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  pauseSimulation: (id: string) =>
    fetchApi<unknown>('/api/simulation/pause', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  resetSimulation: (id: string) =>
    fetchApi<unknown>('/api/simulation/reset', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  injectEvent: (id: string, type: 'dust' | 'combustion' | 'chemical') =>
    fetchApi<unknown>('/api/simulation/event', {
      method: 'POST',
      body: JSON.stringify({ id, type }),
    }),

  getSimulationStatus: (id: string) =>
    fetchApi<unknown>(`/api/simulation/status/${id}`),

  deleteSimulation: (id: string) =>
    fetchApi<unknown>(`/api/simulation/${id}`, { method: 'DELETE' }),

  exportCsvUrl: (nodeId: string, from?: string, to?: string) => {
    const userId = useAetherStore.getState().userId;
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (userId) qs.set('_uid', userId); // not used by server; kept for cache busting per-user
    return `${API_URL}/api/data/export/csv/${nodeId}?${qs.toString()}`;
  },

  downloadExport: async (
    kind: 'csv' | 'xlsx',
    nodeId: string,
    from?: string,
    to?: string,
    source: 'all' | 'hardware' | 'simulated' = 'all',
  ) => {
    const userId = useAetherStore.getState().userId;
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    qs.set('source', source);
    const res = await fetch(`${API_URL}/api/data/export/${kind}/${nodeId}?${qs.toString()}`, {
      headers: userId ? { 'x-user-id': userId } : {},
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = source === 'all' ? '' : `-${source}`;
    a.download = `aether-${nodeId}${suffix}-${new Date().toISOString().slice(0, 10)}.${kind}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  getHardwareStatus: (nodeId: string) =>
    fetchApi<{
      brokerConnected: boolean;
      hasRecentHardwareData: boolean;
      lastHardwareReadingAt: string | null;
      canEnable: boolean;
      reason: string | null;
    }>(`/api/nodes/${nodeId}/hardware-status`),

  getRetention: () =>
    fetchApi<{ days: number }>('/api/config/retention'),

  setRetention: (days: number) =>
    fetchApi<{ days: number }>('/api/config/retention', {
      method: 'POST',
      body: JSON.stringify({ days }),
    }),

  runRetentionPurge: (dryRun = true) =>
    fetchApi<{
      retentionDays: number; cutoff: string; dryRun: boolean;
      readings: { hardware: number; simulated: number };
      processed: { hardware: number; simulated: number };
      alerts: number; deleted: number;
    }>('/api/config/retention/run', {
      method: 'POST',
      body: JSON.stringify({ dryRun }),
    }),

  getMockPaused: () =>
    fetchApi<{ paused: boolean }>('/api/config/mock-paused'),

  setMockPaused: (paused: boolean) =>
    fetchApi<{ paused: boolean }>('/api/config/mock-paused', {
      method: 'POST',
      body: JSON.stringify({ paused }),
    }),

  importCsv: async (file: File, nodeId: string) => {
    const userId = useAetherStore.getState().userId;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('nodeId', nodeId);
    const res = await fetch(`${API_URL}/api/data/import`, {
      method: 'POST',
      headers: userId ? { 'x-user-id': userId } : {},
      body: fd,
    });
    const json = (await res.json()) as { success: boolean; data?: unknown; message?: string };
    return { ok: res.ok, status: res.status, ...json };
  },
};
