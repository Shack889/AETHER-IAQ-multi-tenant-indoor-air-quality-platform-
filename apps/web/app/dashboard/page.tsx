'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useSensorData } from '@/hooks/useSensorData';
import { useAetherStore } from '@/lib/store';
import { Card } from '@/components/ui/Card';
import { LiveMonitorSkeleton } from '@/components/dashboard/LiveMonitorSkeleton';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { GaugeRing } from '@/components/dashboard/GaugeRing';
import { HeroGauge } from '@/components/dashboard/HeroGauge';
import { SensorChart } from '@/components/dashboard/SensorChart';
import { EventFeed } from '@/components/dashboard/EventFeed';
import { ComplianceBadge } from '@/components/dashboard/ComplianceBadge';
import { ProfileSelector } from '@/components/dashboard/ProfileSelector';
import { BurdenPanel } from '@/components/dashboard/BurdenPanel';
import { ExplainabilityCard } from '@/components/dashboard/ExplainabilityCard';
import { RecoveryBadge } from '@/components/dashboard/RecoveryBadge';
import { aqiToLevel } from '@/lib/utils';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { ScrollReveal } from '@/components/animations/ScrollReveal';
import { SplitText } from '@/components/animations/SplitText';
import { DEPS_PROFILES, ProcessedSnapshot } from '@aether/shared';

type AeciSnapshot = ProcessedSnapshot & {
  celi_score?: number;
  direct_burden?: number;
  interaction_burden?: number;
  total_burden?: number;
  interaction_details?: Array<{ pair: string; coefficient: number; magnitude: number; explanation: string }>;
  cognitive_burden?: number;
  recovery_status?: string;
  explanation_text?: string;
  reliability_pm25?: number;
  reliability_co2?: number;
  reliability_voc?: number;
};

