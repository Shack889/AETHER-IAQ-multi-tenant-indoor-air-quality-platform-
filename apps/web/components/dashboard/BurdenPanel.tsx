'use client';

import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import { Card } from '@/components/ui/Card';

interface InteractionDetail {
  pair: string;
  coefficient: number;
  magnitude: number;
  explanation: string;
}

interface BurdenPanelProps {
  directBurden: number;
  interactionBurden: number;
  totalBurden: number;
  interactions?: InteractionDetail[];
}

const PAIR_LABEL: Record<string, string> = {
  pm25_rh:        'PM₂.₅ × Humidity',
  co2_temp:       'CO₂ × Temperature',
  voc_temp:       'VOC × Temperature',
  co2_lowvent:    'CO₂ × Low ventilation',
  pm25_voc:       'PM₂.₅ × VOC',
  occupancy_vent: 'Occupancy × Low ventilation',
};

function totalColor(value: number): string {
  if (value < 40)  return 'var(--good)';
  if (value < 70)  return 'var(--moderate)';
  if (value < 100) return 'var(--usg)';
  return 'var(--unhealthy)';
}

function AnimatedBar({
  value,
  maxValue = 150,
  color,
  delay = 0,
  label,
  display,
}: {
  value: number;
  maxValue?: number;
  color: string;
  delay?: number;
  label: string;
  display: string;
}) {
  const spring = useSpring(0, { stiffness: 50, damping: 22 });
  const widthPct = useTransform(spring, (v) => `${Math.min(100, (v / maxValue) * 100)}%`);

  useEffect(() => {
    const t = setTimeout(() => spring.set(value), delay);
    return () => clearTimeout(t);
  }, [value, spring, delay]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-secondary">{label}</span>
        <span className="font-data text-[12px] tabular-nums" style={{ color }}>
          {display}
        </span>
      </div>
      <div className="relative h-[2px] overflow-hidden" style={{ background: 'var(--rule-soft)' }}>
        <motion.div
          className="absolute top-0 left-0 h-full"
          style={{ width: widthPct, background: color }}
        />
      </div>
    </div>
  );
}

export function BurdenPanel({
  directBurden,
  interactionBurden,
  totalBurden,
  interactions = [],
}: BurdenPanelProps) {
  const meaningful = interactions.filter((i) => i.magnitude > 1.0).slice(0, 4);

  return (
    <Card padding="lg" className="space-y-7">
      <div className="flex items-baseline justify-between">
        <span className="label-eyebrow">Environmental Burden</span>
        <span className="font-display text-3xl tabular-nums" style={{ color: totalColor(totalBurden) }}>
          {totalBurden.toFixed(0)}
        </span>
      </div>

      <div className="space-y-5">
        <AnimatedBar
          label="Direct burden"
          value={directBurden}
          color="var(--ink-1)"
          display={directBurden.toFixed(1)}
        />
        <AnimatedBar
          label="Interaction amplification"
          value={interactionBurden}
          color="var(--accent)"
          delay={120}
          display={`+${interactionBurden.toFixed(1)}`}
        />
        <AnimatedBar
          label="Total"
          value={totalBurden}
          color={totalColor(totalBurden)}
          delay={240}
          display={totalBurden.toFixed(1)}
        />
      </div>

      {meaningful.length > 0 && (
        <div className="space-y-4 pt-5 hairline">
          <div className="label-eyebrow">Active interactions</div>
          <div className="space-y-3">
            {meaningful.map((i) => (
              <motion.div
                key={i.pair}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-baseline justify-between gap-4 text-[12px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-primary leading-tight">
                    {PAIR_LABEL[i.pair] ?? i.pair}
                  </div>
                  <div className="text-[11px] text-muted mt-1 leading-snug">
                    {i.explanation}
                  </div>
                </div>
                <span className="font-data text-secondary tabular-nums shrink-0">
                  +{i.magnitude.toFixed(1)}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
