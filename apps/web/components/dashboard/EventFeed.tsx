'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Wind, Beaker, Users, AlertTriangle } from 'lucide-react';
import { alertVariants } from '@/components/animations/variants';
import { formatTimestamp } from '@/lib/utils';
import { EventType } from '@aether/shared';

interface FeedEvent {
  id: string;
  type: EventType | 'alert';
  message: string;
  timestamp: Date;
  confidence?: number;
}

interface EventFeedProps {
  events: FeedEvent[];
  maxItems?: number;
}

const eventConfig: Record<string, {
  icon: React.ReactNode;
  label: string;
  color: string;
}> = {
  combustion: { icon: <Flame size={14} />, label: 'Combustion', color: 'text-red-400 bg-red-500/10' },
  dust:       { icon: <Wind  size={14} />, label: 'Dust',       color: 'text-yellow-400 bg-yellow-500/10' },
  chemical:   { icon: <Beaker size={14} />, label: 'Chemical',  color: 'text-purple-400 bg-purple-500/10' },
  occupancy:  { icon: <Users  size={14} />, label: 'Occupancy', color: 'text-blue-400 bg-blue-500/10' },
  alert:      { icon: <AlertTriangle size={14} />, label: 'Alert', color: 'text-orange-400 bg-orange-500/10' },
};

export function EventFeed({ events, maxItems = 8 }: EventFeedProps) {
  const visible = events.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
        <Wind size={24} className="text-muted opacity-40" />
        <p className="text-xs text-muted">No events detected</p>
        <p className="text-xs text-muted opacity-60">Air quality is stable</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((event) => {
          const config = eventConfig[event.type] ?? eventConfig['alert'];
          return (
            <motion.div
              key={event.id}
              variants={alertVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              layout
              className="flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-theme"
            >
              <div className={`p-1.5 rounded-lg ${config.color} shrink-0 mt-0.5`}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-primary">{config.label} detected</span>
                  <span className="text-xs text-muted shrink-0">{formatTimestamp(event.timestamp)}</span>
                </div>
                <p className="text-xs text-secondary mt-0.5 truncate">{event.message}</p>
                {event.confidence != null && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-xs text-muted">Confidence:</span>
                    <div className="flex-1 h-1 rounded-full bg-surface-3 max-w-20">
                      <div
                        className="h-full rounded-full bg-aether-400"
                        style={{ width: `${event.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-data text-muted">
                      {Math.round(event.confidence * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
