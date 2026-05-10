'use client';

import {
  motion, useMotionValue, useSpring, useTransform, useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import { CSSProperties, ReactNode, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ClickRipples, useRipples } from './Ripple';

interface MenuItemProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  active?: boolean;
  /** Magnet strength — px the item drifts toward the cursor. Default 12. */
  magnet?: number;
  /** Hover lift in px. Default 6. */
  lift?: number;
  /** Hover scale. Default 1.045 — visible "popping out". */
  hoverScale?: number;
  /** Press scale. Default 0.94. */
  pressScale?: number;
  /** Show the cursor-anchored highlight glow. Default true. */
  highlight?: boolean;
  /** Stagger entrance index. */
  index?: number;
  /** Disable entrance animation (when parent already staggers). */
  noEntrance?: boolean;
  style?: CSSProperties;
  disabled?: boolean;
  'aria-label'?: string;
}

const QUIET = [0.22, 1, 0.36, 1] as const;

function Highlight({ gx, gy, opacity }: {
  gx: MotionValue<string>;
  gy: MotionValue<string>;
  opacity: MotionValue<number>;
}) {
  const bg = useTransform(
    [gx, gy] as MotionValue<string>[],
    (v: string[]) =>
      `radial-gradient(180px circle at ${v[0]} ${v[1]}, rgba(200, 96, 43, 0.12), transparent 65%)`,
  );
  return (
    <motion.span
      aria-hidden
      className="absolute inset-0 pointer-events-none rounded-[inherit]"
      style={{ background: bg, opacity }}
    />
  );
}

/**
 * A menu/list item that:
 *   • magnetically drifts toward the cursor (capped, spring-damped)
 *   • lifts and scales up on hover ("pops" into focus)
 *   • paints a cursor-anchored warm highlight beneath the cursor
 *   • compresses with a real spring-overshoot bounce on press
 *
 * Tuned for premium restraint: amplitudes are small, but the combination of
 * magnet + lift + scale + highlight makes hovering feel materially alive.
 */
export function MenuItem({
  children,
  onClick,
  className,
  active = false,
  magnet = 12,
  lift = 6,
  hoverScale = 1.045,
  pressScale = 0.94,
  highlight = true,
  index = 0,
  noEntrance = false,
  style,
  disabled,
  'aria-label': ariaLabel,
}: MenuItemProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLButtonElement | null>(null);
  const { ripples, trigger } = useRipples();

  // Magnet — looser springs so the lean tracks visibly
  const x  = useMotionValue(0);
  const y  = useMotionValue(0);
  const xs = useSpring(x, { stiffness: 180, damping: 14, mass: 0.7 });
  const ys = useSpring(y, { stiffness: 180, damping: 14, mass: 0.7 });

  // Highlight position
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const gx = useTransform(mx, (v) => `${v}%`);
  const gy = useTransform(my, (v) => `${v}%`);
  const highlightOpacity = useSpring(0, { stiffness: 260, damping: 28 });

  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // magnet
    x.set(((e.clientX - cx) / (rect.width  / 2)) * magnet);
    y.set(((e.clientY - cy) / (rect.height / 2)) * (magnet * 0.55));
    // highlight position
    mx.set(((e.clientX - rect.left) / rect.width)  * 100);
    my.set(((e.clientY - rect.top)  / rect.height) * 100);
    highlightOpacity.set(1);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
    highlightOpacity.set(0);
  };

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onPointerDown={trigger}
      disabled={disabled}
      aria-label={ariaLabel}
      initial={noEntrance ? false : { opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={noEntrance ? undefined : {
        opacity: 1, y: 0, filter: 'blur(0px)',
        transition: { duration: 0.55, ease: QUIET, delay: 0.04 + index * 0.02 },
      }}
      whileHover={reduced ? undefined : {
        scale: hoverScale,
        y: -lift,
        transition: { type: 'spring', stiffness: 260, damping: 11, mass: 0.7 },
      }}
      whileTap={reduced ? undefined : {
        scale: pressScale,
        transition: { type: 'spring', stiffness: 380, damping: 9, mass: 0.6 },
      }}
      style={{
        x: xs, y: ys,
        willChange: 'transform',
        ...style,
      }}
      className={cn(
        'group relative w-full text-left rounded-xl transition-colors duration-300',
        active ? 'text-primary' : 'text-secondary hover:text-primary',
        className,
      )}
    >
      {highlight && !reduced && (
        <Highlight gx={gx} gy={gy} opacity={highlightOpacity} />
      )}
      <ClickRipples ripples={ripples} />
      {children}
    </motion.button>
  );
}
