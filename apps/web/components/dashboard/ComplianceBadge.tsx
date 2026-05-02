'use client';

import { motion } from 'framer-motion';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComplianceBadgeProps {
  standard: string;
  passed: boolean | null;
  compact?: boolean;
}

export function ComplianceBadge({ standard, passed, compact = false }: ComplianceBadgeProps) {
  if (passed === null) {
    return (
      <div className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
        'bg-surface-2 border border-theme',
        compact ? 'text-xs' : 'text-xs',
      )}>
        <div className="w-3.5 h-3.5 rounded-full bg-surface-3" />
        <span className="text-muted font-medium">{standard}</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border',
        passed
          ? 'bg-green-500/10 border-green-500/20 text-green-400'
          : 'bg-red-500/10 border-red-500/20 text-red-400',
        compact ? 'text-xs' : 'text-xs',
      )}
    >
      {passed
        ? <CheckCircle size={13} className="shrink-0" />
        : <XCircle    size={13} className="shrink-0" />
      }
      <span className="font-medium whitespace-nowrap">{standard}</span>
    </motion.div>
  );
}
