'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from 'lucide-react';
import { useSensorData } from '@/hooks/useSensorData';
import { useAetherStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { LiveMonitorSkeleton } from '@/components/dashboard/LiveMonitorSkeleton';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { GaugeRing } from '@/components/dashboard/GaugeRing';
import { SensorChart } from '@/components/dashboard/SensorChart';
import { EventFeed } from '@/components/dashboard/EventFeed';
import { ComplianceBadge } from '@/components/dashboard/ComplianceBadge';
import { ProfileSelector } from '@/components/dashboard/ProfileSelector';
import { aqiToLevel } from '@/lib/utils';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { DEPS_PROFILES } from '@aether/shared';

function TrendArrow({ slope }: { slope: number | null }) {
  if (slope === null || Math.abs(slope) < 0.05) {
    return (
      <div className="flex items-center gap-1.5 text-muted">
        <Minus size={18} />
        <span className="text-xs font-medium">Stable</span>
      </div>
    );
  }
  if (slope > 1) {
    return (
      <div className="flex items-center gap-1.5 text-red-400">
        <ArrowUp size={18} />
        <span className="text-xs font-semibold">Rising fast</span>
      </div>
    );
  }
  if (slope > 0) {
    return (
      <div className="flex items-center gap-1.5 text-orange-400">
        <TrendingUp size={18} />
        <span className="text-xs font-medium">Rising</span>
      </div>
    );
  }
  if (slope < -1) {
    return (
      <div className="flex items-center gap-1.5 text-green-400">
        <ArrowDown size={18} />
        <span className="text-xs font-semibold">Falling fast</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-green-400">
      <TrendingDown size={18} />
      <span className="text-xs font-medium">Falling</span>
    </div>
  );
}

export default function LiveMonitorPage() {
  const { snapshot, raw, chartHistory, isLoading } = useSensorData();
  const { activeProfile } = useAetherStore();

  if (isLoading || !snapshot || !raw) {
    return <LiveMonitorSkeleton />;
  }

  const profile = DEPS_PROFILES[activeProfile];
  const depsLevel = aqiToLevel(snapshot.deps_aqi);
  const epaLevel = aqiToLevel(snapshot.epa_aqi);

  const pm25Series = chartHistory.map((p) => ({ timestamp: p.timestamp, value: p.pm25 }));
  const co2Series  = chartHistory.map((p) => ({ timestamp: p.timestamp, value: p.co2  }));

  const events = snapshot.event_type
    ? [{
        id: `${snapshot.timestamp.toString()}-${snapshot.event_type}`,
        type: snapshot.event_type,
        message: `Detected via multi-pollutant signature analysis`,
        timestamp: snapshot.timestamp,
        confidence: snapshot.event_confidence ?? 0.85,
      }]
    : [];

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="space-y-5"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-primary">Live Monitor</h1>
          <p className="text-xs text-secondary mt-0.5">
            Real-time air quality from {snapshot.nodeId}
          </p>
        </div>
        <ProfileSelector />
      </div>

      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 lg:grid-cols-3 gap-5"
      >
        {/* DEPS AQI hero */}
        <Card className="lg:col-span-2 flex flex-col items-center gap-4 py-6">
          <div className="flex items-center gap-10 flex-wrap justify-center">
            <GaugeRing
              value={snapshot.deps_aqi}
              maxValue={300}
              size={200}
              strokeWidth={14}
              label="DEPS AQI"
              sublabel={profile?.label ?? activeProfile}
              alertLevel={depsLevel}
            />
            <div className="flex flex-col items-center">
              <GaugeRing
                value={snapshot.epa_aqi}
                maxValue={300}
                size={120}
                strokeWidth={9}
                label="EPA AQI"
                sublabel="reference"
                alertLevel={epaLevel}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 pt-2 border-t border-theme w-full justify-center">
            <TrendArrow slope={snapshot.trend_slope} />
            {snapshot.pm25_pred_30m != null && (
              <div className="text-xs text-muted">
                <span className="font-medium text-secondary">30-min PM2.5:</span>{' '}
                <span className="font-data text-primary">
                  {snapshot.pm25_pred_30m.toFixed(1)} µg/m³
                </span>
              </div>
            )}
            {snapshot.co2_pred_30m != null && (
              <div className="text-xs text-muted">
                <span className="font-medium text-secondary">30-min CO₂:</span>{' '}
                <span className="font-data text-primary">
                  {Math.round(snapshot.co2_pred_30m)} ppm
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Event feed */}
        <Card className="flex flex-col">
          <div className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">
            Event Detection
          </div>
          <div className="flex-1 min-h-0">
            <EventFeed events={events} />
          </div>
        </Card>
      </motion.div>

      {/* Sensor metric grid (7 cards) */}
      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3"
      >
        <MetricCard
          label="PM2.5"
          value={snapshot.pm25_corrected}
          unit="µg/m³"
          alertLevel={snapshot.pm25_corrected > 35 ? 2 : snapshot.pm25_corrected > 15 ? 1 : 0}
          decimals={1}
        />
        <MetricCard
          label="PM10"
          value={raw.pm10}
          unit="µg/m³"
          alertLevel={raw.pm10 > 150 ? 3 : raw.pm10 > 50 ? 1 : 0}
          decimals={0}
        />
        <MetricCard
          label="CO₂"
          value={snapshot.co2_filtered}
          unit="ppm"
          alertLevel={snapshot.co2_filtered > 1500 ? 3 : snapshot.co2_filtered > 1000 ? 2 : snapshot.co2_filtered > 800 ? 1 : 0}
          decimals={0}
        />
        <MetricCard
          label="TVOC"
          value={snapshot.voc_filtered}
          unit="idx"
          alertLevel={snapshot.voc_filtered > 250 ? 3 : snapshot.voc_filtered > 150 ? 2 : snapshot.voc_filtered > 100 ? 1 : 0}
          decimals={0}
        />
        <MetricCard
          label="Temp"
          value={snapshot.temp_filtered}
          unit="°C"
          alertLevel={snapshot.temp_filtered > 28 || snapshot.temp_filtered < 18 ? 1 : 0}
          decimals={1}
        />
        <MetricCard
          label="Humidity"
          value={snapshot.rh_filtered}
          unit="%"
          alertLevel={snapshot.rh_filtered > 65 || snapshot.rh_filtered < 30 ? 1 : 0}
          decimals={0}
        />
        <MetricCard
          label="Pressure"
          value={raw.pressure ?? 1013}
          unit="hPa"
          decimals={0}
        />
      </motion.div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <SensorChart
            data={pm25Series}
            color="#10b981"
            label="PM2.5 (24h)"
            unit="µg/m³"
            thresholdValue={15}
            thresholdLabel="WHO 15 µg"
          />
        </Card>
        <Card>
          <SensorChart
            data={co2Series}
            color="#6366f1"
            label="CO₂ (24h)"
            unit="ppm"
            thresholdValue={1000}
            thresholdLabel="ASHRAE 1000 ppm"
          />
        </Card>
      </div>

      {/* Compliance bar */}
      <Card>
        <div className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">
          Compliance Status
        </div>
        <div className="flex flex-wrap gap-2">
          <ComplianceBadge standard="WHO"        passed={snapshot.who_pass} />
          <ComplianceBadge standard="EPA"        passed={snapshot.epa_pass} />
          <ComplianceBadge standard="BNAAQS"     passed={snapshot.bnaaqs_pass} />
          <ComplianceBadge standard="ASHRAE 62.1" passed={snapshot.ashrae_pass} />
          <ComplianceBadge standard="WELL"       passed={snapshot.well_pass} />
          <ComplianceBadge standard="RESET"      passed={snapshot.reset_pass} />
          <ComplianceBadge
            standard="ASHRAE 55"
            passed={
              snapshot.thermal_pmv == null
                ? null
                : snapshot.thermal_pmv >= -0.5 && snapshot.thermal_pmv <= 0.5
            }
          />
        </div>
      </Card>

      {/* Quick stats — Row 5 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="space-y-1.5">
          <div className="text-xs font-medium text-secondary uppercase tracking-wide">CPIS</div>
          <div className="font-data text-2xl font-bold tabular-nums text-primary">
            {snapshot.cpis}<span className="text-sm text-muted">/100</span>
          </div>
          <div className="text-xs text-muted">Cognitive performance index</div>
        </Card>
        <Card className="space-y-1.5">
          <div className="text-xs font-medium text-secondary uppercase tracking-wide">CED PM2.5</div>
          <div className="font-data text-2xl font-bold tabular-nums text-primary">
            {snapshot.ced_pm25.toFixed(1)}<span className="text-sm text-muted"> µg·hr</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-aether-400"
              style={{ width: `${Math.min(100, (snapshot.ced_pm25 / (15 * 8)) * 100)}%` }}
            />
          </div>
        </Card>
        <Card className="space-y-1.5">
          <div className="text-xs font-medium text-secondary uppercase tracking-wide">Occupancy</div>
          <div className="font-data text-2xl font-bold tabular-nums text-primary">
            {snapshot.occupancy_est ?? '—'}<span className="text-sm text-muted"> people</span>
          </div>
          <div className="text-xs text-muted">CO₂ mass-balance estimate</div>
        </Card>
        <Card className="space-y-1.5">
          <div className="text-xs font-medium text-secondary uppercase tracking-wide">Ventilation</div>
          <div className="flex items-center gap-2">
            <span
              className={`font-data text-2xl font-bold tabular-nums ${
                snapshot.ventilation_cmd === 'on'
                  ? 'text-green-400'
                  : snapshot.ventilation_cmd === 'modulate'
                  ? 'text-yellow-400'
                  : 'text-muted'
              }`}
            >
              {snapshot.ventilation_cmd ?? 'off'}
            </span>
          </div>
          <div className="text-xs text-muted">
            PID output {snapshot.pid_output != null ? `${snapshot.pid_output.toFixed(0)}%` : '—'}
          </div>
        </Card>
      </div>
    </motion.div>
  );
}
