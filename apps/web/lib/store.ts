import { create } from 'zustand';
import { ProcessedSnapshot, RawReading, AlertRecord, NodeInfo, DataSourceChangedEvent } from '@aether/shared';

/** Helper: is the given node paused (both sources off, not a simulation node). */
export function isNodePaused(n: NodeInfo | undefined): boolean {
  if (!n) return false;
  if (n.dataSource === 'simulation') return false;
  return !n.mockEnabled && !n.hardwareEnabled;
}

interface ChartPoint {
  timestamp: string;
  pm25: number;
  co2: number;
  voc: number;
  temp: number;
  rh: number;
  deps_aqi: number;          // legacy alias — equals celi_score
  celi_score: number;
  cognitive_burden: number;
  total_burden: number;
  temporal_memory_pm: number;
  temporal_memory_co2: number;
  temporal_memory_voc: number;
  simulated: boolean;
}

interface AetherStore {
  // Live data
  latestSnapshot: ProcessedSnapshot | null;
  latestRaw: RawReading | null;
  /** True when the latest reading came from a mock generator or simulation. */
  latestSimulated: boolean;
  /** Most recent node:dataSourceChanged event — drives a transient toast. */
  latestDataSourceChange: DataSourceChangedEvent | null;
  chartHistory: ChartPoint[];         // Last 288 points (24h at 5min)
  recentAlerts: AlertRecord[];
  nodes: NodeInfo[];
  activeNodeId: string;
  activeProfile: string;

  // Session
  userId: string | null;

  // UI state
  theme: 'light' | 'dark';
  /** 'system' = follows prefers-color-scheme; 'manual' = user override. */
  themeSource: 'system' | 'manual';
  sidebarCollapsed: boolean;

  // Actions
  setLatestData: (raw: RawReading, processed: ProcessedSnapshot, simulated: boolean) => void;
  /** Hydrate the data-source flag from a persisted reading (REST), independent
   *  of a live WebSocket update. Keeps the badge honest on initial load. */
  setSimulated: (simulated: boolean) => void;
  setLatestDataSourceChange: (event: DataSourceChangedEvent | null) => void;
  addAlert: (alert: AlertRecord) => void;
  setAlerts: (alerts: AlertRecord[]) => void;
  acknowledgeAlert: (alertId: string) => void;
  acknowledgeAllAlerts: () => void;
  setNodes: (nodes: NodeInfo[]) => void;
  setActiveNode: (nodeId: string) => void;
  setActiveProfile: (profileKey: string) => void;
  setUserId: (userId: string | null) => void;
  /** Manual override — also marks the source as manual. */
  setTheme: (theme: 'light' | 'dark') => void;
  /** Reset to follow system preference. */
  resetThemeToSystem: () => void;
  /** Internal — used by the system-preference subscriber. */
  setSystemTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
}

export const useAetherStore = create<AetherStore>((set) => ({
  latestSnapshot: null,
  latestRaw: null,
  latestSimulated: true,
  latestDataSourceChange: null,
  chartHistory: [],
  recentAlerts: [],
  nodes: [],
  activeNodeId: 'AETHER-N01',
  activeProfile: 'OFFICE_OPEN',
  userId: null,
  // Initial theme is light + system. The init script in <head> will already
  // have set the correct theme on <html data-theme>, and useThemeInit will
  // sync these store values from localStorage / matchMedia on mount.
  theme: 'light' as 'light' | 'dark',
  themeSource: 'system' as 'system' | 'manual',
  sidebarCollapsed: false,

  setLatestData: (raw, processed, simulated) =>
    set((state) => {
      const celi = (processed as ProcessedSnapshot & { celi_score?: number }).celi_score ?? processed.deps_aqi;
      const point: ChartPoint = {
        timestamp: processed.timestamp.toString(),
        pm25: processed.pm25_corrected,
        co2:  processed.co2_filtered,
        voc:  processed.voc_filtered,
        temp: processed.temp_filtered,
        rh:   processed.rh_filtered,
        deps_aqi: processed.deps_aqi,
        celi_score: celi,
        cognitive_burden:    (processed as ProcessedSnapshot & { cognitive_burden?: number }).cognitive_burden ?? processed.cpis,
        total_burden:        (processed as ProcessedSnapshot & { total_burden?: number }).total_burden ?? celi,
        temporal_memory_pm:  (processed as ProcessedSnapshot & { temporal_memory_pm?: number }).temporal_memory_pm ?? 0,
        temporal_memory_co2: (processed as ProcessedSnapshot & { temporal_memory_co2?: number }).temporal_memory_co2 ?? 0,
        temporal_memory_voc: (processed as ProcessedSnapshot & { temporal_memory_voc?: number }).temporal_memory_voc ?? 0,
        simulated,
      };
      const history = [...state.chartHistory, point].slice(-288);
      return { latestSnapshot: processed, latestRaw: raw, latestSimulated: simulated, chartHistory: history };
    }),

  setSimulated: (simulated) => set({ latestSimulated: simulated }),

  setLatestDataSourceChange: (event) => set({ latestDataSourceChange: event }),

  addAlert: (alert) =>
    set((state) => ({
      recentAlerts: [alert, ...state.recentAlerts].slice(0, 50),
    })),

  setAlerts: (alerts) => set({ recentAlerts: alerts.slice(0, 50) }),

  acknowledgeAlert: (alertId) =>
    set((state) => ({
      recentAlerts: state.recentAlerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a,
      ),
    })),

  acknowledgeAllAlerts: () =>
    set((state) => ({
      recentAlerts: state.recentAlerts.map((a) => ({ ...a, acknowledged: true })),
    })),

  setNodes: (nodes) => set({ nodes }),

  setActiveNode: (activeNodeId) => set({ activeNodeId }),

  setActiveProfile: (activeProfile) => set({ activeProfile }),

  setUserId: (userId) => set({ userId }),

  setTheme: (theme) => set({ theme, themeSource: 'manual' }),

  resetThemeToSystem: () => set({ themeSource: 'system' }),

  setSystemTheme: (theme) => set({ theme }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
