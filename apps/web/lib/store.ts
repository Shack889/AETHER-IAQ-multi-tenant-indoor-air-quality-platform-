import { create } from 'zustand';
import { ProcessedSnapshot, RawReading, AlertRecord, NodeInfo } from '@aether/shared';

interface ChartPoint {
  timestamp: string;
  pm25: number;
  co2: number;
  voc: number;
  temp: number;
  rh: number;
  deps_aqi: number;
}

interface AetherStore {
  // Live data
  latestSnapshot: ProcessedSnapshot | null;
  latestRaw: RawReading | null;
  chartHistory: ChartPoint[];         // Last 288 points (24h at 5min)
  recentAlerts: AlertRecord[];
  nodes: NodeInfo[];
  activeNodeId: string;
  activeProfile: string;

  // Session
  userId: string | null;

  // UI state
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;

  // Actions
  setLatestData: (raw: RawReading, processed: ProcessedSnapshot) => void;
  addAlert: (alert: AlertRecord) => void;
  setAlerts: (alerts: AlertRecord[]) => void;
  acknowledgeAlert: (alertId: string) => void;
  acknowledgeAllAlerts: () => void;
  setNodes: (nodes: NodeInfo[]) => void;
  setActiveNode: (nodeId: string) => void;
  setActiveProfile: (profileKey: string) => void;
  setUserId: (userId: string | null) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
}

export const useAetherStore = create<AetherStore>((set) => ({
  latestSnapshot: null,
  latestRaw: null,
  chartHistory: [],
  recentAlerts: [],
  nodes: [],
  activeNodeId: 'AETHER-N01',
  activeProfile: 'OFFICE_OPEN',
  userId: null,
  theme: 'dark',
  sidebarCollapsed: false,

  setLatestData: (raw, processed) =>
    set((state) => {
      const point: ChartPoint = {
        timestamp: processed.timestamp.toString(),
        pm25: processed.pm25_corrected,
        co2:  processed.co2_filtered,
        voc:  processed.voc_filtered,
        temp: processed.temp_filtered,
        rh:   processed.rh_filtered,
        deps_aqi: processed.deps_aqi,
      };
      const history = [...state.chartHistory, point].slice(-288);
      return { latestSnapshot: processed, latestRaw: raw, chartHistory: history };
    }),

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

  setTheme: (theme) => set({ theme }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
