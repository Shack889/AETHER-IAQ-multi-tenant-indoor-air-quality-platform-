'use client';

import {
  motion, useMotionValue, useSpring, useTransform, useReducedMotion,
} from 'framer-motion';
import { ReactNode, useRef } from 'react';

interface MagneticProps {
  children: ReactNode;
  className?: string;
  /** Maximum displacement in px from rest position. */
  strength?: number;
  /** How tightly the spring holds onto the cursor. */
  stiffness?: number;
  damping?: number;
  /** Whether to render as button or div. */
  as?: 'button' | 'div' | 'span';
  onClick?: React.MouseEventHandler;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Wraps any element so it gently drifts toward the cursor while hovered.
 * The motion is spring-damped and never sharp; release softly returns to rest.
 * Honors prefers-reduced-motion.
 */
export function Magnetic({
  children,
  className,
  strength = 16,
  stiffness = 220,
  damping = 18,
  as = 'div',
  onClick,
  type,
  disabled,
  ariaLabel,
}: MagneticProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const xs = useSpring(x, { stiffness, damping, mass: 0.4 });
  const ys = useSpring(y, { stiffness, damping, mass: 0.4 });

  const handleMove = (e: React.MouseEvent<HTMLElement>) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width  / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    x.set(Math.max(-1, Math.min(1, dx)) * strength);
    y.set(Math.max(-1, Math.min(1, dy)) * strength);
  };
  const handleLeave = () => { x.set(0); y.set(0); };

  const Tag = as === 'button' ? motion.button
    : as === 'span' ? motion.span
    : motion.div;

  return (
    <Tag
      // @ts-expect-error: ref union
      ref={ref}
      type={type}
      disabled={disabled}
      aria-label={ariaLabel}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      className={className}
      style={{ x: xs, y: ys, willChange: 'transform' }}
      whileTap={reduced ? undefined : { scale: 0.96, transition: { type: 'spring', stiffness: 420, damping: 26 } }}
    >
      {children}
    </Tag>
  );
}
