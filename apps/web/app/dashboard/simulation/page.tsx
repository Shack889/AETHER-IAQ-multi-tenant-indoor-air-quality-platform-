'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Pause, RotateCcw, Trash2, Plus, FlaskConical, Wind, Cloud,
  Flame, Sparkles, Users, Gauge, AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { DEPS_PROFILES } from '@aether/shared';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { useAetherStore } from '@/lib/store';
import { cn } from '@/lib/utils';

type VentType = 'none' | 'natural' | 'fan' | 'ac';
type EventType = 'dust' | 'combustion' | 'chemical';
type SimStatus = 'created' | 'running' | 'paused';

interface SimulationRecord {
  id: string;
  name: string;
  status: SimStatus;
  speed: number;
  profile: string;
  simNodeIds: string[];
  roomConfig: {
    width_ft: number; height_ft: number; ceiling_ft: number;
    ventType: VentType; outdoorPM25: number; outdoorTemp: number; outdoorRH: number;
  };
  occupancySched: Array<{ hour: number; count: number }>;
  events: Array<{ hour: number; minute: number; type: EventType }>;
  simulatedTime: number;
  createdAt: string;
}

interface SimStatusResponse extends SimulationRecord {
  runtime: {
    running: boolean;
    simTimeSeconds: number;
    activeEvent: { type: EventType; elapsed: number; duration: number } | null;
    pendingEventCount: number;
  } | null;
}

