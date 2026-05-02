import { Variants } from 'framer-motion';

/** Page entrance — blur + slide up */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 20, filter: 'blur(4px)' },
  animate: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0, y: -10, filter: 'blur(4px)',
    transition: { duration: 0.3 },
  },
};

/** Staggered card container */
export const containerVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

/** Individual card entrance */
export const cardVariants: Variants = {
  initial: { opacity: 0, y: 30, scale: 0.96 },
  animate: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

/** Sidebar nav item hover */
export const sidebarItemVariants: Variants = {
  rest:  { x: 0 },
  hover: { x: 4, transition: { duration: 0.2, ease: 'easeOut' } },
};

/** Alert slide-in from right */
export const alertVariants: Variants = {
  initial: { x: '100%', opacity: 0 },
  animate: {
    x: 0, opacity: 1,
    transition: { type: 'spring', stiffness: 200, damping: 25 },
  },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2 } },
};

/** Badge pop-in */
export const badgeVariants: Variants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: {
    scale: 1, opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 20 },
  },
};

/** Gauge spring physics */
export const gaugeSpring = { type: 'spring', stiffness: 60, damping: 15 } as const;

/** Button press */
export const buttonTap = { scale: 0.97 } as const;
export const buttonHover = { scale: 1.02 } as const;
