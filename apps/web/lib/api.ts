import { API_URL } from './constants';
import { useAetherStore } from './store';

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

  updateRoom: (roomId: string, data: Record<string, unknown>) =>
    fetchApi<unknown>(`/api/rooms/${roomId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  setProfile: (roomId: string, profileKey: string) =>
    fetchApi<unknown>('/api/config/profile', {
      method: 'POST',
      body: JSON.stringify({ roomId, profileKey }),
    }),

  updateNode: (nodeId: string, data: Record<string, unknown>) =>
    fetchApi<unknown>(`/api/nodes/${nodeId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

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
