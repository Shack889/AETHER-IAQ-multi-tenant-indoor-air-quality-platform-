'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { HeartPulse, Info, Wind } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { useAetherStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface Guidance {
  key: string; label: string; unit: string; value: number | null;
  tier: string; color: string; meaning: string; action: string;
}
interface GuidanceData {
  hasData: boolean;
  timestamp?: string;
  freshnessMin?: number;
  guidance?: Guidance[];
  allGood?: boolean;
  atRisk?: string;
  disclaimer: string;
}

function freshnessLabel(min?: number): string {
  if (min == null) return '';
  if (min <= 2) return 'live · updated just now';
  if (min < 60) return `most recent reading · ${min} min ago`;
  return `most recent reading · ~${Math.round(min / 60)} h ago`;
}

/**
 * Realtime occupant guidance from the latest REAL reading for the active node.
 * Environmental information only — never medical advice (disclaimer always shown).
 * Polls every 15s; renders a "waiting for live readings" state when there is no
 * real hardware data (e.g. a mock/simulated node).
 */
export function LiveGuidance() {
  const activeNodeId = useAetherStore((s) => s.activeNodeId);
  const [data, setData] = useState<GuidanceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeNodeId) return;
    let cancelled = false;
    const load = () =>
      api.getHealthGuidance(activeNodeId)
        .then((d) => { if (!cancelled) { setData(d as GuidanceData); setError(null); } })
        .catch((e) => { if (!cancelled) setError((e as Error).message); });
    load();
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [activeNodeId]);

  const disclaimer = data?.disclaimer
    ?? 'This information describes the environment, not any individual’s health. It is not medical advice.';

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <HeartPulse size={16} className="text-aether-400" />
          <h3 className="text-sm font-semibold text-primary">Live air guidance</h3>
        </div>
        {data?.hasData && (
          <span className="text-[10px] text-muted font-data">{freshnessLabel(data.freshnessMin)}</span>
        )}
      </div>

      {error ? (
        <div className="text-xs text-orange-400 py-4">Couldn’t load guidance — {error}</div>
      ) : !data ? (
        <div className="text-xs text-muted py-6 text-center">Loading…</div>
      ) : !data.hasData ? (
        <div className="flex items-center gap-2 text-xs text-muted py-6 justify-center">
          <Wind size={14} /> Waiting for live hardware readings for this node…
        </div>
      ) : (
        <>
          <div className={cn(
            'text-sm font-medium',
            data.allGood ? 'text-green-400' : 'text-orange-400',
          )}>
            {data.allGood
              ? 'Air quality is within recommended guideline ranges right now.'
              : 'Some readings are above their recommended ranges right now — see the basic actions below.'}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.guidance?.map((g) => (
              <motion.div
                key={g.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl border border-theme bg-surface-2"
                style={{ borderTopColor: g.color, borderTopWidth: 3 }}
              >
                <div className="text-[10px] text-muted uppercase tracking-wide">{g.label}</div>
                <div className="font-data text-xl font-bold text-primary">
                  {g.value == null ? '—' : Math.round(g.value * 10) / 10}
                  <span className="text-[10px] font-normal text-muted ml-1">{g.unit}</span>
                </div>
                <div className="text-xs font-semibold mb-1" style={{ color: g.color }}>{g.tier}</div>
                <div className="text-[11px] text-secondary">{g.meaning}</div>
                <div className="text-[11px] text-primary mt-1 italic">{g.action}</div>
              </motion.div>
            ))}
          </div>

          {data.atRisk && (
            <div className="text-[11px] text-secondary bg-surface-2 border border-theme rounded-xl px-3 py-2">
              <span className="font-semibold text-primary">At-risk groups: </span>{data.atRisk}
            </div>
          )}
        </>
      )}

      <div className="flex items-start gap-2 text-[10px] text-muted pt-2 border-t border-theme">
        <Info size={12} className="shrink-0 mt-0.5" />
        <span>{disclaimer}</span>
      </div>
    </Card>
  );
}
