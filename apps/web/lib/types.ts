// Re-export all shared types for convenience
export * from '@aether/shared';

// Frontend-specific types
export interface ThemeMode {
  theme: 'light' | 'dark';
}

export interface ChartDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface MetricCardData {
  label: string;
  value: number;
  unit: string;
  status: 'good' | 'moderate' | 'warning' | 'alert' | 'hazardous';
  trend?: 'up' | 'down' | 'stable';
  subValue?: string;
}

/** A manual occupancy / context observation, as returned by /api/occupancy. */
export interface OccupancyEntry {
  id: string;
  nodeId: string | null;
  roomId: string | null;
  userId: string;
  timestamp: string;
  count: number | null;
  activity: string | null;
  eventTag: string | null;
  note: string | null;
  source: string;
  createdAt: string;
}

/** Body for creating/editing an occupancy entry. */
export interface OccupancyInput {
  nodeId?: string;
  roomId?: string;
  timestamp?: string;
  count?: number | null;
  activity?: string | null;
  eventTag?: string | null;
  note?: string | null;
}
