'use client';

import { motion, Variants, useReducedMotion } from 'framer-motion';
import { Fragment, ReactNode, useMemo } from 'react';

const QUIET = [0.22, 1, 0.36, 1] as const;

interface SplitTextProps {
  text: string;
  className?: string;
  /** word | char — char gives the cinematic per-letter reveal. */
  by?: 'word' | 'char';
  delay?: number;
  stagger?: number;
  duration?: number;
  /** Trigger as soon as mounted (default) or wait for viewport. */
  trigger?: 'mount' | 'inView';
  /** Render as a heading element. */
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
}

/**
 * Editorial split-text reveal:
 *   blur(8px) + opacity:0 + y:14   →   blur(0) + opacity:1 + y:0
 * Per-character with staggered timing. Reads as "type discovers itself"
 * rather than "type animates in".
 *
 * Honors prefers-reduced-motion.
 */
export function SplitText({
  text,
  className,
  by = 'char',
  delay = 0,
  stagger = 0.018,
  duration = 0.85,
  trigger = 'mount',
  as = 'h1',
}: SplitTextProps) {
  const reduced = useReducedMotion();

  const groups = useMemo(() => {
    if (by === 'word') return text.split(/(\s+)/);
    return text.split('');
  }, [text, by]);

  const containerVariants: Variants = {
    initial: {},
    animate: {
      transition: { staggerChildren: stagger, delayChildren: delay },
    },
  };

  const itemVariants: Variants = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 14, filter: 'blur(8px)' },
        animate: {
          opacity: 1, y: 0, filter: 'blur(0px)',
          transition: { duration, ease: QUIET },
        },
      };

  const containerProps = trigger === 'mount'
    ? { initial: 'initial', animate: 'animate' }
    : { initial: 'initial', whileInView: 'animate', viewport: { once: true, margin: '-12%' } };

  const Tag = motion[as];

  return (
    <Tag
      variants={containerVariants}
      {...containerProps}
      className={className}
      aria-label={text}
    >
      {groups.map((g, i) => {
        // Preserve whitespace so layout/wrapping stays correct
        if (/^\s+$/.test(g)) return <Fragment key={i}>{g}</Fragment>;
        if (by === 'word') {
          return (
            <motion.span
              key={i}
              variants={itemVariants}
              style={{ display: 'inline-block', willChange: 'transform, opacity, filter' }}
              aria-hidden
            >
              {g}
            </motion.span>
          );
        }
        // char mode — wrap each char; use non-breaking space for spaces so
        // the reveal cadence still hits on whitespace
        return (
          <motion.span
            key={i}
            variants={itemVariants}
            style={{ display: 'inline-block', willChange: 'transform, opacity, filter' }}
            aria-hidden
          >
            {g === ' ' ? ' ' : g}
          </motion.span>
        );
      })}
    </Tag>
  );
}