const SPEED_OPTIONS = [1, 10, 100, 1000];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatSimTime(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function SimulationPage() {
  const { setActiveNode, latestSnapshot, latestRaw } = useAetherStore();
  const [sims, setSims] = useState<SimulationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<SimStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create form state
  const [name, setName] = useState('My simulation');
  const [width, setWidth] = useState(22);
  const [length, setLength] = useState(22);
  const [ceiling, setCeiling] = useState(10);
  const [profile, setProfile] = useState('OFFICE_OPEN');
  const [ventType, setVentType] = useState<VentType>('fan');
  const [outdoorPM, setOutdoorPM] = useState(18);
  const [outdoorTemp, setOutdoorTemp] = useState(28);
  const [outdoorRH, setOutdoorRH] = useState(65);
  const [speed, setSpeed] = useState(10);
  const [nodeCount, setNodeCount] = useState(1);
  const [schedule, setSchedule] = useState<number[]>(() => {
    // 24 hours, default workday occupancy
    return HOURS.map((h) => {
      if (h < 8 || h >= 19) return 0;
      if (h >= 12 && h < 13) return 4;
      return h < 17 ? 8 : 2;
    });
  });

  const refreshList = async () => {
    try {
      const list = (await api.listSimulations()) as SimulationRecord[];
      setSims(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    } catch {
      setSims([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll status while a simulation is selected
  useEffect(() => {
    if (!selectedId) { setStatus(null); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const s = (await api.getSimulationStatus(selectedId)) as SimStatusResponse;
        if (!cancelled) setStatus(s);
      } catch { /* ignore */ }
    };
    void tick();
    const t = setInterval(() => void tick(), 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [selectedId]);

  // When a simulation is selected and running, point the dashboard's active node
  // at the first sim node so charts on other pages reflect simulated data.
  useEffect(() => {
    if (status?.runtime?.running && status.simNodeIds[0]) {
      setActiveNode(status.simNodeIds[0]);
    }
  }, [status?.runtime?.running, status?.simNodeIds, setActiveNode]);

  const create = async () => {
    setBusy(true);
    try {
      const positions = Array.from({ length: nodeCount }, (_, i) => {
        // Spread nodes evenly across the room as fractions
        const cols = Math.ceil(Math.sqrt(nodeCount));
        const row = Math.floor(i / cols);
        const col = i % cols;
        const rows = Math.ceil(nodeCount / cols);
        return {
          x: cols === 1 ? 0.5 : (col + 0.5) / cols,
          y: rows === 1 ? 0.5 : (row + 0.5) / rows,
          z: 0.5,
        };
      });
      const result = await api.createSimulation({
        name,
        roomConfig: {
          width_ft: width, height_ft: length, ceiling_ft: ceiling,
          ventType, outdoorPM25: outdoorPM, outdoorTemp, outdoorRH,
        },
        nodePositions: positions,
        occupancySched: HOURS.map((h) => ({ hour: h, count: schedule[h] })),
        events: [],
        profile,
        speed,
      });
      setShowCreate(false);
      setSelectedId(result.id);
      await refreshList();
    } finally { setBusy(false); }
  };

  const start = async () => {
    if (!selectedId) return;
    setBusy(true);
    try { await api.startSimulation(selectedId); } finally { setBusy(false); }
  };
  const pause = async () => {
    if (!selectedId) return;
    setBusy(true);
    try { await api.pauseSimulation(selectedId); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!selectedId) return;
    setBusy(true);
    try { await api.resetSimulation(selectedId); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.deleteSimulation(selectedId);
      setSelectedId(null);
      await refreshList();
    } finally { setBusy(false); }
  };
  const inject = async (type: EventType) => {
    if (!selectedId) return;
    await api.injectEvent(selectedId, type);
  };

  const isLive = status?.runtime?.running ?? false;
  const liveSnapshotIsSim = useMemo(() => {
    if (!status || !latestSnapshot) return false;
    return status.simNodeIds.includes(latestSnapshot.nodeId);
  }, [status, latestSnapshot]);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>;
  }

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl border"
        style={{
          background: 'linear-gradient(90deg, rgba(168, 85, 247, 0.12), rgba(168, 85, 247, 0.04))',
          borderColor: 'rgba(168, 85, 247, 0.35)',
          color: 'rgb(168, 85, 247)',
        }}
      >
        <AlertTriangle size={16} />
        <div className="text-xs">
          <span className="font-semibold uppercase tracking-wider">All data on this page is simulated.</span>
          <span className="ml-2 text-muted">
            Readings shown here do not represent real sensor measurements. Exports default to "simulated" only.
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-primary">Simulation</h1>
          <p className="text-xs text-secondary mt-0.5">
            Generate hypothetical scenarios — virtual nodes run through the same algorithm pipeline as real hardware.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus size={14} className="mr-1.5" /> New Simulation
        </Button>
      </div>

      {showCreate && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="space-y-5">
            <div className="flex items-center gap-2">
              <FlaskConical size={16} className="text-aether-400" />
              <h3 className="text-sm font-semibold text-primary">Configure new simulation</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Profile</label>
                <select
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
                >
                  {Object.values(DEPS_PROFILES).map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="Width (ft)" value={width} setValue={setWidth} step={1} />
              <NumberInput label="Length (ft)" value={length} setValue={setLength} step={1} />
              <NumberInput label="Ceiling (ft)" value={ceiling} setValue={setCeiling} step={0.5} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Ventilation</label>
                <select
                  value={ventType}
                  onChange={(e) => setVentType(e.target.value as VentType)}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
                >
                  <option value="none">None (sealed room)</option>
                  <option value="natural">Natural (windows open)</option>
                  <option value="fan">Fan / mechanical</option>
                  <option value="ac">AC / HVAC</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Virtual nodes (1-9)</label>
                <input
                  type="number" min={1} max={9}
                  value={nodeCount}
                  onChange={(e) => setNodeCount(Math.min(9, Math.max(1, Number(e.target.value))))}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Cloud size={14} className="text-aether-400" />
                <span className="text-xs font-medium text-secondary uppercase tracking-wide">External conditions</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <NumberInput label="Outdoor PM2.5 (µg/m³)" value={outdoorPM} setValue={setOutdoorPM} step={1} />
                <NumberInput label="Outdoor temp (°C)" value={outdoorTemp} setValue={setOutdoorTemp} step={0.5} />
                <NumberInput label="Outdoor RH (%)" value={outdoorRH} setValue={setOutdoorRH} step={1} />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-aether-400" />
                <span className="text-xs font-medium text-secondary uppercase tracking-wide">
                  Occupancy schedule (people per hour)
                </span>
              </div>
              <div className="grid grid-cols-12 gap-1">
                {HOURS.map((h) => (
                  <div key={h} className="flex flex-col items-center gap-1">
                    <input
                      type="number"
                      min={0} max={50}
                      value={schedule[h]}
                      onChange={(e) => setSchedule((prev) => {
                        const next = [...prev]; next[h] = Math.max(0, Number(e.target.value)); return next;
                      })}
                      className="w-full bg-surface-2 border border-theme rounded-md px-1 py-1 text-xs font-data text-primary text-center"
                    />
                    <span className="text-[10px] text-muted font-data">
                      {String(h).padStart(2, '0')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-secondary">Speed</span>
              <div className="flex gap-1">
                {SPEED_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                      s === speed
                        ? 'bg-aether-500/15 text-aether-400 border-aether-500/30'
                        : 'bg-surface-2 text-secondary border-theme hover:text-primary',
                    )}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <Button variant="primary" size="sm" onClick={() => void create()} disabled={busy}>
                Create
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </Card>
        </motion.div>
      )}

      {sims.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="text-sm text-secondary">No simulations yet — click "New Simulation" to create one.</p>
        </Card>
      ) : (
        <motion.div variants={containerVariants} initial="initial" animate="animate" className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-1 space-y-2">
            <h3 className="text-sm font-semibold text-primary mb-3">Saved simulations</h3>
            {sims.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  'w-full text-left p-3 rounded-xl border transition-colors',
                  selectedId === s.id
                    ? 'bg-aether-500/10 border-aether-500/30'
                    : 'bg-surface-2 border-theme hover:bg-surface-3',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-primary truncate">{s.name}</div>
                    <div className="text-xs text-muted font-data truncate">
                      {s.simNodeIds.length} node{s.simNodeIds.length === 1 ? '' : 's'} · {s.profile}
                    </div>
                  </div>
                  <span className={cn(
                    'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
                    s.status === 'running'
                      ? 'bg-green-500/15 text-green-400'
                      : s.status === 'paused'
                      ? 'bg-yellow-500/15 text-yellow-400'
                      : 'bg-slate-500/15 text-slate-400',
                  )}>
                    {s.status}
                  </span>
                </div>
              </button>
            ))}
          </Card>

          <Card className="lg:col-span-2 space-y-4">
            {!status ? (
              <div className="text-xs text-muted py-4 text-center">Select a simulation to control it.</div>
            ) : (
              <>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-primary truncate">{status.name}</div>
                    <div className="text-xs text-muted font-data truncate">
                      sim time {formatSimTime(status.runtime?.simTimeSeconds ?? 0)} ·
                      {' '}{status.profile} · {status.speed}× · {status.simNodeIds.length} nodes
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!isLive ? (
                      <Button variant="primary" size="sm" onClick={() => void start()} disabled={busy}>
                        <Play size={14} className="mr-1.5" /> Start
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => void pause()} disabled={busy}>
                        <Pause size={14} className="mr-1.5" /> Pause
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => void reset()} disabled={busy}>
                      <RotateCcw size={14} className="mr-1.5" /> Reset
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy}>
                      <Trash2 size={14} className="mr-1.5" /> Delete
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Stat label="Status" value={isLive ? 'Running' : status.status} accent={isLive ? '#22c55e' : '#94a3b8'} />
                  <Stat label="Sim clock" value={formatSimTime(status.runtime?.simTimeSeconds ?? 0)} mono />
                  <Stat
                    label="Active event"
                    value={status.runtime?.activeEvent ? status.runtime.activeEvent.type : 'none'}
                    accent={status.runtime?.activeEvent ? '#f97316' : undefined}
                  />
                </div>

                <div className="pt-3 border-t border-theme">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={14} className="text-aether-400" />
                    <span className="text-xs font-medium text-secondary uppercase tracking-wide">Inject event</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={() => void inject('dust')} disabled={!isLive}>
                      <Wind size={14} className="mr-1.5" /> Dust
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void inject('combustion')} disabled={!isLive}>
                      <Flame size={14} className="mr-1.5" /> Combustion
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void inject('chemical')} disabled={!isLive}>
                      <Gauge size={14} className="mr-1.5" /> Chemical
                    </Button>
                  </div>
                  <p className="text-xs text-muted mt-2">
                    Events run for ~30 simulated readings. Inject any time the simulation is running.
                  </p>
                </div>

                {liveSnapshotIsSim && latestSnapshot && latestRaw && (
                  <div className="pt-3 border-t border-theme">
                    <div className="text-xs font-medium text-secondary uppercase tracking-wide mb-2">
                      Latest from {latestSnapshot.nodeId}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <LiveStat label="PM2.5" value={latestSnapshot.pm25_corrected.toFixed(1)} unit="µg/m³" />
                      <LiveStat label="CO₂" value={Math.round(latestSnapshot.co2_filtered).toString()} unit="ppm" />
                      <LiveStat label="VOC" value={Math.round(latestSnapshot.voc_filtered).toString()} unit="idx" />
                      <LiveStat label="Temp" value={latestSnapshot.temp_filtered.toFixed(1)} unit="°C" />
                      <LiveStat label="DEPS" value={String(latestSnapshot.deps_aqi)} unit="AQI" />
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

function NumberInput({ label, value, setValue, step }: {
  label: string; value: number; setValue: (n: number) => void; step?: number;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-secondary mb-1.5 block">{label}</label>
      <input
        type="number"
        step={step ?? 1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
      />
    </div>
  );
}

function Stat({ label, value, accent, mono }: { label: string; value: string; accent?: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 border border-theme p-3">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={cn('text-base font-semibold mt-0.5', mono && 'font-data tabular-nums')}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function LiveStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-data text-xl font-bold text-primary tabular-nums">
        {value}<span className="text-xs text-muted ml-1">{unit}</span>
      </div>
    </div>
  );
}
