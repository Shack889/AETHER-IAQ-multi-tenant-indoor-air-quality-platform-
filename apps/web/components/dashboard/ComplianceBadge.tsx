'use client';

import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComplianceBadgeProps {
  standard: string;
  passed: boolean | null;
  compact?: boolean;
}

const QUIET = [0.22, 1, 0.36, 1] as const;

export function ComplianceBadge({ standard, passed, compact = false }: ComplianceBadgeProps) {
  if (passed === null) {
    return (
      <motion.div
        whileHover={{ y: -4, scale: 1.06, transition: { type: 'spring', stiffness: 240, damping: 11, mass: 0.65 } }}
        whileTap={{ scale: 0.92, transition: { type: 'spring', stiffness: 380, damping: 9, mass: 0.55 } }}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] tracking-[0.18em] uppercase cursor-pointer',
          'border-theme text-muted',
          compact ? 'text-[10px]' : 'text-[10px]',
        )}
        style={{ background: 'var(--paper-1)', willChange: 'transform' }}
      >
        <Circle size={10} className="shrink-0" strokeWidth={1.4} />
        <span className="font-medium whitespace-nowrap">{standard}</span>
      </motion.div>
    );
  }

  const accent = passed ? 'var(--good)' : 'var(--unhealthy)';

  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0, y: 8 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 14, mass: 0.6 }}
      whileHover={{
        y: -4,
        scale: 1.06,
        transition: { type: 'spring', stiffness: 240, damping: 11, mass: 0.65 },
      }}
      whileTap={{
        scale: 0.92,
        transition: { type: 'spring', stiffness: 380, damping: 9, mass: 0.55 },
      }}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] tracking-[0.18em] uppercase font-medium whitespace-nowrap cursor-pointer',
        compact ? 'text-[10px]' : 'text-[10px]',
      )}
      style={{
        background: 'var(--paper-1)',
        borderColor: passed ? 'rgba(92, 138, 90, 0.30)' : 'rgba(177, 72, 72, 0.30)',
        color: accent,
        willChange: 'transform',
      }}
    >
      {passed
        ? <CheckCircle size={11} className="shrink-0" strokeWidth={1.4} />
        : <XCircle    size={11} className="shrink-0" strokeWidth={1.4} />
      }
      <span>{standard}</span>
    </motion.div>
  );
}
