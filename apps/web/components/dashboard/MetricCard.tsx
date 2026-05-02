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
}

function AnimatedValue({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const spring = useSpring(value, { stiffness: 100, damping: 20 });
  const display = useTransform(spring, (v) => v.toFixed(decimals));

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span>{display}</motion.span>;
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
}: MetricCardProps) {
  const color = getAlertColor(alertLevel);

  return (
    <Card className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-secondary uppercase tracking-wide truncate">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          {trend === 'up'   && <TrendingUp   size={14} className="text-red-400"   />}
          {trend === 'down' && <TrendingDown  size={14} className="text-green-400" />}
          {trend === 'stable' && <Minus       size={14} className="text-muted"      />}
          {icon}
        </div>
      </div>

      <div className="flex items-end gap-1.5">
        <div
          className="font-data text-3xl font-bold tabular-nums leading-none"
          style={{ color }}
        >
          <AnimatedValue value={value} decimals={decimals} />
        </div>
        <div className="text-sm text-muted mb-0.5 font-medium">{unit}</div>
      </div>

      {subValue && (
        <div className="text-xs text-muted truncate">{subValue}</div>
      )}

      {/* Status indicator bar */}
      <div className="h-0.5 rounded-full bg-surface-3 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          animate={{ width: `${Math.min(100, (alertLevel / 4) * 100)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </Card>
  );
}
