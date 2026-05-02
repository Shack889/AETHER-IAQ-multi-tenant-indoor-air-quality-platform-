'use client';

import { motion } from 'framer-motion';
import { Brain, Cigarette, Wind, Users, Thermometer } from 'lucide-react';
import { useSensorData } from '@/hooks/useSensorData';
import { Card } from '@/components/ui/Card';
import { Skeleton, GaugeSkeleton, ChartSkeleton } from '@/components/ui/Skeleton';
import { GaugeRing } from '@/components/dashboard/GaugeRing';
import { SensorChart } from '@/components/dashboard/SensorChart';
import { containerVariants, pageVariants } from '@/components/animations/variants';

const PM25_8H_LIMIT_UG_MIN = 15 * 8 * 60;
const CO2_8H_LIMIT_PPM_MIN = 1000 * 8 * 60;

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
  const { snapshot, chartHistory, isLoading } = useSensorData();

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartSkeleton height={120} />
          <ChartSkeleton height={120} />
        </div>
        <ChartSkeleton height={220} />
      </div>
    );
  }

  const cpisLevel = snapshot.cpis < 50 ? 4 : snapshot.cpis < 70 ? 2 : snapshot.cpis < 85 ? 1 : 0;
  const pm25Pct  = Math.min(100, (snapshot.ced_pm25 / PM25_8H_LIMIT_UG_MIN) * 100);
  const co2Pct   = Math.min(100, (snapshot.ced_co2  / CO2_8H_LIMIT_PPM_MIN) * 100);

  const cpisSeries = chartHistory.map((p) => ({
    timestamp: p.timestamp,
    value: Math.max(0, 100 - (p.co2 - 400) / 12 - (p.pm25 / 0.6)),
  }));

  let exposureRisk: { label: string; color: string; bg: string } = {
    label: 'Low risk',
    color: '#22c55e',
    bg: 'bg-green-500/10 border-green-500/20',
  };
  if (pm25Pct > 80 || co2Pct > 80) {
    exposureRisk = { label: 'High risk',     color: '#ef4444', bg: 'bg-red-500/10 border-red-500/20'    };
  } else if (pm25Pct > 50 || co2Pct > 50) {
    exposureRisk = { label: 'Moderate risk', color: '#f97316', bg: 'bg-orange-500/10 border-orange-500/20' };
  }

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Health Impact</h1>
        <p className="text-xs text-secondary mt-0.5">Cognitive, exposure, and thermal comfort indicators</p>
      </div>

      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 lg:grid-cols-3 gap-5"
      >
        {/* CPIS gauge */}
        <Card className="flex flex-col items-center gap-2 py-6">
          <div className="flex items-center gap-2 self-start">
            <Brain size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">Cognitive Performance</h3>
          </div>
          <GaugeRing
            value={snapshot.cpis}
            maxValue={100}
            size={180}
            label="CPIS"
            sublabel={snapshot.cpis < 70 ? 'Impaired' : snapshot.cpis < 85 ? 'Reduced' : 'Optimal'}
            unit="/100"
            alertLevel={cpisLevel}
          />
        </Card>

        {/* CED bars */}
        <Card className="flex flex-col gap-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Cigarette size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">8-Hour Cumulative Exposure</h3>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-secondary">PM2.5 dose</span>
              <span className="text-xs font-data text-primary">
                {snapshot.ced_pm25.toFixed(0)} / {PM25_8H_LIMIT_UG_MIN} µg·min
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: pm25Pct > 80 ? '#ef4444' : pm25Pct > 50 ? '#f97316' : '#10b981',
                }}
                animate={{ width: `${pm25Pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="text-xs text-muted mt-1">{pm25Pct.toFixed(0)}% of WHO 24-hour guideline</div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-secondary">CO₂ dose</span>
              <span className="text-xs font-data text-primary">
                {snapshot.ced_co2.toFixed(0)} / {CO2_8H_LIMIT_PPM_MIN} ppm·min
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: co2Pct > 80 ? '#ef4444' : co2Pct > 50 ? '#f97316' : '#10b981',
                }}
                animate={{ width: `${co2Pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="text-xs text-muted mt-1">{co2Pct.toFixed(0)}% of ASHRAE workplace guideline</div>
          </div>

          <div className={`flex items-center justify-between p-3 rounded-xl border ${exposureRisk.bg}`}>
            <div>
              <div className="text-xs text-muted">Exposure risk assessment</div>
              <div className="text-sm font-semibold mt-0.5" style={{ color: exposureRisk.color }}>
                {exposureRisk.label}
              </div>
            </div>
            <Wind size={20} style={{ color: exposureRisk.color }} />
          </div>
        </Card>
      </motion.div>

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

      {/* CPIS timeline */}
      <Card>
        <SensorChart
          data={cpisSeries}
          color="#10b981"
          label="Cognitive Performance Index — Timeline"
          unit="/100"
          thresholdValue={70}
          thresholdLabel="Impairment threshold"
          height={220}
          yDomain={[0, 100]}
        />
      </Card>
    </motion.div>
  );
}
