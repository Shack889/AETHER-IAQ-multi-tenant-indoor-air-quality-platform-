'use client';

import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

/** Blocking confirmation dialog for destructive or data-rewriting actions. */
export function ConfirmModal({
  title, subtitle, children, onClose, actions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  actions: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.55)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-surface-1 border border-theme rounded-2xl p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-primary">{title}</h2>
            {subtitle && <p className="text-xs text-secondary mt-0.5 font-data">{subtitle}</p>}
          </div>
        </div>
        <div className="text-sm text-secondary leading-relaxed space-y-2">{children}</div>
        <div className="flex justify-end gap-2 pt-2 flex-wrap">{actions}</div>
      </motion.div>
    </motion.div>
  );
}
