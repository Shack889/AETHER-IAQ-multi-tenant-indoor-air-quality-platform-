'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { buttonTap, buttonHover } from '@/components/animations/variants';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'whileHover' | 'whileTap'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  isLoading?: boolean;
}

const variantClasses = {
  primary:   'bg-aether-600 hover:bg-aether-500 text-white',
  secondary: 'bg-surface-2 hover:bg-surface-3 text-primary border border-theme',
  ghost:     'hover:bg-surface-2 text-secondary hover:text-primary',
  danger:    'bg-red-600 hover:bg-red-500 text-white',
};

const sizeClasses = {
  sm: 'text-xs px-3 py-1.5 rounded-lg',
  md: 'text-sm px-4 py-2 rounded-xl',
  lg: 'text-sm px-6 py-3 rounded-xl',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  isLoading,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileHover={buttonHover}
      whileTap={buttonTap}
      disabled={disabled ?? isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full aether-spinner" />
      ) : null}
      {children}
    </motion.button>
  );
}
