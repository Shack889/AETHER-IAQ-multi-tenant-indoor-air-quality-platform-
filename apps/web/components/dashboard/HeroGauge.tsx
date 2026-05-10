'use client';

import {
  motion, useMotionValue, useSpring, useTransform, useReducedMotion,
} from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { gaugeSpring } from '@/components/animations/variants';
import { getAlertColor } from '@/lib/utils';

interface HeroGaugeProps {
  value: number;
  maxValue?: number;
  size?: number;
  /** Eyebrow shown above the numeral, e.g. "CELI". */
  label: string;
  /** Pill chip shown beneath the numeral. */
  sublabel?: string;
  unit?: string;
  alertLevel?: number;
  /** Show a live-update pulse ring whenever `value` changes. Default true. */
  livePulse?: boolean;
}

function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 50, damping: 20, mass: 0.6 });
  const display = useTransform(spring, (v) => Math.round(v).toString());
  useEffect(() => { spring.set(value); }, [value, spring]);
  return <motion.span>{display}</motion.span>;
}

/**
 * Premium 3-D hero gauge for the CELI centrepiece.
 *
 * Stack (back → front):
 *   1. Breathing atmospheric halo (radial glow that pulses)
 *   2. Inner glassy orb — radial gradient (color tint), conic sweep
 *      simulating overhead light
 *   3. Outer scientific tick bezel — 60 ticks, lit progressively to the
 *      current fraction with drop-shadow glow on the lit portion
 *   4. Hairline reference circle
 *   5. Active value arc — gradient stroke + outer glow
 *   6. Glassy reflection (radial highlight off-centre, ~35/30%)
 *   7. Inner concentric ring (depth illusion)
 *   8. Centre typography column: eyebrow → big serif numeral → unit → profile chip
 *
 * Reactive: cursor-tracked subtle 3-D tilt (±3°) via spring.
 * GPU-only animations.
 */
