'use client';

import {
  motion, HTMLMotionProps, useMotionValue, useSpring, useTransform,
  useReducedMotion, type MotionValue,
} from 'framer-motion';
import { useRef } from 'react';
import { cardVariants } from '@/components/animations/variants';
import { cn } from '@/lib/utils';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'variants' | 'initial' | 'animate'> {
  children: React.ReactNode;
  className?: string;
  animated?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'none';
  variant?: 'default' | 'elevated' | 'flush';
  /** Compatibility — no neon halo. */
  glow?: 'cyan' | 'purple' | 'amber' | 'red' | 'green' | 'none';
  /** Compatibility — no shimmer stripe. */
  shimmer?: boolean;
  /** Compatibility — tilt is intentionally subtle now. */
  tilt?: boolean;
  /** Lift on hover, in px. Default 2. */
  hoverLift?: number;
  /** Make the card respond to cursor (gentle tilt + highlight). Default true. */
  reactive?: boolean;
  /** When the card is itself a tap target, spring-bounce on press. */
  pressable?: boolean;
}

const paddingMap = {
  sm:   'p-5',
  md:   'p-6',
  lg:   'p-8',
  none: '',
};

/* Subtle cursor-anchored highlight — paints a 360 px warm radial glow that
 * follows the pointer across the card surface. Very low opacity. */
function CardHighlight({
  gx, gy, opacity,
}: {
  gx: MotionValue<string>;
  gy: MotionValue<string>;
  opacity: MotionValue<number>;
}) {
  const bg = useTransform(
    [gx, gy] as MotionValue<string>[],
    (latest: string[]) =>
      `radial-gradient(360px circle at ${latest[0]} ${latest[1]}, rgba(200, 96, 43, 0.07), transparent 60%)`,
  );
  return (
    <motion.span
      aria-hidden
      className="absolute inset-0 pointer-events-none rounded-[inherit]"
      style={{ background: bg, opacity }}
    />
  );
}

export function Card({
  children,
  className,
  animated = true,
  padding = 'md',
  variant = 'default',
  hoverLift = 6,
  reactive = true,
  pressable = false,
  ...props
}: CardProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);

  // Cursor-tracked normalized position (-1..1)
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  // Visible tilt — max 4° each axis
  const rx = useSpring(useTransform(my, [-1, 1], [4, -4]), {
    stiffness: 130, damping: 14, mass: 0.8,
  });
  const ry = useSpring(useTransform(mx, [-1, 1], [-4, 4]), {
    stiffness: 130, damping: 14, mass: 0.8,
  });

  // Highlight position in % across card
  const gx = useTransform(mx, [-1, 1], ['0%', '100%']);
  const gy = useTransform(my, [-1, 1], ['0%', '100%']);

  // Highlight opacity follows hover state
  const highlightOpacity = useSpring(0, { stiffness: 220, damping: 30 });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!reactive || reduced) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width  * 2 - 1;
    const dy = (e.clientY - rect.top)  / rect.height * 2 - 1;
    mx.set(Math.max(-1, Math.min(1, dx)));
    my.set(Math.max(-1, Math.min(1, dy)));
    highlightOpacity.set(1);
  };
  const onLeave = () => {
    if (!reactive || reduced) return;
    mx.set(0);
    my.set(0);
    highlightOpacity.set(0);
  };

  const classes = cn(
    'surface-card animate-gpu',
    variant === 'elevated' && 'elevated',
    variant === 'flush' && 'flush',
    paddingMap[padding],
    className,
  );

  // Hover lift — pronounced, springy
  const hover = reduced
    ? undefined
    : {
        y: -hoverLift,
        scale: 1.012,
        borderColor: 'var(--ink-3)',
        transition: { type: 'spring' as const, stiffness: 220, damping: 12, mass: 0.8 },
      };

  // Press bounce — visible compression with overshoot
  const tap = (pressable && !reduced)
    ? {
        scale: 0.96,
        transition: { type: 'spring' as const, stiffness: 380, damping: 9, mass: 0.6 },
      }
    : undefined;

  if (!animated) {
    return (
      <div className={classes} {...props as React.HTMLAttributes<HTMLDivElement>}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      variants={cardVariants}
      initial="initial"
      animate="animate"
      whileHover={hover}
      whileTap={tap}
      className={classes}
      style={{
        rotateX: reactive && !reduced ? rx : 0,
        rotateY: reactive && !reduced ? ry : 0,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
      {...props}
    >
      {reactive && !reduced && (
        <CardHighlight gx={gx} gy={gy} opacity={highlightOpacity} />
      )}
      {children}
    </motion.div>
  );
}
