'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Settings as Cog, Check, Cpu, Activity, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
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
  // Site metadata
  siteType: string | null;
  locationLabel: string | null;
  ventilationType: string | null;
  hasAC: boolean | null;
  climateDescriptor: string | null;
  occupancyMin: number | null;
  occupancyMax: number | null;
  mountingNote: string | null;
  nodes: Array<{ nodeId: string; name: string; isOnline: boolean }>;
}

const SITE_TYPES = ['residential', 'classroom', 'office'];
const VENTILATION_TYPES = ['natural', 'mechanical', 'mixed'];

interface NodeRecord {
  nodeId: string;
  name: string;
  roomId: string | null;
}

const EMPTY_NEW_ROOM = {
  name: '', width_ft: 22, height_ft: 22, ceiling_ft: 10,
  maxOccupancy: 10, profile: 'OFFICE_OPEN',
  siteType: '', locationLabel: '', ventilationType: '', hasAC: false,
  climateDescriptor: '', occupancyMin: 0, occupancyMax: 0, mountingNote: '',
};

export default function SettingsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [saved, setSaved] = useState(false);
  const [retentionDays, setRetentionDays] = useState(180);
  const [retentionSaved, setRetentionSaved] = useState(false);
  const [purgePreview, setPurgePreview] = useState<string | null>(null);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [mockPaused, setMockPausedState] = useState(false);
  const [mockBusy, setMockBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoom, setNewRoom] = useState({ ...EMPTY_NEW_ROOM });
  const [createBusy, setCreateBusy] = useState(false);
  const [deleteGuard, setDeleteGuard] = useState<{ room: Room; readingCount: number; nodeCount: number } | null>(null);
  const [profileConfirm, setProfileConfirm] = useState<{ oldProfile: string; newProfile: string; rowCount: number } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.getRooms(), api.getNodes(), api.getMockPaused(), api.getRetention()])
      .then(([r, n, m, ret]) => {
        const roomList = r as Room[];
        setRooms(roomList);
        setNodes(n as NodeRecord[]);
        if (roomList.length > 0) setActiveRoom(roomList[0]);
        setMockPausedState((m as { paused: boolean }).paused);
        setRetentionDays(ret.days);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const saveRetention = async () => {
    setRetentionBusy(true);
    try {
      const saved = await api.setRetention(retentionDays);
      setRetentionDays(saved.days);
      setRetentionSaved(true);
      setTimeout(() => setRetentionSaved(false), 2000);
    } finally {
      setRetentionBusy(false);
    }
  };

  const previewPurge = async () => {
    setRetentionBusy(true);
    try {
      const r = await api.runRetentionPurge(true);
      const total = r.readings.hardware + r.readings.simulated + r.processed.hardware + r.processed.simulated + r.alerts;
      setPurgePreview(
        `Older than ${new Date(r.cutoff).toLocaleDateString()}: ` +
        `${(r.readings.hardware + r.readings.simulated).toLocaleString()} readings ` +
        `(${r.readings.simulated.toLocaleString()} simulated), ` +
        `${(r.processed.hardware + r.processed.simulated).toLocaleString()} processed rows, ` +
        `${r.alerts.toLocaleString()} alerts — ${total.toLocaleString()} total would be purged.`,
      );
    } finally {
      setRetentionBusy(false);
    }
  };

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

  const createRoom = async () => {
    if (!newRoom.name.trim()) return;
    setCreateBusy(true);
    try {
      const created = (await api.createRoom({
        ...newRoom,
        name: newRoom.name.trim(),
        // Empty strings → null so unset metadata isn't stored as ''.
        siteType:          newRoom.siteType || null,
        locationLabel:     newRoom.locationLabel || null,
        ventilationType:   newRoom.ventilationType || null,
        climateDescriptor: newRoom.climateDescriptor || null,
        mountingNote:      newRoom.mountingNote || null,
      })) as Room;
      const withNodes: Room = { ...created, nodes: [] };
      setRooms((prev) => [...prev, withNodes]);
      setActiveRoom(withNodes);
      setNewRoom({ ...EMPTY_NEW_ROOM });
      setShowCreate(false);
    } finally {
      setCreateBusy(false);
    }
  };

  const finishDelete = (roomId: string) => {
    const remaining = rooms.filter((r) => r.id !== roomId);
    setRooms(remaining);
    setActiveRoom(remaining[0] ?? null);
    setNodes((prev) => prev.map((n) => (n.roomId === roomId ? { ...n, roomId: null } : n)));
  };

  const requestDelete = async () => {
    if (!activeRoom) return;
    const res = await api.deleteRoom(activeRoom.id);
    if (res.ok) {
      finishDelete(activeRoom.id);
    } else if (res.status === 409 && res.code === 'room_has_data') {
      setDeleteGuard({
        room: activeRoom,
        readingCount: res.data?.readingCount ?? 0,
        nodeCount: res.data?.nodeCount ?? 0,
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteGuard) return;
    const res = await api.deleteRoom(deleteGuard.room.id, true);
    if (res.ok) finishDelete(deleteGuard.room.id);
    setDeleteGuard(null);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>;
  }

  if (!activeRoom) {
    return (
      <div className="max-w-xl mx-auto pt-10 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-primary">No rooms yet</h1>
          <p className="text-sm text-secondary">
            Create your first collection environment (e.g. Home, Varsity, Hospital) to start attributing data.
          </p>
        </div>
        <Card className="space-y-4">
          <CreateRoomForm value={newRoom} onChange={setNewRoom} onSubmit={() => void createRoom()} busy={createBusy} />
        </Card>
      </div>
    );
  }

  const updateField = <K extends keyof Room>(key: K, value: Room[K]) => {
    setActiveRoom({ ...activeRoom, [key]: value });
  };

  const doSave = async (recomputeHistorical: boolean) => {
    if (!activeRoom) return;
    setSaveBusy(true);
    try {
      await api.updateRoom(activeRoom.id, {
        name:         activeRoom.name,
        width_ft:     activeRoom.width_ft,
        height_ft:    activeRoom.height_ft,
        ceiling_ft:   activeRoom.ceiling_ft,
        maxOccupancy: activeRoom.maxOccupancy,
        profile:      activeRoom.profile,
        // Site metadata — empty strings become null so cleared fields persist as null.
        siteType:          activeRoom.siteType || null,
        locationLabel:     activeRoom.locationLabel || null,
        ventilationType:   activeRoom.ventilationType || null,
        hasAC:             activeRoom.hasAC,
        climateDescriptor: activeRoom.climateDescriptor || null,
        occupancyMin:      activeRoom.occupancyMin,
        occupancyMax:      activeRoom.occupancyMax,
        mountingNote:      activeRoom.mountingNote || null,
        recomputeHistorical,
      });
      setRooms(rooms.map((r) => (r.id === activeRoom.id ? activeRoom : r)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaveBusy(false);
      setProfileConfirm(null);
    }
  };

  const save = async () => {
    if (!activeRoom) return;
    const original = rooms.find((r) => r.id === activeRoom.id);
    if (original && original.profile !== activeRoom.profile) {
      // Profile changed — never rewrite history silently. Show the operator
      // exactly how many rows a recompute would touch and let them decide.
      const preview = await api.getRecomputePreview(activeRoom.id, activeRoom.profile);
      setProfileConfirm({
        oldProfile: preview.oldProfile,
        newProfile: activeRoom.profile,
        rowCount: preview.rowCount,
      });
      return;
    }
    await doSave(false);
  };

  const assignNode = async (nodeId: string, roomId: string | null) => {
    await api.updateNode(nodeId, { roomId: roomId ?? '' });
    setNodes(nodes.map((n) => (n.nodeId === nodeId ? { ...n, roomId } : n)));
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      {deleteGuard && (
        <ConfirmModal
          title={`Delete "${deleteGuard.room.name}"?`}
          subtitle={`${deleteGuard.nodeCount} node(s) · ${deleteGuard.readingCount.toLocaleString()} readings`}
          onClose={() => setDeleteGuard(null)}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => setDeleteGuard(null)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={() => void confirmDelete()}>
                Detach nodes & delete room
              </Button>
            </>
          }
        >
          <p>
            {deleteGuard.readingCount.toLocaleString()} readings reference this room&apos;s nodes.
            Deleting the room will <span className="text-primary font-medium">detach the nodes</span> (they
            become unassigned) — collected data is retained and keeps the profile it was recorded under.
          </p>
        </ConfirmModal>
      )}

      {profileConfirm && activeRoom && (
        <ConfirmModal
          title="Change environment profile?"
          subtitle={`${activeRoom.name}: ${profileConfirm.oldProfile} → ${profileConfirm.newProfile}`}
          onClose={() => setProfileConfirm(null)}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => setProfileConfirm(null)}>Cancel</Button>
              <Button size="sm" variant="secondary" disabled={saveBusy} onClick={() => void doSave(false)}>
                Apply to new data only
              </Button>
              <Button size="sm" variant="primary" disabled={saveBusy} onClick={() => void doSave(true)}>
                Apply + recompute {profileConfirm.rowCount.toLocaleString()} rows
              </Button>
            </>
          }
        >
          <p>
            <span className="text-primary font-medium">{profileConfirm.rowCount.toLocaleString()} historical rows</span>{' '}
            in this room were recorded under <span className="font-data">{profileConfirm.oldProfile}</span>.
          </p>
          <p>
            Recomputing rewrites their CELI scores and re-tags them as{' '}
            <span className="font-data">{profileConfirm.newProfile}</span>. Rows recorded under other
            profiles are never touched. For the multi-environment campaign, prefer{' '}
            <span className="text-primary font-medium">&quot;Apply to new data only&quot;</span> so past
            environments stay attributable.
          </p>
        </ConfirmModal>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Room Setup</h1>
          <p className="text-xs text-secondary mt-0.5">Configure dimensions, environment profile, and node assignments</p>
        </div>
        <Button size="sm" variant="primary" onClick={() => setShowCreate(!showCreate)}>
          <Plus size={14} className="mr-1.5" /> New Room
        </Button>
      </div>

      {showCreate && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="space-y-4">
            <CreateRoomForm
              value={newRoom}
              onChange={setNewRoom}
              onSubmit={() => void createRoom()}
              busy={createBusy}
              onCancel={() => setShowCreate(false)}
            />
          </Card>
        </motion.div>
      )}

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

          <div className="pt-3 border-t border-theme space-y-3">
            <div className="text-xs font-semibold text-secondary uppercase tracking-wide">Site metadata</div>

            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Location label</label>
              <input
                type="text"
                placeholder="e.g. AIUB Faculty Office, Dhaka"
                value={activeRoom.locationLabel ?? ''}
                onChange={(e) => updateField('locationLabel', e.target.value)}
                className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Site type</label>
                <select
                  value={activeRoom.siteType ?? ''}
                  onChange={(e) => updateField('siteType', e.target.value || null)}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary capitalize"
                >
                  <option value="">— unset —</option>
                  {SITE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Ventilation</label>
                <select
                  value={activeRoom.ventilationType ?? ''}
                  onChange={(e) => updateField('ventilationType', e.target.value || null)}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary capitalize"
                >
                  <option value="">— unset —</option>
                  {VENTILATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Climate descriptor</label>
                <input
                  type="text"
                  placeholder="e.g. tropical humid"
                  value={activeRoom.climateDescriptor ?? ''}
                  onChange={(e) => updateField('climateDescriptor', e.target.value)}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeRoom.hasAC ?? false}
                  onChange={(e) => updateField('hasAC', e.target.checked)}
                  className="accent-aether-500 w-4 h-4"
                />
                <span className="text-xs font-medium text-secondary">Has air conditioning</span>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Occupancy min</label>
                <input
                  type="number" min="0" step="1"
                  value={activeRoom.occupancyMin ?? 0}
                  onChange={(e) => updateField('occupancyMin', Number(e.target.value))}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Occupancy max</label>
                <input
                  type="number" min="0" step="1"
                  value={activeRoom.occupancyMax ?? 0}
                  onChange={(e) => updateField('occupancyMax', Number(e.target.value))}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
                />
              </div>
              <div className="col-span-1" />
            </div>

            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Mounting note</label>
              <input
                type="text"
                placeholder="sensor height / location in room"
                value={activeRoom.mountingNote ?? ''}
                onChange={(e) => updateField('mountingNote', e.target.value)}
                className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button variant="primary" size="sm" disabled={saveBusy} onClick={() => void save()}>Save changes</Button>
            {saved && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1 text-xs text-green-400"
              >
                <Check size={14} /> Saved
              </motion.span>
            )}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => void requestDelete()}>
              <Trash2 size={14} className="mr-1.5 text-red-400" />
              <span className="text-red-400">Delete room</span>
            </Button>
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
          Readings, processed rows, and alerts older than this are purged by a scheduled backend job
          (every 6 hours; a dry-run line is logged before any deletion). Make sure this comfortably
          exceeds the collection campaign length.
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
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="primary" disabled={retentionBusy} onClick={() => void saveRetention()}>
            Save retention
          </Button>
          <Button size="sm" variant="secondary" disabled={retentionBusy} onClick={() => void previewPurge()}>
            Preview purge (dry run)
          </Button>
          {retentionSaved && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1 text-xs text-green-400"
            >
              <Check size={14} /> Saved
            </motion.span>
          )}
        </div>
        {purgePreview && (
          <p className="text-xs text-muted bg-surface-2 border border-theme rounded-xl px-3 py-2">{purgePreview}</p>
        )}
      </Card>
    </motion.div>
  );
}

function CreateRoomForm({
  value, onChange, onSubmit, busy, onCancel,
}: {
  value: typeof EMPTY_NEW_ROOM;
  onChange: (v: typeof EMPTY_NEW_ROOM) => void;
  onSubmit: () => void;
  busy: boolean;
  onCancel?: () => void;
}) {
  const set = <K extends keyof typeof EMPTY_NEW_ROOM>(key: K, v: (typeof EMPTY_NEW_ROOM)[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <>
      <div className="flex items-center gap-2">
        <Plus size={16} className="text-aether-400" />
        <h3 className="text-sm font-semibold text-primary">Create Room</h3>
      </div>

      <div>
        <label className="text-xs font-medium text-secondary mb-1.5 block">Room name</label>
        <input
          type="text"
          placeholder="e.g. Home Bedroom / Varsity Lab / Hospital Ward"
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
          className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {([['width_ft', 'Width (ft)'], ['height_ft', 'Length (ft)'], ['ceiling_ft', 'Ceiling (ft)']] as const).map(([key, label]) => (
          <div key={key}>
            <label className="text-xs font-medium text-secondary mb-1.5 block">{label}</label>
            <input
              type="number" step="0.5"
              value={value[key]}
              onChange={(e) => set(key, Number(e.target.value))}
              className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-secondary mb-1.5 block">Maximum occupancy</label>
          <input
            type="number" min="1" step="1"
            value={value.maxOccupancy}
            onChange={(e) => set('maxOccupancy', Number(e.target.value))}
            className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary mb-1.5 block">Environment profile</label>
          <select
            value={value.profile}
            onChange={(e) => set('profile', e.target.value)}
            className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
          >
            {Object.values(DEPS_PROFILES).map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="text-xs text-muted">
        {DEPS_PROFILES[value.profile]?.description ?? ''}
      </div>

      <div className="pt-2 border-t border-theme space-y-3">
        <div className="text-xs font-semibold text-secondary uppercase tracking-wide">Site metadata</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-secondary mb-1.5 block">Location label</label>
            <input
              type="text"
              placeholder="e.g. AIUB Faculty Office, Dhaka"
              value={value.locationLabel}
              onChange={(e) => set('locationLabel', e.target.value)}
              className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-secondary mb-1.5 block">Site type</label>
            <select
              value={value.siteType}
              onChange={(e) => set('siteType', e.target.value)}
              className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary capitalize"
            >
              <option value="">— unset —</option>
              {SITE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-secondary mb-1.5 block">Ventilation</label>
            <select
              value={value.ventilationType}
              onChange={(e) => set('ventilationType', e.target.value)}
              className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary capitalize"
            >
              <option value="">— unset —</option>
              {VENTILATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-secondary mb-1.5 block">Climate descriptor</label>
            <input
              type="text"
              placeholder="e.g. tropical humid"
              value={value.climateDescriptor}
              onChange={(e) => set('climateDescriptor', e.target.value)}
              className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.hasAC}
              onChange={(e) => set('hasAC', e.target.checked)}
              className="accent-aether-500 w-4 h-4"
            />
            <span className="text-xs font-medium text-secondary">Has air conditioning</span>
          </label>
          <input
            type="text"
            placeholder="mounting note (sensor height / location)"
            value={value.mountingNote}
            onChange={(e) => set('mountingNote', e.target.value)}
            className="flex-1 min-w-[200px] bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="primary" disabled={busy || !value.name.trim()} onClick={onSubmit}>
          {busy ? 'Creating…' : 'Create room'}
        </Button>
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </>
  );
}