export function HeroGauge({
  value,
  maxValue = 300,
  size = 380,
  label,
  sublabel,
  unit,
  alertLevel = 0,
  livePulse = true,
}: HeroGaugeProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);

  // Live-update pulse: each value change spawns an outward ring that fades.
  const [pulses, setPulses] = useState<number[]>([]);
  const prevValRef = useRef<number>(value);
  useEffect(() => {
    if (!livePulse || reduced) return;
    if (prevValRef.current === value) return;
    prevValRef.current = value;
    const id = Date.now() + Math.random();
    setPulses((p) => [...p, id]);
    const t = setTimeout(() => {
      setPulses((p) => p.filter((x) => x !== id));
    }, 1600);
    return () => clearTimeout(t);
  }, [value, livePulse, reduced]);

  const radius = (size - 10) / 2;
  const arcRadius = radius - 12;          // value arc sits inside tick ring
  const orbRadius = radius - 28;
  const innerRingRadius = radius - 40;
  const circumference = arcRadius * 2 * Math.PI;
  const fraction = Math.min(1, Math.max(0, value / maxValue));
  const dashOffset = circumference * (1 - fraction);
  const color = getAlertColor(alertLevel);
  const center = size / 2;

  // Cursor tilt
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-1, 1], [3, -3]),
    { stiffness: 130, damping: 14, mass: 0.8 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-3, 3]),
    { stiffness: 130, damping: 14, mass: 0.8 });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width  * 2 - 1;
    const dy = (e.clientY - rect.top)  / rect.height * 2 - 1;
    mx.set(Math.max(-1, Math.min(1, dx)));
    my.set(Math.max(-1, Math.min(1, dy)));
  };
  const onLeave = () => { mx.set(0); my.set(0); };

  // 60-tick bezel
  const tickCount = 60;
  const tickInner = radius - 6;
  const tickOuter = radius + 4;

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="relative flex flex-col items-center"
      style={{ perspective: 900 }}
    >
      <motion.div
        className="relative"
        style={{
          width: size,
          height: size,
          rotateX: reduced ? 0 : rx,
          rotateY: reduced ? 0 : ry,
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
      >
        {/* Breathing atmospheric halo */}
        <motion.div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            inset: -size * 0.32,
            background: `radial-gradient(closest-side, ${color}26, transparent 70%)`,
            filter: 'blur(40px)',
            willChange: 'opacity, transform',
          }}
          animate={reduced ? undefined : { opacity: [0.5, 0.9, 0.5], scale: [1, 1.04, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Live-update pulse rings — emitted on each value change */}
        {pulses.map((id) => (
          <motion.span
            key={id}
            aria-hidden
            initial={{ scale: 0.85, opacity: 0.7 }}
            animate={{ scale: 1.55, opacity: 0 }}
            transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: `1.5px solid ${color}`,
              boxShadow: `0 0 18px ${color}55, inset 0 0 18px ${color}22`,
            }}
          />
        ))}

        <svg width={size} height={size} className="block relative -rotate-90" style={{ willChange: 'transform' }}>
          <defs>
            <radialGradient id="hg-orb-tint" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={`${color}1A`} />
              <stop offset="55%"  stopColor={`${color}08`} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <radialGradient id="hg-orb-light" cx="35%" cy="30%" r="80%">
              <stop offset="0%"   stopColor="rgba(255, 245, 230, 0.10)" />
              <stop offset="40%"  stopColor="rgba(255, 245, 230, 0.04)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <linearGradient id="hg-arc" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="hg-shadow" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%"   stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(20, 17, 13, 0.10)" />
            </linearGradient>
          </defs>

          {/* Inner glassy orb tint */}
          <circle cx={center} cy={center} r={orbRadius} fill="url(#hg-orb-tint)" />

          {/* Tick bezel */}
          {Array.from({ length: tickCount }).map((_, i) => {
            const angle = (i / tickCount) * Math.PI * 2;
            const isMajor = i % 5 === 0;
            const inner = tickInner - (isMajor ? 0 : 4);
            const outer = tickOuter;
            const x1 = center + Math.cos(angle) * inner;
            const y1 = center + Math.sin(angle) * inner;
            const x2 = center + Math.cos(angle) * outer;
            const y2 = center + Math.sin(angle) * outer;
            const lit = i / tickCount <= fraction;
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={lit ? color : 'currentColor'}
                strokeOpacity={lit ? (isMajor ? 0.95 : 0.55) : (isMajor ? 0.20 : 0.08)}
                strokeWidth={isMajor ? 1.6 : 1}
                className={lit ? '' : 'text-muted'}
                style={lit ? { filter: `drop-shadow(0 0 3px ${color}AA)` } : undefined}
              />
            );
          })}

          {/* Hairline reference circle */}
          <circle
            cx={center} cy={center} r={arcRadius}
            fill="none"
            stroke="var(--rule)"
            strokeOpacity={0.65}
            strokeWidth={1}
          />

          {/* Value arc with glow */}
          <motion.circle
            cx={center} cy={center} r={arcRadius}
            fill="none"
            stroke="url(#hg-arc)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={gaugeSpring}
            style={{ filter: `drop-shadow(0 0 14px ${color}80) drop-shadow(0 0 4px ${color}80)` }}
          />

          {/* Soft inner shadow under value arc — depth illusion */}
          <circle cx={center} cy={center} r={orbRadius} fill="url(#hg-shadow)" opacity={0.6} />

          {/* Glassy off-centre highlight */}
          <circle cx={center} cy={center} r={orbRadius} fill="url(#hg-orb-light)" />

          {/* Inner concentric ring */}
          <circle
            cx={center} cy={center} r={innerRingRadius}
            fill="none"
            stroke="var(--rule)"
            strokeOpacity={0.45}
            strokeWidth={0.75}
          />
        </svg>

        {/* Centre typography column */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center select-none"
          style={{ transform: 'translateZ(20px)' }}
        >
          <div className="text-[10px] tracking-[0.32em] uppercase text-muted mb-2 inline-flex items-center gap-2">
            <motion.span
              aria-hidden
              className="w-1 h-1 rounded-full"
              style={{ background: color, boxShadow: `0 0 6px ${color}` }}
              animate={reduced ? undefined : { opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            {label}
          </div>
          <div
            className="font-display leading-none tabular-nums"
            style={{
              fontSize: size * 0.34,
              color: 'var(--ink-1)',
              textShadow: '0 2px 24px rgba(20, 17, 13, 0.12)',
            }}
          >
            <AnimatedNumber value={value} />
          </div>
          {unit && (
            <div className="text-[10px] tracking-[0.22em] uppercase text-muted mt-3 font-data">
              {unit}
            </div>
          )}
          {sublabel && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
              className="mt-5 px-3.5 py-1.5 rounded-full text-[9px] tracking-[0.28em] uppercase font-medium"
              style={{
                background: 'var(--accent-tint)',
                color: 'var(--accent)',
                border: '1px solid rgba(200, 96, 43, 0.20)',
              }}
            >
              {sublabel}
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
