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
