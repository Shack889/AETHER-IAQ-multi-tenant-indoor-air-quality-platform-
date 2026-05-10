'use client';

import {
  motion, useMotionValue, useSpring, useTransform, useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import { ReactNode, useRef } from 'react';
import { cn } from '@/lib/utils';

function Glare({ gx, gy }: { gx: MotionValue<string>; gy: MotionValue<string> }) {
  const bg = useTransform(
    [gx, gy] as MotionValue<string>[],
    (latest: string[]) =>
      `radial-gradient(380px circle at ${latest[0]} ${latest[1]}, rgba(79,209,255,0.10), transparent 55%)`,
  );
  return (
    <motion.span
      aria-hidden
      className="absolute inset-0 pointer-events-none rounded-[inherit]"
      style={{ background: bg }}
    />
  );
}

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Max tilt in degrees on either axis. */
  max?: number;
  /** Lift in px on hover. */
  lift?: number;
  /** Render the highlight beam following the cursor. */
  glare?: boolean;
}

/**
 * Subtle 3D tilt + cursor-anchored highlight. Spring-damped, GPU-accelerated.
 * Designed for "hero" cards — overuse will look gimmicky, so apply selectively.
 */
export function TiltCard({
  children,
  className,
  max = 5.5,
  lift = 4,
  glare = true,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const rx = useSpring(useTransform(my, [-1, 1], [max, -max]),
    { stiffness: 220, damping: 22, mass: 0.5 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-max, max]),
    { stiffness: 220, damping: 22, mass: 0.5 });

  // Highlight position (0..100% across the card)
  const gx = useTransform(mx, [-1, 1], ['0%', '100%']);
  const gy = useTransform(my, [-1, 1], ['0%', '100%']);

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

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      whileHover={reduced ? undefined : { y: -lift, transition: { type: 'spring', stiffness: 200, damping: 22 } }}
      style={{
        rotateX: reduced ? 0 : rx,
        rotateY: reduced ? 0 : ry,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
      className={cn('relative', className)}
    >
      {children}

      {glare && !reduced && (
        <Glare gx={gx} gy={gy} />
      )}
    </motion.div>
  );
}
