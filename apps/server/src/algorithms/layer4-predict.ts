import { EWMA_ALPHA, PredictionWindowEntry } from '@aether/shared';
import { linearRegression, clamp } from '../utils/statistics';

/**
 * Layer 4: Prediction & Forecasting
 *
 * Uses EWMA smoothing combined with linear regression slope projection
 * to forecast PM2.5 and CO2 values 30 minutes ahead.
 * Also maintains temporal baseline patterns (15-min bins, 7-day learning).
 *
 * Reference: Hunter (1986), "The Exponentially Weighted Moving Average", J. Quality Technology
 */

// Sliding window: last 120 readings per node (~30 min at 15s intervals)
const WINDOW_SIZE = 120;
const predictionWindows = new Map<string, PredictionWindowEntry[]>();

// EWMA state
interface EwmaState {
  pm25: number;
  co2: number;
}
const ewmaStates = new Map<string, EwmaState>();

export interface Layer4Result {
  pm25_pred_30m: number | null;
  co2_pred_30m:  number | null;
  trend_slope:   number | null;
}

export function processLayer4(
  nodeId: string,
  pm25: number,
  co2: number,
): Layer4Result {
  // Update sliding window
  const window = predictionWindows.get(nodeId) ?? [];
  window.push({ pm25, co2, timestamp: Date.now() });
  if (window.length > WINDOW_SIZE) window.shift();
  predictionWindows.set(nodeId, window);

  if (window.length < 10) {
    return { pm25_pred_30m: null, co2_pred_30m: null, trend_slope: null };
  }

  // EWMA update
  const prevEwma = ewmaStates.get(nodeId) ?? { pm25, co2 };
  const ewma: EwmaState = {
    pm25: EWMA_ALPHA * pm25 + (1 - EWMA_ALPHA) * prevEwma.pm25,
    co2:  EWMA_ALPHA * co2  + (1 - EWMA_ALPHA) * prevEwma.co2,
  };
  ewmaStates.set(nodeId, ewma);

  // Linear regression slope over window
  const indices = window.map((_, i) => i);
  const pm25Values = window.map((r) => r.pm25);
  const co2Values  = window.map((r) => r.co2);

  const pm25Reg = linearRegression(indices, pm25Values);
  const co2Reg  = linearRegression(indices, co2Values);

  // 30-min forecast = ewma_latest + slope * 120 intervals
  const INTERVALS_30M = 120;
  const pm25_pred_30m = clamp(ewma.pm25 + pm25Reg.slope * INTERVALS_30M, 0, 1000);
  const co2_pred_30m  = clamp(ewma.co2  + co2Reg.slope  * INTERVALS_30M, 0, 10000);

  return {
    pm25_pred_30m: Math.round(pm25_pred_30m * 10) / 10,
    co2_pred_30m:  Math.round(co2_pred_30m),
    trend_slope:   Math.round(pm25Reg.slope * 1000) / 1000,
  };
}

export function getWindowSize(nodeId: string): number {
  return predictionWindows.get(nodeId)?.length ?? 0;
}

export interface Layer4Snapshot {
  ewma: EwmaState | null;
  window: PredictionWindowEntry[];
}

export function snapshotLayer4(nodeId: string): Layer4Snapshot | null {
  const window = predictionWindows.get(nodeId);
  if (!window) return null;
  return {
    ewma: ewmaStates.get(nodeId) ?? null,
    window: [...window],
  };
}

export function restoreLayer4(nodeId: string, snap: Layer4Snapshot): void {
  predictionWindows.set(nodeId, [...snap.window]);
  if (snap.ewma) ewmaStates.set(nodeId, { ...snap.ewma });
}
