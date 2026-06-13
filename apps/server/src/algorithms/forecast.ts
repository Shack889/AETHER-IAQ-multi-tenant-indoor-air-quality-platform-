import { clamp } from '../utils/statistics';

/**
 * Layer 4 v2: Holt damped-trend exponential smoothing with empirical
 * prediction intervals.
 *
 * The improved 30-min forecaster for PM2.5 and CO2. Fully online (O(1) state
 * per pollutant), so it runs per-reading in Node and serializes into
 * AlgorithmState. The same class drives the walk-forward backtest so offline
 * evaluation exercises exactly the production code path.
 *
 * References:
 *   Holt (1957), "Forecasting seasonals and trends by exponentially weighted
 *   moving averages"; Gardner & McKenzie (1985), "Forecasting trends in time
 *   series", Management Science 31(10) — damped trend.
 */

export const METHOD_BASELINE = 'baseline_persistence_trend';
export const METHOD_IMPROVED = 'holt_damped';
export const METHOD_NAIVE = 'persistence';

// Tuned on mock walk-forward backtests (2026-05-09 / 2026-05-15 windows):
// reactive enough to track diurnal CO2 ramps, smooth enough that skill vs
// naive persistence stays ≈0 on pure-noise segments (persistence is optimal
// there, so ≈0 is the ceiling). Re-verify against hardware data pre-campaign.
const ALPHA = 0.15; // level smoothing
const BETA  = 0.03; // trend smoothing
const PHI   = 0.97; // trend damping per step

/** MAE → σ under a normal error assumption: σ = MAE · √(π/2). */
const MAE_TO_SIGMA = Math.sqrt(Math.PI / 2);
const Z_95 = 1.96;
/** EWMA factor for the matured-error tracker (~20-reading memory). */
const ERR_LAMBDA = 0.05;
const HORIZON_MS = 30 * 60_000;
const MAX_PENDING = 400;

export interface HoltState {
  level: number | null;
  trend: number;
  /** EWMA of |30-min-ahead error| — empirical, learned from matured forecasts. */
  mae30: number | null;
  /** Forecasts awaiting maturity so their error can be measured. */
  pending: Array<{ ts: number; pred: number }>;
}

export function initialHoltState(): HoltState {
  return { level: null, trend: 0, mae30: null, pending: [] };
}

export interface HoltForecast {
  pred: number;
  lo: number;
  hi: number;
}

/** Damped h-step-ahead projection: level + (φ + φ² + … + φʰ)·trend. */
function dampedSum(h: number): number {
  return (PHI * (1 - Math.pow(PHI, h))) / (1 - PHI);
}

/**
 * Feed one observation and produce a 30-min-ahead forecast with a 95%
 * prediction interval. `stepsAhead` is the number of reading intervals in
 * 30 minutes (cadence-dependent). `reliability` (0..1) widens the interval
 * when the sensor self-consistency score is low.
 */
export function holtStep(
  state: HoltState,
  y: number,
  nowMs: number,
  stepsAhead: number,
  range: { min: number; max: number },
  reliability = 1,
): HoltForecast {
  // 1. Score matured forecasts against the value that actually arrived.
  while (state.pending.length > 0 && state.pending[0].ts <= nowMs - HORIZON_MS) {
    const matured = state.pending.shift()!;
    const err = Math.abs(y - matured.pred);
    state.mae30 = state.mae30 === null ? err : ERR_LAMBDA * err + (1 - ERR_LAMBDA) * state.mae30;
  }

  // 2. Level/trend update (Holt linear with damped trend).
  if (state.level === null) {
    state.level = y;
    state.trend = 0;
  } else {
    const prevLevel = state.level;
    state.level = ALPHA * y + (1 - ALPHA) * (prevLevel + PHI * state.trend);
    state.trend = BETA * (state.level - prevLevel) + (1 - BETA) * PHI * state.trend;
  }

  // 3. Forecast + interval.
  const pred = clamp(state.level + dampedSum(stepsAhead) * state.trend, range.min, range.max);
  // Until errors mature, fall back to a conservative ±15% (with a floor of 2%
  // of the physical range) so early intervals are wide rather than overconfident.
  const sigma = state.mae30 !== null
    ? state.mae30 * MAE_TO_SIGMA
    : Math.max(0.15 * Math.abs(y), 0.02 * (range.max - range.min));
  const widen = 1 / Math.max(0.3, reliability);
  const half = Z_95 * sigma * widen;

  state.pending.push({ ts: nowMs, pred });
  if (state.pending.length > MAX_PENDING) state.pending.shift();

  return {
    pred,
    lo: clamp(pred - half, range.min, range.max),
    hi: clamp(pred + half, range.min, range.max),
  };
}

export const PM25_RANGE = { min: 0, max: 1000 };
export const CO2_RANGE  = { min: 350, max: 10000 };
