'use client';

import { motion } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';

export interface Ripple {
  id: number;
  x: number;
  y: number;
}

/**
 * Hook that produces ripple events from a pointerdown handler.
 * Tracks ripples by id; auto-removes them after the animation finishes.
 */
export function useRipples() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);

  const trigger = useCallback((e: React.PointerEvent) => {
    // Ignore if disabled or right/middle click
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const id = idRef.current++;
    setRipples((rs) => [
      ...rs,
      { id, x: e.clientX - rect.left, y: e.clientY - rect.top },
    ]);
    // Remove after animation duration (matches `duration` in <ClickRipples/>)
    setTimeout(() => {
      setRipples((rs) => rs.filter((r) => r.id !== id));
    }, 1100);
  }, []);

  return { ripples, trigger };
}

interface ClickRipplesProps {
  ripples: Ripple[];
  /** CSS color string for the ripple. Default = soft ink. */
  color?: string;
  /** Final scale of each ripple — bigger = more dramatic. Default 8. */
  spread?: number;
  /** Use 'screen' on dark surfaces, 'normal' (default) on light surfaces. */
  blend?: 'normal' | 'screen' | 'multiply' | 'overlay';
}

/**
 * Pure-presentation ripple renderer. Mounts an absolutely-positioned
 * inset:0 overlay that clips ripples via overflow:hidden and rounded:inherit
 * — so ripples respect the parent's border-radius (pills, circles, cards).
 *
 * Uses transform-only animations (scale + opacity) → 60 fps on the GPU.
 */
export function ClickRipples({
  ripples,
  color = 'rgba(20, 17, 13, 0.18)',
  spread = 8,
  blend = 'normal',
}: ClickRipplesProps) {
  return (
    <span
      aria-hidden
      className="absolute inset-0 pointer-events-none rounded-[inherit] overflow-hidden"
    >
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          initial={{ opacity: 0.55, scale: 0 }}
          animate={{ opacity: 0,    scale: spread }}
          transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
          className="absolute rounded-full"
          style={{
            left: r.x - 6,
            top:  r.y - 6,
            width: 12,
            height: 12,
            background: color,
            mixBlendMode: blend,
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </span>
  );
}
