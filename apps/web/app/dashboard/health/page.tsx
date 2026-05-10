'use client';

import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Brain, Wind, Users, Thermometer, Activity, Zap } from 'lucide-react';
import { useSensorData } from '@/hooks/useSensorData';
import { Card } from '@/components/ui/Card';
import { SplitText } from '@/components/animations/SplitText';
import { Skeleton, GaugeSkeleton, ChartSkeleton } from '@/components/ui/Skeleton';
import { GaugeRing } from '@/components/dashboard/GaugeRing';
import { RecoveryBadge } from '@/components/dashboard/RecoveryBadge';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { useAetherStore } from '@/lib/store';
import { formatChartTime } from '@/lib/utils';
import { ProcessedSnapshot } from '@aether/shared';

type AeciSnapshot = ProcessedSnapshot & {
  celi_score?: number;
  direct_burden?: number;
  interaction_burden?: number;
  total_burden?: number;
  interaction_details?: Array<{ pair: string; coefficient: number; magnitude: number; explanation: string }>;
  cognitive_burden?: number;
  cpis_instantaneous?: number;
  recovery_status?: string;
  temporal_memory_pm?: number;
  temporal_memory_co2?: number;
  temporal_memory_voc?: number;
  explanation_text?: string;
};

const PAIR_LABEL: Record<string, string> = {
  pm25_rh:        'PM₂.₅ × Humidity',
  co2_temp:       'CO₂ × Temperature',
  voc_temp:       'VOC × Temperature',
  co2_lowvent:    'CO₂ × Low ventilation',
  pm25_voc:       'PM₂.₅ × VOC',
  occupancy_vent: 'Occupancy × Low vent.',
};

function severityFor(magnitude: number): { label: string; color: string } {
  if (magnitude >= 10)  return { label: 'high',     color: '#ef4444' };
  if (magnitude >=  5)  return { label: 'moderate', color: '#f59e0b' };
  if (magnitude >=  2)  return { label: 'low',      color: '#10b981' };
  return { label: 'minimal', color: '#64748b' };
}

function PMVScale({ pmv }: { pmv: number | null }) {
  if (pmv === null) {
    return <div className="text-xs text-muted">PMV not available</div>;
  }

  const clamped = Math.max(-3, Math.min(3, pmv));
  const positionPct = ((clamped + 3) / 6) * 100;

  let label = 'Neutral';
  let color = '#22c55e';
  if (clamped < -1.5) { label = 'Cold';   color = '#3b82f6'; }
  else if (clamped < -0.5) { label = 'Cool';   color = '#06b6d4'; }
  else if (clamped >  1.5) { label = 'Hot';    color = '#ef4444'; }
  else if (clamped >  0.5) { label = 'Warm';   color = '#f97316'; }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Cold (-3)</span>
        <span className="text-xs font-data font-semibold" style={{ color }}>
          {clamped.toFixed(2)} — {label}
        </span>
        <span className="text-xs text-muted">Hot (+3)</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-gradient-to-r from-blue-500 via-green-500 to-red-500">
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-surface-0 shadow-md"
          animate={{ left: `calc(${positionPct}% - 8px)` }}
          transition={{ type: 'spring', stiffness: 80, damping: 14 }}
        />
      </div>
    </div>
  );
}

