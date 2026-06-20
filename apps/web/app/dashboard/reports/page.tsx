'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FileText, Download, AlertTriangle, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { pageVariants } from '@/components/animations/variants';
import { cn } from '@/lib/utils';

interface RoomAvail {
  roomId: string;
  roomName: string;
  min: string | null;
  max: string | null;
  count: number;
}
type Mode = 'showcase' | 'research';

// Dataset-of-record freeze point (§M7) — research mode excludes earlier data.
const FREEZE_POINT = new Date('2026-06-14T01:03:00+06:00');

const REPORT_TYPES = [
  { type: 'air-quality-summary', label: 'Air Quality Summary', desc: 'Per-pollutant stats + trend charts' },
  { type: 'health-impact', label: 'Health Impact', desc: 'Vs WHO/EPA thresholds + guidance (environmental)' },
  { type: 'compliance', label: 'Compliance', desc: '% time within / exceeding thresholds' },
  { type: 'live-snapshot', label: 'Live Snapshot', desc: 'The air right now + recent window' },
];

const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const clamp = (d: Date, lo: Date, hi: Date) => new Date(Math.min(Math.max(d.getTime(), lo.getTime()), hi.getTime()));
const fmtSpan = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function ReportsPage() {
  const [rooms, setRooms] = useState<RoomAvail[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState<string>('');
  const [mode, setMode] = useState<Mode>('showcase');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const room = useMemo(() => rooms.find((r) => r.roomId === roomId) ?? null, [rooms, roomId]);
  const bounds = useMemo(() => {
    if (!room?.min || !room?.max) return null;
    return { min: new Date(room.min), max: new Date(room.max) };
  }, [room]);

  useEffect(() => {
    api.getReportAvailability()
      .then((list) => {
        setRooms(list);
        if (list.length) setRoomId(list[0].roomId);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // When the room changes, default the range to the last 24h clamped to real data.
  useEffect(() => {
    if (!bounds) return;
    const t = bounds.max;
    const f = clamp(new Date(t.getTime() - 24 * 3600 * 1000), bounds.min, bounds.max);
    setFrom(toLocalInput(f));
    setTo(toLocalInput(t));
  }, [bounds]);

  const setQuickRange = (kind: '24h' | '7d' | 'full') => {
    if (!bounds) return;
    const t = bounds.max;
    let f: Date;
    if (kind === 'full') f = bounds.min;
    else f = clamp(new Date(t.getTime() - (kind === '24h' ? 24 : 168) * 3600 * 1000), bounds.min, bounds.max);
    setFrom(toLocalInput(f));
    setTo(toLocalInput(t));
  };

  // Research mode can't read before the freeze point — reflect that in the UI.
  const researchClamped = mode === 'research' && from && new Date(from) < FREEZE_POINT;
  const effectiveFrom = researchClamped ? toLocalInput(FREEZE_POINT) : from;

  const generate = async (type: string) => {
    if (!room) return;
    setBusy(type); setError(null); setNotice(null);
    try {
      const res = await api.generateReport(type, {
        roomId: room.roomId,
        from: new Date(effectiveFrom).toISOString(),
        to: new Date(to).toISOString(),
        mode,
      });
      if (res.ok) setNotice(`${REPORT_TYPES.find((r) => r.type === type)?.label} downloaded.`);
      else setError(res.message || `Failed (${res.status})`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-primary">Reports</h1>
        <p className="text-xs text-secondary mt-0.5">
          Server-generated PDF reports from real hardware data only. Pickers are constrained to ranges that
          actually have data — empty windows are shown honestly, never fabricated.
        </p>
      </div>

      {rooms.length === 0 ? (
        <Card>
          <div className="flex items-start gap-3 py-4">
            <AlertTriangle size={18} className="text-orange-400 shrink-0 mt-0.5" />
            <div className="text-sm text-secondary">
              No rooms have hardware-collected data yet. Once a node assigned to a room records real
              (non-simulated) readings, it will appear here.
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card className="space-y-4">
            {/* Room selector — only rooms with real data */}
            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Room (only rooms with real data)</label>
              <div className="flex flex-wrap gap-2">
                {rooms.map((r) => (
                  <button
                    key={r.roomId}
                    onClick={() => setRoomId(r.roomId)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                      r.roomId === roomId
                        ? 'bg-aether-500/15 text-aether-400 border-aether-500/30'
                        : 'bg-surface-2 text-secondary border-theme hover:text-primary',
                    )}
                  >
                    {r.roomName} <span className="text-muted">· {r.count.toLocaleString()} readings</span>
                  </button>
                ))}
              </div>
              {bounds && (
                <div className="text-[10px] text-muted mt-1.5 flex items-center gap-1">
                  <Calendar size={11} /> Real data available: {fmtSpan(room?.min ?? null)} → {fmtSpan(room?.max ?? null)} (+06:00)
                </div>
              )}
            </div>

            {/* Mode toggle */}
            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Report mode</label>
              <div className="flex gap-2">
                {(['showcase', 'research'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors capitalize',
                      m === mode ? 'bg-aether-500/15 text-aether-400 border-aether-500/30' : 'bg-surface-2 text-secondary border-theme hover:text-primary',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-muted mt-1.5">
                {mode === 'showcase'
                  ? 'Showcase — uses all available real data as a capability demonstration.'
                  : 'Research — dataset of record only (from 2026-06-14 01:03 +06:00); pilot/shakedown data excluded.'}
              </div>
            </div>

            {/* Date range */}
            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Date range</label>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Button size="sm" variant="secondary" onClick={() => setQuickRange('24h')}>Last 24h</Button>
                <Button size="sm" variant="secondary" onClick={() => setQuickRange('7d')}>Last 7d</Button>
                <Button size="sm" variant="secondary" onClick={() => setQuickRange('full')}>Full available</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-muted">From</span>
                  <input
                    type="datetime-local" value={effectiveFrom}
                    min={bounds ? toLocalInput(bounds.min) : undefined}
                    max={bounds ? toLocalInput(bounds.max) : undefined}
                    disabled={!!researchClamped}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary disabled:opacity-60"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted">To</span>
                  <input
                    type="datetime-local" value={to}
                    min={bounds ? toLocalInput(bounds.min) : undefined}
                    max={bounds ? toLocalInput(bounds.max) : undefined}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
                  />
                </div>
              </div>
              {researchClamped && (
                <div className="text-[10px] text-orange-400 mt-1.5">
                  Research mode starts at the freeze point — the start was clamped to 2026-06-14 01:03 (+06:00).
                </div>
              )}
            </div>
          </Card>

          {/* Report buttons */}
          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-aether-400" />
              <h3 className="text-sm font-semibold text-primary">Generate report</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REPORT_TYPES.map((rt) => (
                <button
                  key={rt.type}
                  onClick={() => void generate(rt.type)}
                  disabled={!!busy}
                  className="text-left p-3 rounded-xl border border-theme bg-surface-2 hover:border-aether-500/40 transition-colors disabled:opacity-60 flex items-start gap-3"
                >
                  <Download size={15} className="text-aether-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-primary flex items-center gap-2">
                      {rt.label}
                      {busy === rt.type && <Spinner size="sm" />}
                    </div>
                    <div className="text-[11px] text-muted">{rt.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {notice && (
              <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">{notice}</div>
            )}
            {error && (
              <div className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </Card>
        </>
      )}
    </motion.div>
  );
}
