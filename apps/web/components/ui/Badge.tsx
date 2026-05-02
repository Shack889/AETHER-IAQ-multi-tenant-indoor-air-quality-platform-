'use client';

import { motion } from 'framer-motion';
import { badgeVariants } from '@/components/animations/variants';
import { cn } from '@/lib/utils';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
  size?: 'sm' | 'md';
  animated?: boolean;
  dot?: boolean;
}

const variantClasses = {
  success: 'bg-green-500/15 text-green-400 border border-green-500/20',
  warning: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
  danger:  'bg-red-500/15 text-red-400 border border-red-500/20',
  neutral: 'bg-slate-500/15 text-slate-400 border border-slate-500/20',
  accent:  'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20',
};

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

const dotColors = {
  success: 'bg-green-400',
  warning: 'bg-yellow-400',
  danger:  'bg-red-400',
  neutral: 'bg-slate-400',
  accent:  'bg-indigo-400',
};

export function Badge({ label, variant = 'neutral', size = 'md', animated = true, dot = false }: BadgeProps) {
  const classes = cn(
    'inline-flex items-center gap-1.5 rounded-full font-medium',
    variantClasses[variant],
    sizeClasses[size],
  );

  const content = (
    <>
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />
      )}
      {label}
    </>
  );

  if (animated) {
    return (
      <motion.span
        variants={badgeVariants}
        initial="initial"
        animate="animate"
        className={classes}
      >
        {content}
      </motion.span>
    );
  }

  return <span className={classes}>{content}</span>;
}