export default function HealthPage() {
  const { snapshot, isLoading } = useSensorData();
  const chartHistory = useAetherStore((s) => s.chartHistory);

  if (isLoading || !snapshot) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton width={140} height={20} />
          <Skeleton width={260} variant="text" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <GaugeSkeleton size={180} />
          <div className="lg:col-span-2 surface-card p-5 space-y-4">
            <Skeleton variant="text" width="40%" />
            <Skeleton height={14} />
            <Skeleton height={14} width="80%" />
            <Skeleton height={14} width="60%" />
            <Skeleton height={48} />
          </div>
        </div>
        <ChartSkeleton height={260} />
        <ChartSkeleton height={220} />
      </div>
    );
  }

  const aeci = snapshot as AeciSnapshot;
  const cbs = aeci.cognitive_burden ?? snapshot.cpis;
  const cpisInst = aeci.cpis_instantaneous ?? snapshot.cpis;
  const memoryPenalty = Math.max(0, cpisInst - cbs);
  const cbsLevel = cbs < 50 ? 4 : cbs < 70 ? 2 : cbs < 85 ? 1 : 0;

  // Temporal memory series (last 8 hr — chartHistory is up to 288 entries at ~5 min steps)
  const tem8hSlice = chartHistory.slice(-96);
  const memorySeries = tem8hSlice.map((p) => ({
    timestamp: p.timestamp,
    pm25: p.temporal_memory_pm,
    co2:  p.temporal_memory_co2,
    voc:  p.temporal_memory_voc,
  }));

  // Interaction breakdown — fall back to a deterministic empty list of 6 pairs so the chart is never blank
  const allPairs = ['pm25_rh', 'co2_temp', 'voc_temp', 'co2_lowvent', 'pm25_voc', 'occupancy_vent'];
  const detailMap = new Map((aeci.interaction_details ?? []).map((d) => [d.pair, d]));
  const interactionRows = allPairs.map((p) => {
    const d = detailMap.get(p);
    const magnitude = d?.magnitude ?? 0;
    const sev = severityFor(magnitude);
    return {
      pair: p,
      label: PAIR_LABEL[p] ?? p,
      magnitude,
      severity: sev.label,
      color: sev.color,
      explanation: d?.explanation ?? '',
    };
  });

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      <div>
        <div className="label-eyebrow mb-3">Domain V · VII · Health Analytics</div>
        <SplitText
          as="h1"
          text="Health Impact"
          stagger={0.025}
          duration={0.95}
          delay={0.1}
          className="font-display text-[clamp(40px,5.5vw,72px)] leading-[0.98] tracking-tight text-primary block"
        />
        <p className="text-xs text-secondary mt-3">Cognitive burden, temporal exposure memory, pollutant interactions, and thermal comfort</p>
      </div>

      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 lg:grid-cols-3 gap-5"
      >
        {/* CBS gauge */}
        <Card className="flex flex-col items-center gap-2 py-6">
          <div className="flex items-center gap-2 self-start">
            <Brain size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">Cognitive Burden</h3>
          </div>
          <GaugeRing
            value={cbs}
            maxValue={100}
            size={180}
            label="CBS"
            sublabel={cbs < 70 ? 'Impaired' : cbs < 85 ? 'Reduced' : 'Optimal'}
            unit="/100"
            alertLevel={cbsLevel}
          />
          <div className="flex items-center gap-3 pt-3 border-t border-theme w-full justify-around text-center">
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wide">CBS</div>
              <div className="font-data text-lg font-bold text-primary">{Math.round(cbs)}%</div>
              <div className="text-[10px] text-muted">with memory</div>
            </div>
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wide">CPIS</div>
              <div className="font-data text-lg font-bold text-secondary">{Math.round(cpisInst)}%</div>
              <div className="text-[10px] text-muted">instantaneous</div>
            </div>
          </div>
          <div className="text-[11px] text-muted">Memory penalty: −{memoryPenalty.toFixed(0)} points</div>
        </Card>

        {/* Temporal exposure memory chart */}
        <Card className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-aether-400" />
              <h3 className="text-sm font-semibold text-primary">Temporal Exposure Memory (8-hour window)</h3>
            </div>
            <RecoveryBadge status={aeci.recovery_status ?? 'baseline'} />
          </div>

          {memorySeries.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-muted">
              Memory curves still accumulating…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={memorySeries} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="mem-pm-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mem-co2-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mem-voc-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatChartTime}
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  axisLine={false} tickLine={false} interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 8, fontSize: 12,
                  }}
                  labelFormatter={(t) => formatChartTime(t as string)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="pm25" name="PM₂.₅ (λ=0.05/hr · t½ ≈ 14h)" stroke="#a855f7" fill="url(#mem-pm-grad)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="co2"  name="CO₂ (λ=0.20/hr · t½ ≈ 3.5h)"  stroke="#f59e0b" fill="url(#mem-co2-grad)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="voc"  name="VOC (λ=0.10/hr · t½ ≈ 7h)"   stroke="#14b8a6" fill="url(#mem-voc-grad)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </motion.div>

      {/* Interaction breakdown */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-aether-400" />
          <h3 className="text-sm font-semibold text-primary">Pollutant Interaction Analysis</h3>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={interactionRows} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis dataKey="label" type="category" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={170} />
            <Tooltip
              contentStyle={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, fontSize: 12,
              }}
              formatter={((v: number, _name: string, item: { payload?: { explanation?: string; severity?: string } }) => {
                const p = item.payload ?? {};
                return [
                  `${v.toFixed(1)} (${p.severity ?? 'minimal'})`,
                  p.explanation || 'No active interaction',
                ];
              }) as never}
            />
            <Bar dataKey="magnitude" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {interactionRows.map((r) => (
                <Cell key={r.pair} fill={r.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="text-xs text-muted pt-2 border-t border-theme">
          Combined interaction amplification:{' '}
          <span className="font-data text-primary font-semibold">
            +{(aeci.interaction_burden ?? 0).toFixed(1)}
          </span>
          {' '}points above independent-pollutant assessment
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Thermal comfort */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Thermometer size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">Thermal Comfort (PMV)</h3>
          </div>
          <PMVScale pmv={snapshot.thermal_pmv} />
          <div className="text-xs text-muted">
            ISO 7730 Predicted Mean Vote — based on temperature {snapshot.temp_filtered.toFixed(1)}°C and humidity {snapshot.rh_filtered.toFixed(0)}%.
          </div>
        </Card>

        {/* Occupancy */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">Estimated Occupancy</h3>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-data text-5xl font-bold text-primary tabular-nums">
              {snapshot.occupancy_est ?? '—'}
            </span>
            <span className="text-sm text-muted">people</span>
          </div>
          <div className="text-xs text-muted">
            Derived from CO₂ mass-balance using current concentration ({Math.round(snapshot.co2_filtered)} ppm) and outdoor baseline.
          </div>
        </Card>
      </div>

      {/* Memory exposure summary card */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Wind size={14} className="text-aether-400" />
          <span className="text-xs font-medium text-secondary uppercase tracking-wide">Current memory accumulation</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-muted">PM₂.₅ memory</div>
            <div className="font-data text-2xl font-bold text-primary tabular-nums">
              {(aeci.temporal_memory_pm ?? 0).toFixed(1)}
            </div>
            <div className="text-[10px] text-muted">µg·hr equivalent</div>
          </div>
          <div>
            <div className="text-xs text-muted">CO₂ memory</div>
            <div className="font-data text-2xl font-bold text-primary tabular-nums">
              {(aeci.temporal_memory_co2 ?? 0).toFixed(0)}
            </div>
            <div className="text-[10px] text-muted">ppm·hr equivalent</div>
          </div>
          <div>
            <div className="text-xs text-muted">VOC memory</div>
            <div className="font-data text-2xl font-bold text-primary tabular-nums">
              {(aeci.temporal_memory_voc ?? 0).toFixed(1)}
            </div>
            <div className="text-[10px] text-muted">idx·hr equivalent</div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
