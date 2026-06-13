import { EWMA_ALPHA } from '@aether/shared';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { linearRegression, clamp } from '../utils/statistics';
import {
  initialHoltState, holtStep, PM25_RANGE, CO2_RANGE,
  METHOD_BASELINE, METHOD_IMPROVED, METHOD_NAIVE,
} from './forecast';

/**
 * Walk-forward (rolling-origin) backtest of the 30-minute forecasters over
 * stored readings. Each model is warm-started at the beginning of the range
 * and stepped forward one observation at a time, exactly as it runs online —
 * every prediction is made strictly from past data, then scored against the
 * observation that actually arrived ~30 minutes later.
 *
 * Metrics (MAE / RMSE / skill vs naive persistence) are computed per
 * pollutant per environment profile and persisted to ForecastMetric so the
 * paper can cite them.
 */

const HORIZON_MS = 30 * 60_000;
const WINDOW_SIZE = 120; // mirrors layer4-predict baseline window
const MAX_ROWS = 50_000;

interface MetricRow {
  pollutant: 'pm25' | 'co2';
  method: string;
  profile: string;
  n: number;
  mae: number;
  rmse: number;
  skill: number | null;
}

export interface BacktestSummary {
  nodeId: string;
  windowStart: string;
  windowEnd: string;
  horizonMin: number;
  rowsUsed: number;
  evaluated: number;
  /** Fraction of actuals inside the improved model's 95% interval, per pollutant. */
  coverage95: { pm25: number | null; co2: number | null };
  metrics: MetricRow[];
}

interface ErrAcc { sumAbs: number; sumSq: number; n: number }
const newAcc = (): ErrAcc => ({ sumAbs: 0, sumSq: 0, n: 0 });

export async function runBacktest(nodeId: string, from?: Date, to?: Date): Promise<BacktestSummary> {
  const fromDate = from ?? new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const toDate = to ?? new Date();

  const rows = await prisma.processedData.findMany({
    where: { nodeId, timestamp: { gte: fromDate, lte: toDate } },
    orderBy: { timestamp: 'asc' },
    select: { timestamp: true, pm25_corrected: true, co2_filtered: true, profile_used: true },
    take: MAX_ROWS,
  });

  const t = rows.map((r) => r.timestamp.getTime());
  const series = {
    pm25: rows.map((r) => r.pm25_corrected),
    co2:  rows.map((r) => r.co2_filtered),
  };

  // Model state per pollutant
  const holt = { pm25: initialHoltState(), co2: initialHoltState() };
  const ewma = { pm25: null as number | null, co2: null as number | null };
  const ranges = { pm25: PM25_RANGE, co2: CO2_RANGE };

  // (pollutant|method|profile) → error accumulator
  const acc = new Map<string, ErrAcc>();
  const accFor = (key: string) => {
    let a = acc.get(key);
    if (!a) { a = newAcc(); acc.set(key, a); }
    return a;
  };

  const covered = { pm25: 0, co2: 0 };
  const coveredN = { pm25: 0, co2: 0 };
  let evaluated = 0;
  let target = 0; // pointer to the first row >= t[i] + horizon

  for (let i = 0; i < rows.length; i++) {
    if (target < i + 1) target = i + 1;
    while (target < rows.length && t[target] < t[i] + HORIZON_MS) target++;
    const hasTarget = target < rows.length && t[target] - (t[i] + HORIZON_MS) < HORIZON_MS;
    const h = hasTarget ? target - i : Math.round(HORIZON_MS / Math.max(1, t[Math.min(i + 1, rows.length - 1)] - t[i]));
    const profile = rows[i].profile_used;

    for (const pollutant of ['pm25', 'co2'] as const) {
      const y = series[pollutant][i];
      const range = ranges[pollutant];

      // Improved: Holt damped (state updates every step regardless of eval)
      const fc = holtStep(holt[pollutant], y, t[i], Math.max(1, h), range);

      // Baseline: EWMA + linear slope over trailing window (production replica)
      ewma[pollutant] = ewma[pollutant] === null
        ? y
        : EWMA_ALPHA * y + (1 - EWMA_ALPHA) * ewma[pollutant]!;
      let baselinePred: number | null = null;
      const start = Math.max(0, i - WINDOW_SIZE + 1);
      const windowLen = i - start + 1;
      if (windowLen >= 10) {
        const idx = Array.from({ length: windowLen }, (_, k) => k);
        const vals = series[pollutant].slice(start, i + 1);
        const { slope } = linearRegression(idx, vals);
        baselinePred = clamp(ewma[pollutant]! + slope * Math.max(1, h), range.min, range.max);
      }

      if (!hasTarget) continue;
      const actual = series[pollutant][target];

      const record = (method: string, pred: number | null) => {
        if (pred === null) return;
        const err = actual - pred;
        const a = accFor(`${pollutant}|${method}|${profile}`);
        a.sumAbs += Math.abs(err);
        a.sumSq += err * err;
        a.n++;
      };

      record(METHOD_NAIVE, y);              // persistence: ŷ(t+30) = y(t)
      record(METHOD_BASELINE, baselinePred);
      record(METHOD_IMPROVED, fc.pred);

      if (actual >= fc.lo && actual <= fc.hi) covered[pollutant]++;
      coveredN[pollutant]++;
      if (pollutant === 'pm25') evaluated++;
    }
  }

  // Build metric rows; skill is computed against persistence within the same
  // pollutant × profile slice.
  const metrics: MetricRow[] = [];
  for (const [key, a] of acc) {
    const [pollutant, method, profile] = key.split('|') as [MetricRow['pollutant'], string, string];
    const naive = acc.get(`${pollutant}|${METHOD_NAIVE}|${profile}`);
    const mae = a.sumAbs / a.n;
    const naiveMae = naive && naive.n > 0 ? naive.sumAbs / naive.n : null;
    metrics.push({
      pollutant,
      method,
      profile,
      n: a.n,
      mae: round3(mae),
      rmse: round3(Math.sqrt(a.sumSq / a.n)),
      skill: method === METHOD_NAIVE || naiveMae === null || naiveMae === 0
        ? null
        : round3(1 - mae / naiveMae),
    });
  }
  metrics.sort((x, y) => x.pollutant.localeCompare(y.pollutant) || x.profile.localeCompare(y.profile) || x.method.localeCompare(y.method));

  const windowStart = rows.length ? rows[0].timestamp : fromDate;
  const windowEnd = rows.length ? rows[rows.length - 1].timestamp : toDate;

  if (metrics.length > 0) {
    await prisma.forecastMetric.createMany({
      data: metrics.map((m) => ({
        nodeId,
        pollutant: m.pollutant,
        method: m.method,
        profile: m.profile,
        horizonMin: 30,
        windowStart,
        windowEnd,
        n: m.n,
        mae: m.mae,
        rmse: m.rmse,
        skill: m.skill,
      })),
    });
  }
  logger.info({ nodeId, rows: rows.length, evaluated, metrics: metrics.length }, 'forecast backtest complete');

  return {
    nodeId,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    horizonMin: 30,
    rowsUsed: rows.length,
    evaluated,
    coverage95: {
      pm25: coveredN.pm25 > 0 ? round3(covered.pm25 / coveredN.pm25) : null,
      co2:  coveredN.co2  > 0 ? round3(covered.co2  / coveredN.co2)  : null,
    },
    metrics,
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
