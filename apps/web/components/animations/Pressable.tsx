'use client';

import {
  motion, useMotionValue, useSpring, useReducedMotion,
} from 'framer-motion';
import { CSSProperties, ReactNode, useRef } from 'react';
import { ClickRipples, useRipples } from './Ripple';

type Tag = 'button' | 'a' | 'div' | 'span' | 'li';

interface PressableProps {
  as?: Tag;
  /** Pixels of cursor magnetism. Default 6. 0 disables. */
  magnet?: number;
  /** Px lift on hover. Default 0. */
  lift?: number;
  /** Press scale (0..1). Default 0.92 — visible compression. */
  pressScale?: number;
  /** Show click ripple. Default true. */
  ripple?: boolean;
  /** Ripple color override. Default = soft ink. */
  rippleColor?: string;
  /** Blend mode for ripple. Use 'screen' on dark surfaces. */
  rippleBlend?: 'normal' | 'screen' | 'multiply' | 'overlay';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  // Common HTML props we want to forward
  onClick?: React.MouseEventHandler;
  onMouseEnter?: React.MouseEventHandler;
  onPointerDown?: React.PointerEventHandler;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  href?: string;
  'aria-label'?: string;
  title?: string;
}

/**
 * Universal "tap target" wrapper.
 *
 * Hover  → magnetic drift (capped) + optional small lift
 * Press  → spring bounce: small compression + slight overshoot release
 * Tuned for premium restraint: amplitudes are small (1–4 px / 0.97 scale).
 */
export function Pressable({
  as = 'button',
  magnet = 6,
  lift = 0,
  pressScale = 0.92,
  ripple = true,
  rippleColor,
  rippleBlend,
  onPointerDown,
  className,
  style,
  children,
  ...rest
}: PressableProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement | null>(null);
  const { ripples, trigger } = useRipples();

  const x  = useMotionValue(0);
  const y  = useMotionValue(0);
  const xs = useSpring(x, { stiffness: 180, damping: 13, mass: 0.7 });
  const ys = useSpring(y, { stiffness: 180, damping: 13, mass: 0.7 });

  const onMove = (e: React.MouseEvent) => {
    if (!magnet || reduced) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set(((e.clientX - cx) / (rect.width  / 2)) * magnet);
    y.set(((e.clientY - cy) / (rect.height / 2)) * (magnet * 0.7));
  };
  const onLeave = () => { x.set(0); y.set(0); };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (ripple) trigger(e);
    onPointerDown?.(e);
  };

  const motionProps = {
    onMouseMove: onMove,
    onMouseLeave: onLeave,
    onPointerDown: handlePointerDown,
    whileHover: reduced ? undefined : {
      y: -lift,
      scale: 1.04,
      transition: { type: 'spring' as const, stiffness: 260, damping: 11, mass: 0.65 },
    },
    whileTap: reduced ? undefined : {
      scale: pressScale,
      transition: { type: 'spring' as const, stiffness: 380, damping: 9, mass: 0.55 },
    },
    style: { ...style, x: xs, y: ys, willChange: 'transform' as const },
    className,
    ...rest,
  };

  const props = motionProps as unknown as Record<string, unknown>;

  const inner = (
    <>
      {ripple && <ClickRipples ripples={ripples} color={rippleColor} blend={rippleBlend} />}
      {children}
    </>
  );

  switch (as) {
    case 'a':
      return <motion.a ref={ref as never} {...props}>{inner}</motion.a>;
    case 'div':
      return <motion.div ref={ref as never} {...props}>{inner}</motion.div>;
    case 'span':
      return <motion.span ref={ref as never} {...props}>{inner}</motion.span>;
    case 'li':
      return <motion.li ref={ref as never} {...props}>{inner}</motion.li>;
    case 'button':
    default:
      return <motion.button ref={ref as never} {...props}>{inner}</motion.button>;
  }
}
