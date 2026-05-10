'use client';

import { motion, useSpring, useTransform } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn, getAlertColor } from '@/lib/utils';
import { useEffect } from 'react';

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  alertLevel?: number;
  trend?: 'up' | 'down' | 'stable';
  subValue?: string;
  decimals?: number;
  icon?: React.ReactNode;
  reliability?: number | null;
  spark?: number[];
}

function reliabilityColor(r: number): string {
  if (r > 0.7) return 'var(--good)';
  if (r > 0.5) return 'var(--moderate)';
  return 'var(--unhealthy)';
}

function AnimatedValue({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const spring = useSpring(value, { stiffness: 60, damping: 22, mass: 0.6 });
  const display = useTransform(spring, (v) => v.toFixed(decimals));
  useEffect(() => { spring.set(value); }, [value, spring]);
  return <motion.span>{display}</motion.span>;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 84;
  const h = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.0001, max - min);
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(' L ')}`;
  const last = points[points.length - 1].split(',').map(Number);

  return (
    <svg width={w} height={h} className="block">
      <path d={path} fill="none" stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={last[0]} cy={last[1]} r={1.6} fill={color} />
    </svg>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  alertLevel = 0,
  trend = 'stable',
  subValue,
  decimals = 1,
  icon,
  reliability = null,
  spark,
}: MetricCardProps) {
  const color = getAlertColor(alertLevel);

  return (
    <Card padding="sm" className="flex flex-col gap-3 min-w-0 relative">
      <div className="flex items-center justify-between">
        <span className="label-eyebrow truncate">{label}</span>
        <div className="flex items-center gap-1.5 text-muted">
          {trend === 'up'   && <TrendingUp   size={11} />}
          {trend === 'down' && <TrendingDown size={11} />}
          {trend === 'stable' && <Minus       size={11} />}
          {icon}
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <div
            className="font-display leading-none"
            style={{ fontSize: 38, color: 'var(--ink-1)' }}
          >
            <AnimatedValue value={value} decimals={decimals} />
          </div>
          <div className="text-[11px] text-muted font-data tracking-wide">{unit}</div>
        </div>
        {spark && spark.length > 1 && <Sparkline values={spark} color={color} />}
      </div>

      {subValue && (
        <div className="text-[11px] text-muted truncate">{subValue}</div>
      )}

      {reliability != null && (
        <div
          className="flex items-center gap-1.5 text-[10px] text-muted font-data tracking-wide pt-1 hairline"
          title="Sensor reliability score — measures consistency between raw and filtered readings"
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: reliabilityColor(reliability) }}
          />
          R · {reliability.toFixed(2)}
        </div>
      )}
    </Card>
  );
}
