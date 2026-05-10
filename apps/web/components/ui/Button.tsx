'use client';

import {
  motion, HTMLMotionProps, useMotionValue, useSpring, useReducedMotion,
} from 'framer-motion';
import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { ClickRipples, useRipples } from '@/components/animations/Ripple';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'whileHover' | 'whileTap' | 'style'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  isLoading?: boolean;
  /** Default true — drift toward cursor up to 4 px. Disable for fixed buttons. */
  magnetic?: boolean;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'text-[var(--paper-1)] bg-[var(--ink-1)] hover:bg-[var(--ink-2)] border border-[var(--ink-1)]',
  secondary:
    'text-primary bg-transparent hover:bg-[var(--paper-2)] border border-[var(--rule)]',
  ghost:
    'text-secondary hover:text-primary bg-transparent border border-transparent hover:border-[var(--rule)]',
  danger:
    'text-[var(--paper-1)] bg-[var(--unhealthy)] border border-[var(--unhealthy)]',
};

const sizeClasses = {
  sm: 'text-[10px] tracking-[0.2em]  uppercase px-3   py-1.5 rounded-full',
  md: 'text-[10px] tracking-[0.22em] uppercase px-5   py-2.5 rounded-full',
  lg: 'text-[11px] tracking-[0.22em] uppercase px-7   py-3.5 rounded-full',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  isLoading,
  className,
  disabled,
  magnetic = true,
  ...props
}: ButtonProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLButtonElement | null>(null);
  const { ripples, trigger } = useRipples();

  const x  = useMotionValue(0);
  const y  = useMotionValue(0);
  const xs = useSpring(x, { stiffness: 180, damping: 12, mass: 0.7 });
  const ys = useSpring(y, { stiffness: 180, damping: 12, mass: 0.7 });

  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!magnetic || reduced) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // 10 px drift — clearly visible magnetism
    x.set(((e.clientX - cx) / (rect.width  / 2)) * 10);
    y.set(((e.clientY - cy) / (rect.height / 2)) * 7);
  };
  const onLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.button
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onPointerDown={trigger}
      whileHover={reduced ? undefined : {
        y: -3,
        scale: 1.05,
        transition: { type: 'spring', stiffness: 240, damping: 11, mass: 0.7 },
      }}
      whileTap={reduced ? undefined : {
        scale: 0.92,
        transition: { type: 'spring', stiffness: 360, damping: 9, mass: 0.55 },
      }}
      style={{ x: xs, y: ys, willChange: 'transform' }}
      disabled={disabled ?? isLoading}
      className={cn(
        'relative inline-flex items-center justify-center gap-2 font-medium transition-colors duration-300',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      <ClickRipples
        ripples={ripples}
        color={variant === 'primary' || variant === 'danger'
          ? 'rgba(245, 241, 234, 0.35)'   // light ripple on dark fills
          : 'rgba(20, 17, 13, 0.18)'       // ink ripple on light fills
        }
      />
      {isLoading ? (
        <span className="w-3 h-3 border border-current border-t-transparent rounded-full aether-spinner" />
      ) : null}
      {children}
    </motion.button>
  );
}
