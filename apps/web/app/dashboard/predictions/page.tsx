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

interface BaselinePoint {
  binIndex: number;
  pm25_avg: number;
  co2_avg: number;
  voc_avg: number;
}

export default function PredictionsPage() {
  const { snapshot, chartHistory, isLoading } = useSensorData();
  const { activeNodeId } = useAetherStore();
  const [baselines, setBaselines] = useState<BaselinePoint[]>([]);
  const [anomalies, setAnomalies] = useState<Array<{ id: string; ts: Date; msg: string; score: number }>>([]);

  useEffect(() => {
    api.getBaselines(activeNodeId)
      .then((d) => setBaselines((d as BaselinePoint[]).slice(0, 96)))
      .catch(() => setBaselines([]));
  }, [activeNodeId]);

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
  const pm25Pred = snapshot.pm25_pred_30m ?? pm25Now;
  const co2Now = snapshot.co2_filtered;
  const co2Pred = snapshot.co2_pred_30m ?? co2Now;
  const pm25Delta = pm25Pred - pm25Now;
  const co2Delta  = co2Pred - co2Now;

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
      <div>
        <h1 className="text-xl font-bold text-primary">Predictions</h1>
        <p className="text-xs text-secondary mt-0.5">30-minute forecasts and baseline analytics</p>
      </div>

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
              <div className="text-xs text-muted">In 30 min</div>
              <div className="font-data text-3xl font-bold" style={{
                color: pm25Pred > 35 ? '#ef4444' : pm25Pred > 15 ? '#f97316' : '#10b981',
              }}>
                {pm25Pred.toFixed(1)}
              </div>
              <div className="text-xs text-muted">µg/m³</div>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs font-semibold" style={{
              color: pm25Delta > 0 ? '#ef4444' : pm25Delta < 0 ? '#22c55e' : 'var(--text-muted)',
            }}>
              {pm25Delta > 0 ? <TrendingUp size={14} /> : pm25Delta < 0 ? <TrendingDown size={14} /> : null}
              {pm25Delta > 0 ? '+' : ''}{pm25Delta.toFixed(1)}
            </div>
          </div>
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
              <div className="text-xs text-muted">In 30 min</div>
              <div className="font-data text-3xl font-bold" style={{
                color: co2Pred > 1500 ? '#ef4444' : co2Pred > 1000 ? '#f97316' : '#10b981',
              }}>
                {Math.round(co2Pred)}
              </div>
              <div className="text-xs text-muted">ppm</div>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs font-semibold" style={{
              color: co2Delta > 0 ? '#ef4444' : co2Delta < 0 ? '#22c55e' : 'var(--text-muted)',
            }}>
              {co2Delta > 0 ? <TrendingUp size={14} /> : co2Delta < 0 ? <TrendingDown size={14} /> : null}
              {co2Delta > 0 ? '+' : ''}{Math.round(co2Delta)}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Trend with forecast overlay */}
      <Card>
        <div className="text-xs font-medium text-secondary mb-3 uppercase tracking-wide">
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

      {/* Accuracy metrics — placeholder */}
      <Card>
        <div className="text-xs font-medium text-secondary mb-3 uppercase tracking-wide">Prediction Accuracy</div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-muted">R² (PM2.5)</div>
            <div className="font-data text-2xl font-bold text-primary">—</div>
            <div className="text-xs text-muted">accumulating data</div>
          </div>
          <div>
            <div className="text-xs text-muted">RMSE (PM2.5)</div>
            <div className="font-data text-2xl font-bold text-primary">—</div>
            <div className="text-xs text-muted">µg/m³</div>
          </div>
          <div>
            <div className="text-xs text-muted">Trend slope</div>
            <div className="font-data text-2xl font-bold text-primary">
              {snapshot.trend_slope?.toFixed(2) ?? '—'}
            </div>
            <div className="text-xs text-muted">µg/m³ / min</div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
