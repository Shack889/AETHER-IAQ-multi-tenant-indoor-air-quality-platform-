import { Variants } from 'framer-motion';

const QUIET = [0.22, 1, 0.36, 1] as const;

/** Page entrance — slow, calm */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1, y: 0,
    transition: { duration: 0.9, ease: QUIET },
  },
  exit: {
    opacity: 0, y: -6,
    transition: { duration: 0.4, ease: QUIET },
  },
};

export const containerVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } },
};

export const cardVariants: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: {
    opacity: 1, y: 0,
    transition: { duration: 0.8, ease: QUIET },
  },
};

export const sidebarItemVariants: Variants = {
  rest:  { x: 0 },
  hover: { x: 2, transition: { duration: 0.35, ease: QUIET } },
};

export const alertVariants: Variants = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1, transition: { duration: 0.5, ease: QUIET } },
  exit:    { x: '100%', opacity: 0, transition: { duration: 0.3, ease: QUIET } },
};

export const badgeVariants: Variants = {
  initial: { scale: 0.92, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: { duration: 0.45, ease: QUIET } },
};

/** Gauge dial — slow, weighty */
export const gaugeSpring = { type: 'spring', stiffness: 38, damping: 22 } as const;

export const buttonTap   = { scale: 0.98 } as const;
export const buttonHover = { scale: 1.0  } as const;