function TrendArrow({ slope }: { slope: number | null }) {
  if (slope === null || Math.abs(slope) < 0.05) {
    return (
      <div className="flex items-center gap-2 text-muted">
        <Minus size={12} strokeWidth={1.4} />
        <span className="text-[10px] tracking-[0.22em] uppercase">Stable</span>
      </div>
    );
  }
  if (slope > 0) {
    return (
      <div className="flex items-center gap-2 text-secondary">
        <TrendingUp size={12} strokeWidth={1.4} />
        <span className="text-[10px] tracking-[0.22em] uppercase">{slope > 1 ? 'Rising fast' : 'Rising'}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-secondary">
      <TrendingDown size={12} strokeWidth={1.4} />
      <span className="text-[10px] tracking-[0.22em] uppercase">{slope < -1 ? 'Falling fast' : 'Falling'}</span>
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
  const aeci = snapshot as AeciSnapshot;
  const celiScore = aeci.celi_score ?? snapshot.deps_aqi;
  const cbsValue = aeci.cognitive_burden ?? snapshot.cpis;
  const depsLevel = aqiToLevel(celiScore);
  const epaLevel = aqiToLevel(snapshot.epa_aqi);

  const pm25Series = chartHistory.map((p) => ({ timestamp: p.timestamp, value: p.pm25 }));
  const co2Series  = chartHistory.map((p) => ({ timestamp: p.timestamp, value: p.co2  }));

  const tail = (key: 'pm25' | 'co2' | 'voc' | 'temp' | 'rh') =>
    chartHistory.slice(-22).map((p) => p[key]);

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
      className="space-y-16"
    >
      {/* Editorial header — title left, profile selector top right */}
      <header className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-2">
        <div className="lg:col-span-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="label-eyebrow mb-4 inline-flex items-center gap-2"
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--good)', boxShadow: '0 0 6px var(--good)' }}
            />
            Live Monitor · {snapshot.nodeId}
          </motion.div>
          <SplitText
            as="h1"
            text="A quiet measure"
            stagger={0.022}
            duration={0.85}
            delay={0.15}
            className="font-display text-[clamp(44px,6vw,84px)] leading-[0.98] tracking-tight text-primary block"
          />
          <SplitText
            as="h1"
            text="of the air around you."
            stagger={0.022}
            duration={0.85}
            delay={0.55}
            className="font-display italic text-[clamp(44px,6vw,84px)] leading-[0.98] tracking-tight text-secondary block"
          />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
          className="lg:col-span-4 flex lg:justify-end"
        >
          <ProfileSelector />
        </motion.div>
      </header>

      {/* Hero unit — CELI + EPA AQI side-by-side, both premium HeroGauges */}
      <section className="flex flex-col items-center gap-12">
        <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 1.4 }}
          >
            <HeroGauge
              value={celiScore}
              maxValue={300}
              size={400}
              label="CELI · Contextual Load"
              sublabel={profile?.label ?? activeProfile}
              alertLevel={depsLevel}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 1.7 }}
          >
            <HeroGauge
              value={snapshot.epa_aqi}
              maxValue={300}
              size={300}
              label="EPA AQI · Reference"
              sublabel="WHO / EPA standard"
              alertLevel={epaLevel}
            />
          </motion.div>
        </div>

        {/* Hairline stats bar — Trend + 30-min forecasts */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1], delay: 2.1 }}
          className="w-full max-w-3xl"
        >
          <div className="grid grid-cols-3 divide-x divide-[var(--rule)] border-y border-[var(--rule)]">
            <div className="px-5 py-5 flex flex-col items-center justify-center gap-3 min-h-[140px]">
              <div className="label-eyebrow">Trend</div>
              <TrendArrow slope={snapshot.trend_slope} />
              <span className="text-[10px] text-muted tracking-wider uppercase">CELI direction</span>
            </div>
            <div className="px-5 py-5 flex flex-col items-center justify-center gap-3 min-h-[140px]">
              <div className="label-eyebrow">PM₂.₅ · 30M</div>
              <div className="font-display text-4xl text-primary leading-none tabular-nums">
                {snapshot.pm25_pred_30m != null ? snapshot.pm25_pred_30m.toFixed(1) : '—'}
              </div>
              <span className="text-[10px] text-muted font-data tracking-wider">µg/m³</span>
            </div>
            <div className="px-5 py-5 flex flex-col items-center justify-center gap-3 min-h-[140px]">
              <div className="label-eyebrow">CO₂ · 30M</div>
              <div className="font-display text-4xl text-primary leading-none tabular-nums">
                {snapshot.co2_pred_30m != null ? Math.round(snapshot.co2_pred_30m) : '—'}
              </div>
              <span className="text-[10px] text-muted font-data tracking-wider">ppm</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Explainability — full width, editorial */}
      <ScrollReveal>
        <ExplainabilityCard
          text={aeci.explanation_text ?? ''}
          updatedAt={snapshot.timestamp}
          alertLevel={snapshot.alert_level}
        />
      </ScrollReveal>

      {/* Burden + Events */}
      <ScrollReveal>
        <motion.div
          variants={containerVariants}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 lg:grid-cols-3 gap-5"
        >
          <div className="lg:col-span-2">
            <BurdenPanel
              directBurden={aeci.direct_burden ?? 0}
              interactionBurden={aeci.interaction_burden ?? 0}
              totalBurden={aeci.total_burden ?? celiScore}
              interactions={aeci.interaction_details ?? []}
            />
          </div>
          <Card padding="lg" className="flex flex-col">
            <div className="label-eyebrow mb-4">Event Detection</div>
            <div className="flex-1 min-h-0">
              <EventFeed events={events} />
            </div>
          </Card>
        </motion.div>
      </ScrollReveal>

      {/* Sensor metric grid */}
      <ScrollReveal>
        <div className="space-y-5">
          <div className="label-eyebrow">Sensor Telemetry</div>
          <motion.div
            variants={containerVariants}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3"
          >
            <MetricCard
              label="PM 2.5"
              value={snapshot.pm25_corrected}
              unit="µg/m³"
              alertLevel={snapshot.pm25_corrected > 35 ? 2 : snapshot.pm25_corrected > 15 ? 1 : 0}
              decimals={1}
              reliability={aeci.reliability_pm25 ?? null}
              spark={tail('pm25')}
            />
            <MetricCard
              label="PM 10"
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
              reliability={aeci.reliability_co2 ?? null}
              spark={tail('co2')}
            />
            <MetricCard
              label="TVOC"
              value={snapshot.voc_filtered}
              unit="idx"
              alertLevel={snapshot.voc_filtered > 250 ? 3 : snapshot.voc_filtered > 150 ? 2 : snapshot.voc_filtered > 100 ? 1 : 0}
              decimals={0}
              reliability={aeci.reliability_voc ?? null}
              spark={tail('voc')}
            />
            <MetricCard
              label="Temperature"
              value={snapshot.temp_filtered}
              unit="°C"
              alertLevel={snapshot.temp_filtered > 28 || snapshot.temp_filtered < 18 ? 1 : 0}
              decimals={1}
              spark={tail('temp')}
            />
            <MetricCard
              label="Humidity"
              value={snapshot.rh_filtered}
              unit="%"
              alertLevel={snapshot.rh_filtered > 65 || snapshot.rh_filtered < 30 ? 1 : 0}
              decimals={0}
              spark={tail('rh')}
            />
            <MetricCard
              label="Pressure"
              value={raw.pressure ?? 1013}
              unit="hPa"
              decimals={0}
            />
          </motion.div>
        </div>
      </ScrollReveal>

      {/* Charts */}
      <ScrollReveal>
        <div className="space-y-5">
          <div className="label-eyebrow">Twenty-four Hour Signal</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card padding="lg">
              <SensorChart
                data={pm25Series}
                color="var(--accent)"
                label="PM 2.5"
                unit="µg/m³"
                thresholdValue={15}
                thresholdLabel="WHO 15 µg"
              />
            </Card>
            <Card padding="lg">
              <SensorChart
                data={co2Series}
                color="var(--ink-2)"
                label="CO₂"
                unit="ppm"
                thresholdValue={1000}
                thresholdLabel="ASHRAE 1000 ppm"
              />
            </Card>
          </div>
        </div>
      </ScrollReveal>

      {/* Compliance */}
      <ScrollReveal>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="label-eyebrow">Compliance</div>
            <span className="text-[10px] text-muted font-data tracking-wider">7 standards · live</span>
          </div>
          <Card padding="lg">
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
        </div>
      </ScrollReveal>

      {/* Quick stats */}
      <ScrollReveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card padding="md" className="space-y-3">
            <div className="label-eyebrow">CBS</div>
            <div className="font-display text-4xl text-primary leading-none">{Math.round(cbsValue)}</div>
            <div className="text-[11px] text-muted">Cognitive burden — memory penalised</div>
          </Card>
          <Card padding="md" className="space-y-3">
            <div className="label-eyebrow">Recovery</div>
            <div><RecoveryBadge status={aeci.recovery_status ?? 'baseline'} /></div>
            <div className="text-[11px] text-muted">Temporal exposure memory</div>
          </Card>
          <Card padding="md" className="space-y-3">
            <div className="label-eyebrow">Occupancy</div>
            <div className="font-display text-4xl text-primary leading-none">{snapshot.occupancy_est ?? '—'}</div>
            <div className="text-[11px] text-muted">CO₂ mass-balance estimate</div>
          </Card>
          <Card padding="md" className="space-y-3">
            <div className="label-eyebrow">Ventilation</div>
            <div className="font-display text-4xl text-primary leading-none capitalize">
              {snapshot.ventilation_cmd ?? 'off'}
            </div>
            <div className="text-[11px] text-muted">
              PID {snapshot.pid_output != null ? `${snapshot.pid_output.toFixed(0)}%` : '—'}
            </div>
          </Card>
        </div>
      </ScrollReveal>
    </motion.div>
  );
}
