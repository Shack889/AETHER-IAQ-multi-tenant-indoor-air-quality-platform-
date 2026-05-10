import { AQI_COLORS } from './constants';

/** Format a number with appropriate decimal places */
export function formatValue(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

/** Get AQI color for a given alert level (0-4) */
export function getAlertColor(level: number): string {
  return AQI_COLORS[Math.min(level, 4)] ?? AQI_COLORS[0];
}

/** Map CELI / EPA AQI number to alert level */
export function aqiToLevel(aqi: number): number {
  if (aqi <= 50)  return 0;
  if (aqi <= 100) return 1;
  if (aqi <= 150) return 2;
  if (aqi <= 200) return 3;
  return 4;
}

/** Format timestamp for display */
export function formatTimestamp(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Format date for chart axis */
export function formatChartTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/** Join class names (lightweight cn utility) */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Convert feet³ to liters */
export function cubicFeetToLiters(ft3: number): number {
  return ft3 * 28.3168;
}

/** Get PM2.5 status label */
export function getPm25Status(pm25: number): string {
  if (pm25 <= 12)  return 'Good';
  if (pm25 <= 35)  return 'Moderate';
  if (pm25 <= 55)  return 'Unhealthy (SG)';
  if (pm25 <= 150) return 'Unhealthy';
  if (pm25 <= 250) return 'Very Unhealthy';
  return 'Hazardous';
}

/** Get CO2 status label */
export function getCo2Status(co2: number): string {
  if (co2 <= 600)  return 'Excellent';
  if (co2 <= 800)  return 'Good';
  if (co2 <= 1000) return 'Moderate';
  if (co2 <= 1500) return 'Poor';
  return 'Very Poor';
}
