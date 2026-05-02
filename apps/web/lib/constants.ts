export const AQI_COLORS: Record<number, string> = {
  0: '#22c55e',
  1: '#eab308',
  2: '#f97316',
  3: '#ef4444',
  4: '#7c3aed',
};

export const AQI_LABELS: Record<number, string> = {
  0: 'Good',
  1: 'Moderate',
  2: 'Warning',
  3: 'Alert',
  4: 'Hazardous',
};

export const AQI_BG_CLASSES: Record<number, string> = {
  0: 'bg-green-500/10 text-green-600 dark:text-green-400',
  1: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  2: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  3: 'bg-red-500/10 text-red-600 dark:text-red-400',
  4: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const DEFAULT_NODE_ID = 'AETHER-N01';
