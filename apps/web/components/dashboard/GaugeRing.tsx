'use client';

import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import { gaugeSpring } from '@/components/animations/variants';
import { getAlertColor } from '@/lib/utils';

interface GaugeRingProps {
  value: number;
  maxValue?: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  sublabel?: string;
  unit?: string;
  alertLevel?: number;
  showValue?: boolean;
  /** Accepted for compatibility — editorial mode never adds a halo / ticks. */
  cinematic?: boolean;
}

function AnimatedNumber({ value, color }: { value: number; color: string }) {
  const spring = useSpring(value, { stiffness: 50, damping: 20, mass: 0.6 });
  const display = useTransform(spring, (v) => Math.round(v).toString());
  useEffect(() => { spring.set(value); }, [value, spring]);
  return <motion.span style={{ color }}>{display}</motion.span>;
}

export function GaugeRing({
  value,
  maxValue = 100,
  size = 200,
  strokeWidth = 1.5,
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
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Breathing atmospheric halo behind the ring */}
        <motion.div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            inset: -size * 0.35,
            background: `radial-gradient(closest-side, ${color}1F, transparent 72%)`,
            filter: 'blur(28px)',
            willChange: 'opacity, transform',
          }}
          animate={{ opacity: [0.55, 0.85, 0.55], scale: [1, 1.02, 1] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        <svg width={size} height={size} className="relative -rotate-90 block" style={{ willChange: 'transform' }}>
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke="var(--rule)"
            strokeWidth={strokeWidth}
          />

          <motion.circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth + 0.5}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={gaugeSpring}
          />
        </svg>

        {showValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none">
            <div className="font-display leading-none" style={{ fontSize: Math.round(size * 0.36), color: 'var(--ink-1)' }}>
              <AnimatedNumber value={clampedValue} color="var(--ink-1)" />
            </div>
            {unit && (
              <div className="text-[11px] text-muted font-data tracking-wide mt-2">{unit}</div>
            )}
          </div>
        )}
      </div>

      {(label || sublabel) && (
        <div className="text-center mt-5">
          {label && <div className="label-eyebrow">{label}</div>}
          {sublabel && <div className="text-[11px] text-secondary mt-1.5">{sublabel}</div>}
        </div>
      )}
    </div>
  );
}
