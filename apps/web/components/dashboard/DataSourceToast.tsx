'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Radio, X } from 'lucide-react';
import { useAetherStore } from '@/lib/store';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';

/**
 * Floating toast shown when the backend auto-promotes (or a user flips) a node
 * between mock and live. Driven by the `node:dataSourceChanged` WebSocket event.
 */
export function DataSourceToast() {
  const event = useAetherStore((s) => s.latestDataSourceChange);
  const setLatestDataSourceChange = useAetherStore((s) => s.setLatestDataSourceChange);

  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
      <AnimatePresence>
        {event && (
          <motion.div
            key={`${event.nodeId}-${event.timestamp}`}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto bg-surface-1 border border-theme rounded-2xl shadow-2xl p-4 w-80 flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              <Radio size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-primary">
                {event.reason === 'auto-detected'
                  ? 'Real hardware detected'
                  : 'Data source changed'}
              </div>
              <div className="text-[11px] text-secondary mt-0.5">
                <span className="font-data">{event.nodeId}</span> switched from{' '}
                <span className="font-data">{event.previous}</span> → <span className="font-data">{event.next}</span>
              </div>
              <div className="mt-2">
                <DataSourceBadge simulated={event.next !== 'live'} />
              </div>
            </div>
            <button
              onClick={() => setLatestDataSourceChange(null)}
              className="text-muted hover:text-primary"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
