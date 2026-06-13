'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Line, ComposedChart,
} from 'recharts';
import { useSensorData } from '@/hooks/useSensorData';
import { useAetherStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { Skeleton, ChartSkeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/api';
import { formatChartTime } from '@/lib/utils';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { SplitText } from '@/components/animations/SplitText';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { PausedBanner } from '@/components/dashboard/PausedBanner';

interface BaselinePoint {
  binIndex: number;
  pm25_avg: number;
  co2_avg: number;
  voc_avg: number;
}

interface ForecastMetricRow {
  id: string;
  pollutant: string;
  method: string;
  profile: string;
  horizonMin: number;
  windowStart: string;
  windowEnd: string;
  n: number;
  mae: number;
  rmse: number;
  skill: number | null;
}

interface DecayEventRow {
  id: string;
  startedAt: string;
  durationMin: number;
  c0_ppm: number;
  cEnd_ppm: number;
  ach_est: number;
  r_squared: number;
  nPoints: number;
  simulated: boolean;
}

interface DecaySummary {
  n: number;
  medianAch: number | null;
  iqrLo: number | null;
  iqrHi: number | null;
}

const METHOD_LABELS: Record<string, string> = {
  persistence: 'Naive persistence',
  baseline_persistence_trend: 'Baseline (EWMA + trend)',
  holt_damped: 'Improved (Holt damped)',
};

export default function PredictionsPage() {
  const { snapshot, chartHistory, isLoading } = useSensorData();
  const { activeNodeId, latestSimulated: simulated } = useAetherStore();
  const [baselines, setBaselines] = useState<BaselinePoint[]>([]);
  const [anomalies, setAnomalies] = useState<Array<{ id: string; ts: Date; msg: string; score: number }>>([]);
  const [metrics, setMetrics] = useState<ForecastMetricRow[]>([]);
  const [decayEvents, setDecayEvents] = useState<DecayEventRow[]>([]);
  const [decaySummary, setDecaySummary] = useState<DecaySummary | null>(null);
  const [backtestBusy, setBacktestBusy] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  useEffect(() => {
    api.getBaselines(activeNodeId)
      .then((d) => setBaselines((d as BaselinePoint[]).slice(0, 96)))
      .catch(() => setBaselines([]));
    api.getForecastMetrics(activeNodeId)
      .then((d) => setMetrics(d as ForecastMetricRow[]))
      .catch(() => setMetrics([]));
    api.getDecayEvents(activeNodeId)
      .then((d) => {
        const r = d as { events: DecayEventRow[]; summary: DecaySummary };
        setDecayEvents(r.events ?? []);
        setDecaySummary(r.summary ?? null);
      })
      .catch(() => { setDecayEvents([]); setDecaySummary(null); });
  }, [activeNodeId]);

  const runBacktest = async () => {
    setBacktestBusy(true);
    setBacktestError(null);
    try {
      await api.runForecastBacktest(activeNodeId);
      const d = await api.getForecastMetrics(activeNodeId);
      setMetrics(d as ForecastMetricRow[]);
    } catch (err) {
      setBacktestError((err as Error).message);
    } finally {
      setBacktestBusy(false);
    }
  };

  useEffect(() => {
    if (snapshot?.anomaly_score != null && snapshot.anomaly_score > 0.6) {
      const id = `${snapshot.timestamp.toString()}`;
      setAnomalies((prev) => {
        if (prev.some((a) => a.id === id)) return prev;
        return [
          { id, ts: snapshot.timestamp, msg: `Reading deviates from learned pattern`, score: snapshot.anomaly_score! },
          ...prev,
        ].slice(0, 8);
      });
    }
  }, [snapshot]);

  if (isLoading || !snapshot) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton width={120} height={20} />
          <Skeleton width={240} variant="text" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="surface-card p-5 space-y-3">
            <Skeleton variant="text" width="50%" />
            <Skeleton height={48} width="60%" />
          </div>
          <div className="surface-card p-5 space-y-3">
            <Skeleton variant="text" width="50%" />
            <Skeleton height={48} width="60%" />
          </div>
        </div>
        <ChartSkeleton height={260} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartSkeleton height={200} />
          <ChartSkeleton height={200} />
        </div>
      </div>
    );
  }

  const pm25Now = snapshot.pm25_corrected;
  const co2Now = snapshot.co2_filtered;
  // Baseline method (EWMA + trend projection)
  const pm25Base = snapshot.pm25_pred_30m ?? pm25Now;
  const co2Base = snapshot.co2_pred_30m ?? co2Now;
  // Improved method (Holt damped) — preferred when available
  const pm25V2 = snapshot.pm25_pred_30m_v2 ?? null;
  const co2V2 = snapshot.co2_pred_30m_v2 ?? null;
  const pm25Pred = pm25V2 ?? pm25Base;
  const co2Pred = co2V2 ?? co2Base;
  const pm25Delta = pm25Pred - pm25Now;
  const co2Delta  = co2Pred - co2Now;

  const aeci = snapshot as typeof snapshot & {
    celi_score?: number;
    total_burden?: number;
  };
  const celiNow = aeci.celi_score ?? snapshot.deps_aqi;
  const burdenNow = aeci.total_burden ?? celiNow;
  // Crude projected burden — scale current burden by the ratio of forecast PM2.5 → now PM2.5
  const burdenPred = pm25Now > 0.5
    ? burdenNow * (pm25Pred / pm25Now) * 0.6 + burdenNow * 0.4
    : burdenNow;
  const celiPred = pm25Now > 0.5
    ? celiNow * (pm25Pred / pm25Now) * 0.6 + celiNow * 0.4
    : celiNow;
  const burdenDelta = burdenPred - burdenNow;

  const forecastChart = (() => {
    const recent = chartHistory.slice(-30).map((p) => ({
      timestamp: p.timestamp,
      actual: p.pm25,
      forecast: null as number | null,
    }));
    const lastTs = recent.length ? new Date(recent[recent.length - 1].timestamp) : new Date();
    const forecast = [];
    for (let i = 1; i <= 6; i++) {
      forecast.push({
        timestamp: new Date(lastTs.getTime() + i * 5 * 60_000).toISOString(),
        actual: null as number | null,
        forecast: pm25Now + (pm25Delta * (i / 6)),
      });
    }
    return [...recent, ...forecast];
  })();

  const baselineChart = baselines.map((b) => ({
    bin: `${Math.floor(b.binIndex / 4).toString().padStart(2, '0')}:${(b.binIndex % 4 * 15).toString().padStart(2, '0')}`,
    baseline: b.pm25_avg,
  }));

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      <PausedBanner />
      <div>
        <div className="label-eyebrow mb-3">Domain VI · Forecasting</div>
        <SplitText
          as="h1"
          text="Predictions"
          stagger={0.025}
          duration={0.95}
          delay={0.1}
          className="font-display text-[clamp(40px,5.5vw,72px)] leading-[0.98] tracking-tight text-primary block"
        />
        <p className="text-xs text-secondary mt-3">30-minute forecasts, burden outlook and baseline analytics</p>
      </div>

      <Card className="space-y-3 relative">
        <div className="absolute top-3 right-3"><DataSourceBadge simulated={simulated} /></div>
        <div className="flex items-center gap-2 pr-32">
          <Sparkles size={16} className="text-aether-400" />
          <h3 className="text-sm font-semibold text-primary">CELI &amp; Burden — 30-min Outlook</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted">CELI now</div>
            <div className="font-data text-2xl font-bold text-primary">{Math.round(celiNow)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">CELI in 30 min</div>
            <div className="font-data text-2xl font-bold" style={{
              color: celiPred > 150 ? '#ef4444' : celiPred > 100 ? '#f97316' : '#10b981',
            }}>
              {Math.round(celiPred)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Predicted burden</div>
            <div className="font-data text-2xl font-bold" style={{
              color: burdenPred > 100 ? '#ef4444' : burdenPred > 70 ? '#f97316' : burdenPred > 40 ? '#f59e0b' : '#10b981',
            }}>
              {burdenPred.toFixed(0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Trend</div>
            <div className="font-data text-2xl font-bold" style={{
              color: burdenDelta > 5 ? '#ef4444' : burdenDelta < -5 ? '#22c55e' : 'var(--text-muted)',
            }}>
              {burdenDelta > 0 ? '+' : ''}{burdenDelta.toFixed(0)}
            </div>
            <div className="text-[10px] text-muted">
              {burdenDelta > 5 ? 'rising' : burdenDelta < -5 ? 'falling' : 'stable'}
            </div>
          </div>
        </div>
      </Card>

      <motion.div variants={containerVariants} initial="initial" animate="animate" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">PM2.5 — 30-min Forecast</h3>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <div className="text-xs text-muted">Now</div>
              <div className="font-data text-3xl font-bold text-primary">{pm25Now.toFixed(1)}</div>
              <div className="text-xs text-muted">µg/m³</div>
            </div>
            <ArrowRight size={20} className="text-muted mt-3" />
            <div>
              <div className="text-xs text-muted">{pm25V2 != null ? 'Holt damped' : 'In 30 min'}</div>
              <div className="font-data text-3xl font-bold" style={{
                color: pm25Pred > 35 ? '#ef4444' : pm25Pred > 15 ? '#f97316' : '#10b981',
              }}>
                {pm25Pred.toFixed(1)}
              </div>
              {snapshot.pm25_pred_lo != null && snapshot.pm25_pred_hi != null ? (
                <div className="text-[10px] text-muted font-data">
                  95% PI {snapshot.pm25_pred_lo.toFixed(1)}–{snapshot.pm25_pred_hi.toFixed(1)}
                </div>
              ) : (
                <div className="text-xs text-muted">µg/m³</div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs font-semibold" style={{
              color: pm25Delta > 0 ? '#ef4444' : pm25Delta < 0 ? '#22c55e' : 'var(--text-muted)',
            }}>
              {pm25Delta > 0 ? <TrendingUp size={14} /> : pm25Delta < 0 ? <TrendingDown size={14} /> : null}
              {pm25Delta > 0 ? '+' : ''}{pm25Delta.toFixed(1)}
            </div>
          </div>
          {pm25V2 != null && (
            <div className="text-[10px] text-muted pt-1 border-t border-theme font-data">
              baseline (EWMA + trend): {pm25Base.toFixed(1)} µg/m³
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">CO₂ — 30-min Forecast</h3>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <div className="text-xs text-muted">Now</div>
              <div className="font-data text-3xl font-bold text-primary">{Math.round(co2Now)}</div>
              <div className="text-xs text-muted">ppm</div>
            </div>
            <ArrowRight size={20} className="text-muted mt-3" />
            <div>
              <div className="text-xs text-muted">{co2V2 != null ? 'Holt damped' : 'In 30 min'}</div>
              <div className="font-data text-3xl font-bold" style={{
                color: co2Pred > 1500 ? '#ef4444' : co2Pred > 1000 ? '#f97316' : '#10b981',
              }}>
                {Math.round(co2Pred)}
              </div>
              {snapshot.co2_pred_lo != null && snapshot.co2_pred_hi != null ? (
                <div className="text-[10px] text-muted font-data">
                  95% PI {Math.round(snapshot.co2_pred_lo)}–{Math.round(snapshot.co2_pred_hi)}
                </div>
              ) : (
                <div className="text-xs text-muted">ppm</div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs font-semibold" style={{
              color: co2Delta > 0 ? '#ef4444' : co2Delta < 0 ? '#22c55e' : 'var(--text-muted)',
            }}>
              {co2Delta > 0 ? <TrendingUp size={14} /> : co2Delta < 0 ? <TrendingDown size={14} /> : null}
              {co2Delta > 0 ? '+' : ''}{Math.round(co2Delta)}
            </div>
          </div>
          {co2V2 != null && (
            <div className="text-[10px] text-muted pt-1 border-t border-theme font-data">
              baseline (EWMA + trend): {Math.round(co2Base)} ppm
            </div>
          )}
        </Card>
      </motion.div>

      {/* Trend with forecast overlay */}
      <Card className="relative">
        <div className="absolute top-3 right-3"><DataSourceBadge simulated={simulated} /></div>
        <div className="text-xs font-medium text-secondary mb-3 uppercase tracking-wide pr-32">
          PM2.5 — Recent + Forecast Overlay
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={forecastChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="actual-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatChartTime}
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              axisLine={false} tickLine={false}
            />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, fontSize: 12,
              }}
            />
            <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="5 4" />
            <Area type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} fill="url(#actual-grad)" connectNulls={false} dot={false} />
            <Line  type="monotone" dataKey="forecast" stroke="#6366f1" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: '#6366f1' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Baseline */}
        <Card>
          <div className="text-xs font-medium text-secondary mb-3 uppercase tracking-wide">
            7-Day Learned Baseline (PM2.5 by hour)
          </div>
          {baselineChart.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-muted">
              Baseline pattern still being learned…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={baselineChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="bin" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval={11} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="baseline" stroke="#818cf8" strokeWidth={2} fill="#818cf8" fillOpacity={0.2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Anomalies */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={14} className="text-orange-400" />
            <div className="text-xs font-medium text-secondary uppercase tracking-wide">Anomaly Detection</div>
          </div>
          {anomalies.length === 0 ? (
            <div className="text-xs text-muted py-8 text-center">No anomalies detected — readings within learned pattern.</div>
          ) : (
            <div className="space-y-2">
              {anomalies.map((a) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-3 p-3 rounded-xl bg-orange-500/5 border border-orange-500/20"
                >
                  <AlertCircle size={14} className="text-orange-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-primary">{a.msg}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {a.ts.toLocaleTimeString()} · score {a.score.toFixed(2)}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Walk-forward backtest metrics — persisted in ForecastMetric for the paper */}
      <Card>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-xs font-medium text-secondary uppercase tracking-wide">
            Forecast Accuracy — Walk-forward Backtest (30-min horizon)
          </div>
          <button
            onClick={() => void runBacktest()}
            disabled={backtestBusy}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-aether-500/15 text-aether-400 border border-aether-500/30 hover:bg-aether-500/25 disabled:opacity-50 transition-colors"
          >
            {backtestBusy ? 'Running…' : 'Run backtest (last 7 days)'}
          </button>
        </div>
        {backtestError && (
          <div className="text-xs text-red-400 mb-2">{backtestError}</div>
        )}
        {metrics.length === 0 ? (
          <div className="text-xs text-muted py-6 text-center">
            No backtest results yet. Run one over stored readings to generate MAE / RMSE / skill
            tables (persisted per pollutant × method × environment profile).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted text-left border-b border-theme">
                  <th className="py-2 pr-3 font-medium">Pollutant</th>
                  <th className="py-2 pr-3 font-medium">Profile</th>
                  <th className="py-2 pr-3 font-medium">Method</th>
                  <th className="py-2 pr-3 font-medium text-right">n</th>
                  <th className="py-2 pr-3 font-medium text-right">MAE</th>
                  <th className="py-2 pr-3 font-medium text-right">RMSE</th>
                  <th className="py-2 font-medium text-right">Skill vs naive</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-b border-theme last:border-0 ${m.method === 'holt_damped' ? 'text-primary' : 'text-secondary'}`}
                  >
                    <td className="py-2 pr-3 font-data uppercase">{m.pollutant}</td>
                    <td className="py-2 pr-3 font-data">{m.profile}</td>
                    <td className="py-2 pr-3">{METHOD_LABELS[m.method] ?? m.method}</td>
                    <td className="py-2 pr-3 font-data text-right">{m.n.toLocaleString()}</td>
                    <td className="py-2 pr-3 font-data text-right">{m.mae.toFixed(2)}</td>
                    <td className="py-2 pr-3 font-data text-right">{m.rmse.toFixed(2)}</td>
                    <td className="py-2 font-data text-right" style={{
                      color: m.skill == null ? 'var(--text-muted)' : m.skill > 0 ? '#22c55e' : '#f97316',
                    }}>
                      {m.skill == null ? '—' : m.skill.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[10px] text-muted mt-2">
              Skill = 1 − MAE(method) / MAE(naive persistence), per pollutant × profile slice.
              Metrics are persisted server-side; each run appends a new batch.
            </div>
          </div>
        )}
      </Card>

      {/* Observed CO₂ decay events — grounds λ_CO₂ in real ventilation data. */}
      <Card>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="text-xs font-medium text-secondary uppercase tracking-wide">
            Ventilation — Observed CO₂ Decay Events
          </div>
          {decaySummary && decaySummary.n > 0 && (
            <div className="text-xs text-secondary font-data">
              N = {decaySummary.n} · median ACH ={' '}
              <span className="text-primary">{decaySummary.medianAch?.toFixed(2)}</span>/hr
              {decaySummary.iqrLo != null && decaySummary.iqrHi != null && (
                <span className="text-muted">
                  {' '}(IQR {decaySummary.iqrLo.toFixed(2)}–{decaySummary.iqrHi.toFixed(2)})
                </span>
              )}
            </div>
          )}
        </div>
        {decayEvents.length === 0 ? (
          <div className="text-xs text-muted py-6 text-center">
            No decay events captured yet. These are recorded automatically when a room
            naturally empties and CO₂ relaxes toward outdoor in a clean exponential decline
            (e.g. overnight). Each event yields one air-change-rate estimate (= λ_CO₂).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted text-left border-b border-theme">
                  <th className="py-2 pr-3 font-medium">Started</th>
                  <th className="py-2 pr-3 font-medium text-right">Duration</th>
                  <th className="py-2 pr-3 font-medium text-right">CO₂ drop</th>
                  <th className="py-2 pr-3 font-medium text-right">ACH (λ)</th>
                  <th className="py-2 pr-3 font-medium text-right">R²</th>
                  <th className="py-2 font-medium text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {decayEvents.map((e) => (
                  <tr
                    key={e.id}
                    className={`border-b border-theme last:border-0 ${e.simulated ? 'text-muted' : 'text-secondary'}`}
                  >
                    <td className="py-2 pr-3 font-data">
                      {new Date(e.startedAt).toLocaleString()}
                      {e.simulated && <span className="ml-1 text-[10px] uppercase">sim</span>}
                    </td>
                    <td className="py-2 pr-3 font-data text-right">{Math.round(e.durationMin)} min</td>
                    <td className="py-2 pr-3 font-data text-right">
                      {Math.round(e.c0_ppm)}→{Math.round(e.cEnd_ppm)}
                    </td>
                    <td className="py-2 pr-3 font-data text-right text-primary">{e.ach_est.toFixed(2)}</td>
                    <td className="py-2 pr-3 font-data text-right" style={{
                      color: e.r_squared >= 0.97 ? '#22c55e' : '#eab308',
                    }}>
                      {e.r_squared.toFixed(3)}
                    </td>
                    <td className="py-2 font-data text-right">{e.nPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[10px] text-muted mt-2">
              Air-change rate a is the negative slope of an OLS fit of ln(C − C_ext) on time;
              only clean exponential declines (R² ≥ 0.90, sustained) are kept. Median ACH is the
              data-grounded estimate of the TEM decay rate λ_CO₂.
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
