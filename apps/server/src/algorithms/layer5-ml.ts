import { ANOMALY_Z_THRESHOLD } from '@aether/shared';
import { mean, stddev, clamp } from '../utils/statistics';

/**
 * Layer 5: ML/AI — Anomaly Detection & Room Scenario Classification
 *
 * Anomaly detection uses a simplified Isolation Forest approach:
 * z-score normalization across PM2.5/CO2/VOC and Euclidean distance in feature space.
 *
 * Room classification uses a rule-based engine (upgradable to Random Forest in Phase II).
 *
 * Reference:
 *  - Liu, Ting & Zhou (2008), "Isolation Forest", ICDM'08
 */

// Sliding statistics window (last 500 readings per node)
const STATS_WINDOW = 500;
const statsWindows = new Map<string, Array<{ pm25: number; co2: number; voc: number }>>();

export interface Layer5Result {
  anomaly_score: number;
  is_anomaly: boolean;
  room_scenario: string;
}

export function processLayer5(
  nodeId: string,
  pm25: number,
  co2: number,
  voc: number,
  temp: number,
  rh: number,
  pm25_slope: number,
  co2_slope: number,
  hourOfDay: number,
): Layer5Result {
  // Update stats window
  const window = statsWindows.get(nodeId) ?? [];
  window.push({ pm25, co2, voc });
  if (window.length > STATS_WINDOW) window.shift();
  statsWindows.set(nodeId, window);

  // Anomaly detection via z-scores
  const pm25Values = window.map((r) => r.pm25);
  const co2Values  = window.map((r) => r.co2);
  const vocValues  = window.map((r) => r.voc);

  const z_pm  = normalizedZ(pm25, pm25Values);
  const z_co2 = normalizedZ(co2,  co2Values);
  const z_voc = normalizedZ(voc,  vocValues);

  const anomaly_score = Math.sqrt((z_pm ** 2 + z_co2 ** 2 + z_voc ** 2) / 3);
  const is_anomaly = anomaly_score > ANOMALY_Z_THRESHOLD;

  // Room scenario classification
  const room_scenario = classifyRoomScenario(pm25, co2, voc, temp, rh, pm25_slope, co2_slope, hourOfDay);

  return {
    anomaly_score: Math.round(anomaly_score * 100) / 100,
    is_anomaly,
    room_scenario,
  };
}

export function snapshotLayer5(nodeId: string): Array<{ pm25: number; co2: number; voc: number }> | null {
  const w = statsWindows.get(nodeId);
  return w ? [...w] : null;
}

export function restoreLayer5(nodeId: string, window: Array<{ pm25: number; co2: number; voc: number }>): void {
  statsWindows.set(nodeId, [...window]);
}

function normalizedZ(value: number, window: number[]): number {
  if (window.length < 10) return 0;
  const m = mean(window);
  const s = stddev(window);
  return s === 0 ? 0 : Math.abs((value - m) / s);
}

function classifyRoomScenario(
  pm25: number,
  co2: number,
  voc: number,
  _temp: number,
  _rh: number,
  _pm25_slope: number,
  _co2_slope: number,
  hourOfDay: number,
): string {
  if (co2 > 1200 && pm25 < 20)                           return 'meeting_room_crowded';
  if (pm25 > 50 && voc > 200)                             return 'cooking_or_burning';
  if (co2 < 500 && pm25 < 10 && voc < 50)                return 'empty_room';
  if (co2 >= 600 && co2 <= 1000 && hourOfDay >= 9 && hourOfDay <= 17) return 'normal_occupied';
  if (voc > 300 && pm25 < 15)                             return 'cleaning_chemicals';
  return 'unknown';
}
