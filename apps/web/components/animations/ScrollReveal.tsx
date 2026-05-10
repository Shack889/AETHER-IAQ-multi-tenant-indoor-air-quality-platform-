'use client';

import { motion, Variants, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';

const QUIET = [0.22, 1, 0.36, 1] as const;

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** px translateY at start. Default 90 — solare-class amplitude. */
  y?: number;
  delay?: number;
  duration?: number;
  margin?: string;
  once?: boolean;
  as?: 'div' | 'section' | 'article';
}

export function ScrollReveal({
  children,
  className,
  y = 90,
  delay = 0,
  duration = 1.25,
  margin = '-8%',
  once = true,
  as = 'div',
}: ScrollRevealProps) {
  const reduced = useReducedMotion();

  const variants: Variants = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y, filter: 'blur(6px)' },
        animate: {
          opacity: 1, y: 0, filter: 'blur(0px)',
          transition: { duration, ease: QUIET, delay },
        },
      };

  const Comp = motion[as];

  return (
    <Comp
      variants={variants}
      initial="initial"
      whileInView="animate"
      viewport={{ once, margin }}
      className={className}
      style={{ willChange: 'transform, opacity, filter' }}
    >
      {children}
    </Comp>
  );
}

interface StaggerGroupProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  margin?: string;
  once?: boolean;
}

const groupVariants: Variants = {
  initial: {},
  animate: ({ stagger, delay }: { stagger: number; delay: number }) => ({
    transition: { staggerChildren: stagger, delayChildren: delay },
  }),
};

export function StaggerGroup({
  children,
  className,
  delay = 0.05,
  stagger = 0.08,
  margin = '-8%',
  once = true,
}: StaggerGroupProps) {
  return (
    <motion.div
      variants={groupVariants}
      initial="initial"
      whileInView="animate"
      viewport={{ once, margin }}
      custom={{ stagger, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const itemVariants: Variants = {
  initial: { opacity: 0, y: 60, filter: 'blur(4px)' },
  animate: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 1.05, ease: QUIET },
  },
};

export function StaggerItem({
  children,
  className,
}: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={itemVariants}
      className={className}
      style={{ willChange: 'transform, opacity, filter' }}
    >
      {children}
    </motion.div>
  );
}
