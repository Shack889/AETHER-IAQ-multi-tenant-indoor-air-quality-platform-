'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Settings as Cog, Check, AlertTriangle, Cpu, Activity, Pause, Play } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { DEPS_PROFILES } from '@aether/shared';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { cn } from '@/lib/utils';

interface Room {
  id: string;
  name: string;
  width_ft: number;
  height_ft: number;
  ceiling_ft: number;
  maxOccupancy: number;
  profile: string;
  nodes: Array<{ nodeId: string; name: string; isOnline: boolean }>;
}

interface NodeRecord {
  nodeId: string;
  name: string;
  roomId: string | null;
}

export default function SettingsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [saved, setSaved] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [mockPaused, setMockPausedState] = useState(false);
  const [mockBusy, setMockBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.getRooms(), api.getNodes(), api.getMockPaused()])
      .then(([r, n, m]) => {
        const roomList = r as Room[];
        setRooms(roomList);
        setNodes(n as NodeRecord[]);
        if (roomList.length > 0) setActiveRoom(roomList[0]);
        setMockPausedState((m as { paused: boolean }).paused);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const toggleMockPaused = async () => {
    setMockBusy(true);
    try {
      const next = !mockPaused;
      const result = await api.setMockPaused(next);
      setMockPausedState(result.paused);
    } finally {
      setMockBusy(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>;
  }

  if (!activeRoom) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertTriangle size={32} className="text-orange-400" />
        <p className="text-sm text-secondary">No rooms configured. Create one via the API to get started.</p>
      </div>
    );
  }

  const updateField = <K extends keyof Room>(key: K, value: Room[K]) => {
    setActiveRoom({ ...activeRoom, [key]: value });
  };

  const save = async () => {
    if (!activeRoom) return;
    await api.updateRoom(activeRoom.id, {
      name:         activeRoom.name,
      width_ft:     activeRoom.width_ft,
      height_ft:    activeRoom.height_ft,
      ceiling_ft:   activeRoom.ceiling_ft,
      maxOccupancy: activeRoom.maxOccupancy,
      profile:      activeRoom.profile,
    });
    setRooms(rooms.map((r) => (r.id === activeRoom.id ? activeRoom : r)));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const assignNode = async (nodeId: string, roomId: string | null) => {
    await api.updateNode(nodeId, { roomId: roomId ?? '' });
    setNodes(nodes.map((n) => (n.nodeId === nodeId ? { ...n, roomId } : n)));
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-primary">Room Setup</h1>
        <p className="text-xs text-secondary mt-0.5">Configure dimensions, environment profile, and node assignments</p>
      </div>

      {rooms.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {rooms.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveRoom(r)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                r.id === activeRoom.id
                  ? 'bg-aether-500/15 text-aether-400 border-aether-500/30'
                  : 'bg-surface-2 text-secondary border-theme hover:text-primary',
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      <motion.div variants={containerVariants} initial="initial" animate="animate" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <Cog size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">Room Configuration</h3>
          </div>

          <div>
            <label className="text-xs font-medium text-secondary mb-1.5 block">Room name</label>
            <input
              type="text"
              value={activeRoom.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Width (ft)</label>
              <input
                type="number" step="0.5"
                value={activeRoom.width_ft}
                onChange={(e) => updateField('width_ft', Number(e.target.value))}
                className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Length (ft)</label>
              <input
                type="number" step="0.5"
                value={activeRoom.height_ft}
                onChange={(e) => updateField('height_ft', Number(e.target.value))}
                className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Ceiling (ft)</label>
              <input
                type="number" step="0.5"
                value={activeRoom.ceiling_ft}
                onChange={(e) => updateField('ceiling_ft', Number(e.target.value))}
                className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
              />
            </div>
          </div>

          <div className="text-xs text-muted">
            Volume: <span className="text-primary font-data">
              {(activeRoom.width_ft * activeRoom.height_ft * activeRoom.ceiling_ft).toFixed(0)} ft³
            </span>
          </div>

          <div>
            <label className="text-xs font-medium text-secondary mb-1.5 block">Maximum occupancy</label>
            <input
              type="number" min="1" step="1"
              value={activeRoom.maxOccupancy ?? 10}
              onChange={(e) => updateField('maxOccupancy', Number(e.target.value))}
              className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
            />
            <div className="text-xs text-muted mt-1.5">
              Used by CELI dynamic weighting: occupancy amplification factor = 1 + 0.1 × (O / O_max)
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-secondary mb-1.5 block">Environment profile</label>
            <select
              value={activeRoom.profile}
              onChange={(e) => updateField('profile', e.target.value)}
              className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
            >
              {Object.values(DEPS_PROFILES).map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <div className="text-xs text-muted mt-1.5">
              {DEPS_PROFILES[activeRoom.profile]?.description ?? ''}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button variant="primary" size="sm" onClick={save}>Save changes</Button>
            {saved && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1 text-xs text-green-400"
              >
                <Check size={14} /> Saved
              </motion.span>
            )}
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">Node Assignment</h3>
          </div>

          {nodes.length === 0 ? (
            <div className="text-xs text-muted py-6 text-center">No nodes registered yet.</div>
          ) : (
            <div className="space-y-2">
              {nodes.map((n) => (
                <div key={n.nodeId} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-2 border border-theme">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-primary truncate">{n.name}</div>
                    <div className="text-xs text-muted font-data truncate">{n.nodeId}</div>
                  </div>
                  <select
                    value={n.roomId ?? ''}
                    onChange={(e) => void assignNode(n.nodeId, e.target.value || null)}
                    className="bg-surface-1 border border-theme rounded-lg px-2 py-1.5 text-xs text-primary"
                  >
                    <option value="">— unassigned —</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-aether-400" />
          <h3 className="text-sm font-semibold text-primary">Data Generation</h3>
        </div>
        <p className="text-xs text-secondary">
          Pause the synthetic data generator system-wide. Real-hardware ingestion is unaffected — only nodes
          with <span className="font-data">dataSource = mock</span> stop producing readings. When real hardware
          publishes on a mock node, the node is auto-promoted to <span className="font-data">live</span> and
          the badge flips to <span className="font-semibold text-emerald-500">LIVE HARDWARE</span>.
        </p>
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-theme">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'w-2.5 h-2.5 rounded-full',
                mockPaused ? 'bg-orange-400' : 'bg-emerald-500 animate-pulse',
              )}
            />
            <div>
              <div className="text-xs font-semibold text-primary">
                Mock generator · {mockPaused ? 'Paused' : 'Running'}
              </div>
              <div className="text-[10px] text-muted">
                {mockPaused
                  ? 'No synthetic readings being produced.'
                  : 'Generating synthetic readings every 2s for mock nodes.'}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant={mockPaused ? 'primary' : 'secondary'}
            onClick={() => void toggleMockPaused()}
            disabled={mockBusy}
          >
            {mockPaused ? <Play size={14} className="mr-1.5" /> : <Pause size={14} className="mr-1.5" />}
            {mockBusy ? '…' : mockPaused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-primary">Data Retention</h3>
        <p className="text-xs text-secondary">
          How long to keep raw sensor readings before downsampling. Processed snapshots are always retained.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range" min={7} max={365} step={1}
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
            className="flex-1 max-w-md accent-aether-500"
          />
          <span className="font-data text-sm text-primary tabular-nums">{retentionDays} days</span>
        </div>
        <p className="text-xs text-muted">
          (UI only — retention policy is a backend cron task and is not yet wired to the API.)
        </p>
      </Card>
    </motion.div>
  );
}
