'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';
import { useAetherStore } from '@/lib/store';

interface ExplainabilityCardProps {
  text: string;
  updatedAt?: Date | string;
  alertLevel?: number;
}

function relativeTime(updatedAt?: Date | string): string {
  if (!updatedAt) return '';
  const ts = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  const diffSec = Math.max(0, Math.floor((Date.now() - ts.getTime()) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec} seconds ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  return ts.toLocaleTimeString();
}

export function ExplainabilityCard({ text, updatedAt }: ExplainabilityCardProps) {
  const safeText = text?.trim() || 'Awaiting first reading.';
  const simulated = useAetherStore((s) => s.latestSimulated);

  return (
    <Card padding="lg" className="space-y-6 relative">
      <div className="absolute top-4 right-4"><DataSourceBadge simulated={simulated} /></div>
      <div className="flex items-center justify-between pr-32">
        <span className="label-eyebrow">Environmental Intelligence</span>
        <span className="text-[10px] text-muted font-data tracking-wider">
          {relativeTime(updatedAt)}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={safeText}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-[clamp(20px,2.4vw,30px)] text-primary"
          style={{ lineHeight: 1.4, letterSpacing: '-0.012em' }}
        >
          {safeText}
        </motion.p>
      </AnimatePresence>

      <div className="pt-5 hairline flex items-center justify-between text-[10px] text-muted tracking-[0.18em] uppercase">
        <span>Deterministic synthesis</span>
        <span className="font-data tracking-wider normal-case">AECI · Domain VII</span>
      </div>
    </Card>
  );
}
