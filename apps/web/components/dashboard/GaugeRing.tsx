'use client';

import { motion } from 'framer-motion';
import { gaugeSpring } from '@/components/animations/variants';
import { getAlertColor } from '@/lib/utils';

interface GaugeRingProps {
  value: number;       // 0-100
  maxValue?: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  sublabel?: string;
  unit?: string;
  alertLevel?: number;
  showValue?: boolean;
}

export function GaugeRing({
  value,
  maxValue = 100,
  size = 160,
  strokeWidth = 12,
  label,
  sublabel,
  unit = '',
  alertLevel = 0,
  showValue = true,
}: GaugeRingProps) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = radius * 2 * Math.PI;
  const clampedValue = Math.min(Math.max(value, 0), maxValue);
  const fraction = clampedValue / maxValue;
  const dashOffset = circumference * (1 - fraction);
  const color = getAlertColor(alertLevel);
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" style={{ willChange: 'transform' }}>
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-surface-3 opacity-50"
          />
          {/* Value arc */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: dashOffset }}
            transition={gaugeSpring}
            style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
          />
        </svg>

        {/* Center value */}
        {showValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <motion.div
              key={Math.round(value)}
              initial={{ scale: 0.9, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-data text-3xl font-bold"
              style={{ color }}
            >
              {Math.round(clampedValue)}
            </motion.div>
            {unit && (
              <div className="text-xs text-muted font-medium mt-0.5">{unit}</div>
            )}
          </div>
        )}
      </div>

      <div className="text-center">
        <div className="text-sm font-medium text-primary">{label}</div>
        {sublabel && <div className="text-xs text-muted mt-0.5">{sublabel}</div>}
      </div>
    </div>
  );
}
