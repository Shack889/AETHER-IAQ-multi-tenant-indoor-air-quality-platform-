'use client';

import { motion } from 'framer-motion';
import { Activity, ArrowDown, ArrowUp, AlertTriangle, Check, type LucideIcon } from 'lucide-react';

const RECOVERY_STYLES: Record<
  string,
  { label: string; bg: string; text: string; icon: LucideIcon }
> = {
  baseline:     { label: 'Baseline',     bg: 'bg-green-500/10 border-green-500/30',   text: 'text-green-400',  icon: Check },
  recovering:   { label: 'Recovering',   bg: 'bg-blue-500/10 border-blue-500/30',     text: 'text-blue-400',   icon: ArrowDown },
  accumulating: { label: 'Accumulating', bg: 'bg-amber-500/10 border-amber-500/30',   text: 'text-amber-400',  icon: ArrowUp },
  critical:     { label: 'Critical',     bg: 'bg-red-500/10 border-red-500/30',       text: 'text-red-400',    icon: AlertTriangle },
};

export function RecoveryBadge({ status }: { status: string | null | undefined }) {
  const style: { label: string; bg: string; text: string; icon: LucideIcon } =
    RECOVERY_STYLES[status ?? 'baseline'] ?? {
      label: 'Unknown',
      bg: 'bg-surface-3 border-theme',
      text: 'text-muted',
      icon: Activity,
    };
  const Icon = style.icon;
  return (
    <motion.span
      initial={{ scale: 0.92, opacity: 0, y: 6 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 14, mass: 0.6 }}
      whileHover={{ y: -3, scale: 1.06, transition: { type: 'spring', stiffness: 240, damping: 11, mass: 0.65 } }}
      whileTap={{ scale: 0.92, transition: { type: 'spring', stiffness: 380, damping: 9, mass: 0.55 } }}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-semibold cursor-pointer ${style.bg} ${style.text}`}
      style={{ willChange: 'transform' }}
    >
      <Icon size={12} />
      {style.label}
    </motion.span>
  );
}
