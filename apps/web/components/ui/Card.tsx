'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { cardVariants } from '@/components/animations/variants';
import { cn } from '@/lib/utils';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'variants' | 'initial' | 'animate'> {
  children: React.ReactNode;
  className?: string;
  animated?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

const paddingMap = {
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-6',
  none: '',
};

export function Card({ children, className, animated = true, padding = 'md', ...props }: CardProps) {
  const classes = cn('surface-card animate-gpu', paddingMap[padding], className);

  if (animated) {
    return (
      <motion.div
        variants={cardVariants}
        initial="initial"
        animate="animate"
        whileHover={{ translateY: -2, transition: { duration: 0.2 } }}
        className={classes}
        {...props}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className={classes} {...props as React.HTMLAttributes<HTMLDivElement>}>
      {children}
    </div>
  );
}
