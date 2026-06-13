import { EWMA_ALPHA, PredictionWindowEntry } from '@aether/shared';
import { linearRegression, clamp } from '../utils/statistics';
import {
  HoltState, HoltForecast, initialHoltState, holtStep,
  PM25_RANGE, CO2_RANGE,
} from './forecast';

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

// Improved forecaster (Holt damped trend) state, per node per pollutant.
interface HoltStates {
  pm25: HoltState;
  co2: HoltState;
}
const holtStates = new Map<string, HoltStates>();

export interface Layer4Result {
  /** Baseline method (reported as 'baseline_persistence_trend'): EWMA + linear slope projection. */
  pm25_pred_30m: number | null;
  co2_pred_30m:  number | null;
  trend_slope:   number | null;
  /** Improved method ('holt_damped') with 95% prediction intervals. */
  pm25_v2: HoltForecast | null;
  co2_v2:  HoltForecast | null;
}

export function processLayer4(
  nodeId: string,
  pm25: number,
  co2: number,
  intervalSeconds = 15,
  reliability?: { pm25: number; co2: number },
): Layer4Result {
  // Improved forecaster runs unconditionally — O(1) state, warms up from the
  // first reading, and needs to see every observation to learn its error.
  const holt = holtStates.get(nodeId) ?? { pm25: initialHoltState(), co2: initialHoltState() };
  holtStates.set(nodeId, holt);
  const stepsAhead = clamp(Math.round(1800 / Math.max(1, intervalSeconds)), 1, 1800);
  const nowMs = Date.now();
  const pm25_v2 = holtStep(holt.pm25, pm25, nowMs, stepsAhead, PM25_RANGE, reliability?.pm25 ?? 1);
  const co2_v2  = holtStep(holt.co2,  co2,  nowMs, stepsAhead, CO2_RANGE,  reliability?.co2  ?? 1);

  // Update sliding window
  const window = predictionWindows.get(nodeId) ?? [];
  window.push({ pm25, co2, timestamp: Date.now() });
  if (window.length > WINDOW_SIZE) window.shift();
  predictionWindows.set(nodeId, window);

  if (window.length < 10) {
    return { pm25_pred_30m: null, co2_pred_30m: null, trend_slope: null, pm25_v2, co2_v2 };
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
    pm25_v2,
    co2_v2,
  };
}

export function getWindowSize(nodeId: string): number {
  return predictionWindows.get(nodeId)?.length ?? 0;
}

export interface Layer4Snapshot {
  ewma: EwmaState | null;
  window: PredictionWindowEntry[];
  holt?: HoltStates | null;
}

export function snapshotLayer4(nodeId: string): Layer4Snapshot | null {
  const window = predictionWindows.get(nodeId);
  if (!window) return null;
  return {
    ewma: ewmaStates.get(nodeId) ?? null,
    window: [...window],
    holt: holtStates.get(nodeId) ?? null,
  };
}

export function restoreLayer4(nodeId: string, snap: Layer4Snapshot): void {
  predictionWindows.set(nodeId, [...snap.window]);
  if (snap.ewma) ewmaStates.set(nodeId, { ...snap.ewma });
  if (snap.holt) {
    holtStates.set(nodeId, {
      pm25: { ...initialHoltState(), ...snap.holt.pm25, pending: [...(snap.holt.pm25.pending ?? [])] },
      co2:  { ...initialHoltState(), ...snap.holt.co2,  pending: [...(snap.holt.co2.pending ?? [])] },
    });
  }
}
