'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Cpu, Wifi, WifiOff, Plus, Power, RefreshCw, Check, X, Code, Copy, Wind, AlertTriangle, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useAetherStore } from '@/lib/store';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { cn, formatTimestamp } from '@/lib/utils';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';

function buildEsp32Snippet(userId: string, nodeId: string, brokerHint: string): string {
  return `// AETHER firmware configuration for ${nodeId}
#define MQTT_BROKER  "${brokerHint}"
#define MQTT_PORT    8883
#define MQTT_USER    "aether-backend"
#define MQTT_PASS    "<your broker password>"
#define MQTT_TOPIC   "aether/${userId}/${nodeId}/data"
#define NODE_ID      "${nodeId}"

// JSON payload format (publish every 15 seconds):
{
  "pm1":      12.3,
  "pm25":     18.7,
  "pm10":     28.4,
  "co2":      742,
  "tvoc":     128,
  "temp_bme": 26.8,
  "rh_bme":   58.2,
  "pressure": 1012.4,
  "temp_scd": 27.1,
  "rh_scd":   61.0,
  "uptime":   34200,
  "wifi_rssi": -42,
  "heap_free": 186240
}`;
}

interface NodeRecord {
  id: string;
  nodeId: string;
  name: string;
  roomId: string | null;
  isOnline: boolean;
  lastSeen: string | null;
  firmware: string | null;
  connectivity: 'wifi' | 'cellular' | 'espnow';
  dataSource: 'mock' | 'live' | 'simulation';
  mockEnabled: boolean;
  hardwareEnabled: boolean;
  posX: number | null;
  posY: number | null;
}

interface RoomRecord {
  id: string;
  name: string;
  profile: string;
}

export default function NodesPage() {
  const { activeNodeId, setActiveNode, userId } = useAetherStore();
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<NodeRecord | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cmdState, setCmdState] = useState<{ command: string; ok: boolean; message: string } | null>(null);
  const [newNode, setNewNode] = useState({ nodeId: '', name: '' });
  const [hwPopup, setHwPopup] = useState<{ nodeId: string; title: string; message: string } | null>(null);
  const [deleteState, setDeleteState] = useState<{
    node: NodeRecord; phase: 'confirm' | 'force'; message?: string; realReadingCount?: number;
  } | null>(null);
  const [typedConfirm, setTypedConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const finishNodeDelete = (nodeId: string) => {
    setNodes((prev) => prev.filter((p) => p.nodeId !== nodeId));
    if (selected?.nodeId === nodeId) setSelected(null);
    setDeleteState(null);
    setTypedConfirm('');
  };

  /** Two-step destroy. First call is unforced — the server refuses (409) when
   *  the node holds real readings, and we escalate to a typed-confirmation
   *  step before re-calling with force=true. Empty nodes delete on the first
   *  call, but still behind an explicit confirm click. */
  const attemptDelete = async (force: boolean) => {
    if (!deleteState) return;
    setDeleteBusy(true);
    try {
      const res = await api.deleteNode(deleteState.node.nodeId, force);
      if (res.ok) {
        finishNodeDelete(deleteState.node.nodeId);
      } else if (res.status === 409 && res.code === 'node_has_real_data') {
        setDeleteState({
          ...deleteState,
          phase: 'force',
          message: res.message,
          realReadingCount: res.realReadingCount,
        });
        setTypedConfirm('');
      } else {
        setDeleteState({ ...deleteState, message: res.message ?? `Failed (${res.status})` });
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const sendCommand = async (command: 'reboot' | 'recalibrate' | 'toggle_ventilation') => {
    if (!selected) return;
    setCmdState({ command, ok: false, message: 'Sending…' });
    const result = await api.sendNodeCommand(selected.nodeId, command);
    setCmdState({
      command,
      ok: result.ok,
      message: result.ok
        ? `Published to aether/${userId ?? '?'}/${selected.nodeId}/cmd`
        : (result.message ?? `Failed (${result.status})`),
    });
    setTimeout(() => setCmdState(null), 5000);
  };

  /** Per-node independent toggle for either source. Optimistic with rollback.
   *  When flipping Hardware OFF → ON we pre-check the MQTT broker; if it isn't
   *  connected we show a popup and DON'T flip the switch — silent failures here
   *  would be worse than an explicit modal. */
  const toggleSourceFlag = async (n: NodeRecord, flag: 'mockEnabled' | 'hardwareEnabled') => {
    if (n.dataSource === 'simulation') return;
    const previous = n[flag];
    const next = !previous;

    // Pre-flight check before turning Hardware ON.
    if (flag === 'hardwareEnabled' && next === true) {
      try {
        const status = await api.getHardwareStatus(n.nodeId);
        if (!status.canEnable) {
          setHwPopup({
            nodeId: n.nodeId,
            title: 'No hardware found',
            message: status.reason
              ?? 'Real hardware cannot be enabled right now. Connect the MQTT broker and ESP32, then try again.',
          });
          return;
        }
      } catch (err) {
        setHwPopup({
          nodeId: n.nodeId,
          title: 'Hardware status check failed',
          message: `Could not verify broker state — ${(err as Error).message}. Hardware ingestion was not enabled.`,
        });
        return;
      }
    }

    setNodes((prev) => prev.map((p) => (p.nodeId === n.nodeId ? { ...p, [flag]: next } : p)));
    if (selected?.nodeId === n.nodeId) {
      setSelected({ ...selected, [flag]: next });
    }
    try {
      await api.updateNode(n.nodeId, { [flag]: next });
    } catch (err) {
      // Server-side guard rejected (e.g. broker dropped between pre-check and PUT).
      setNodes((prev) => prev.map((p) => (p.nodeId === n.nodeId ? { ...p, [flag]: previous } : p)));
      if (selected?.nodeId === n.nodeId) setSelected({ ...selected, [flag]: previous });
      if (flag === 'hardwareEnabled' && next === true) {
        setHwPopup({
          nodeId: n.nodeId,
          title: 'Could not enable hardware',
          message: (err as Error).message,
        });
      }
    }
  };

  const refresh = async () => {
    setIsLoading(true);
    try {
      const [data, roomData] = await Promise.all([api.getNodes(), api.getRooms()]);
      setNodes(data as NodeRecord[]);
      setRooms(roomData as RoomRecord[]);
      if ((data as NodeRecord[]).length > 0 && !selected) setSelected((data as NodeRecord[])[0]);
    } finally {
      setIsLoading(false);
    }
  };

  const roomOf = (n: NodeRecord | null) =>
    n?.roomId ? rooms.find((r) => r.id === n.roomId) ?? null : null;

  /** Moving a node between rooms IS the environment switch for the campaign —
   *  new rows are attributed to the target room's profile from this moment. */
  const reassignRoom = async (n: NodeRecord, roomId: string | null) => {
    await api.updateNode(n.nodeId, { roomId: roomId ?? '' });
    setNodes((prev) => prev.map((p) => (p.nodeId === n.nodeId ? { ...p, roomId } : p)));
    if (selected?.nodeId === n.nodeId) setSelected({ ...selected, roomId });
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, []);

  const register = async () => {
    if (!newNode.nodeId.trim()) return;
    await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: newNode.nodeId.trim(), name: newNode.name.trim() || newNode.nodeId.trim() }),
    }).catch(() => {});
    setNewNode({ nodeId: '', name: '' });
    setShowRegister(false);
    void refresh();
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>;
  }

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      {hwPopup && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.55)' }}
          onClick={() => setHwPopup(null)}
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
                <h2 className="text-base font-semibold text-primary">{hwPopup.title}</h2>
                <p className="text-xs text-secondary mt-0.5 font-data">{hwPopup.nodeId}</p>
              </div>
            </div>
            <p className="text-sm text-secondary leading-relaxed">{hwPopup.message}</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="primary" onClick={() => setHwPopup(null)}>
                OK
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {deleteState && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.55)' }}
          onClick={() => !deleteBusy && setDeleteState(null)}
        >
          <motion.div
            initial={{ scale: 0.96, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-surface-1 border border-theme rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-primary">
                  {deleteState.phase === 'force' ? 'Permanently delete this node?' : 'Delete node?'}
                </h2>
                <p className="text-xs text-secondary mt-0.5 font-data">{deleteState.node.nodeId}</p>
              </div>
            </div>

            {deleteState.phase === 'confirm' ? (
              <p className="text-sm text-secondary leading-relaxed">
                This removes the node and all of its readings, processed data, alerts, and algorithm
                state. If the node holds real research data you&apos;ll be asked to confirm again.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-400 leading-relaxed">
                  {deleteState.message
                    ?? `This node holds ${deleteState.realReadingCount ?? ''} real readings. Deletion is permanent and unrecoverable.`}
                </p>
                <div>
                  <label className="text-xs font-medium text-secondary mb-1.5 block">
                    Type <span className="font-data text-primary">{deleteState.node.nodeId}</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={typedConfirm}
                    onChange={(e) => setTypedConfirm(e.target.value)}
                    autoFocus
                    placeholder={deleteState.node.nodeId}
                    className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" disabled={deleteBusy} onClick={() => setDeleteState(null)}>
                Cancel
              </Button>
              {deleteState.phase === 'confirm' ? (
                <Button size="sm" variant="danger" disabled={deleteBusy} onClick={() => void attemptDelete(false)}>
                  {deleteBusy ? 'Deleting…' : 'Delete node'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={deleteBusy || typedConfirm !== deleteState.node.nodeId}
                  onClick={() => void attemptDelete(true)}
                >
                  {deleteBusy ? 'Deleting…' : 'Permanently delete'}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Node Manager</h1>
          <p className="text-xs text-secondary mt-0.5">Manage registered AETHER sensor nodes</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => void refresh()}>
            <RefreshCw size={14} className="mr-1.5" /> Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={() => setShowRegister(!showRegister)}>
            <Plus size={14} className="mr-1.5" /> Register Node
          </Button>
        </div>
      </div>

      {showRegister && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-primary">Register new node</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                placeholder="Node ID (e.g. AETHER-N01)"
                value={newNode.nodeId}
                onChange={(e) => setNewNode((n) => ({ ...n, nodeId: e.target.value }))}
                className="bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary font-data"
              />
              <input
                placeholder="Display name"
                value={newNode.name}
                onChange={(e) => setNewNode((n) => ({ ...n, name: e.target.value }))}
                className="bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => void register()}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowRegister(false)}>Cancel</Button>
            </div>
          </Card>
        </motion.div>
      )}

      <motion.div variants={containerVariants} initial="initial" animate="animate" className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 space-y-2">
          <h3 className="text-sm font-semibold text-primary mb-3">Registered Nodes</h3>
          {nodes.length === 0 ? (
            <div className="text-xs text-muted py-8 text-center">No nodes registered.</div>
          ) : (
            <div className="space-y-2">
              {nodes.map((n) => (
                <motion.button
                  key={n.id}
                  onClick={() => setSelected(n)}
                  whileHover={{ x: 2 }}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                    selected?.id === n.id
                      ? 'bg-aether-500/10 border-aether-500/30'
                      : 'bg-surface-2 border-theme hover:bg-surface-3',
                  )}
                >
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                    n.isOnline ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400',
                  )}>
                    {n.isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-primary truncate">{n.name}</div>
                    <div className="text-xs text-muted font-data truncate">{n.nodeId}</div>
                    <div className="text-[10px] truncate mt-0.5">
                      {roomOf(n) ? (
                        <span className="text-aether-400">
                          {roomOf(n)!.name} · {roomOf(n)!.profile}
                        </span>
                      ) : (
                        <span className="text-orange-400">No room — data unattributed</span>
                      )}
                    </div>
                  </div>
                  <DataSourceBadge simulated={n.dataSource !== 'live'} />
                  {/* Two independent source switches — Mock and Hardware are gated separately.
                      Both ON = both data streams flow (each row correctly tagged by topic shape).
                      Both OFF = node paused. Disabled for simulation nodes (sim engine controls). */}
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SourceSwitch
                      label="Mock"
                      enabled={n.mockEnabled}
                      disabled={n.dataSource === 'simulation'}
                      activeColor="purple"
                      onToggle={() => void toggleSourceFlag(n, 'mockEnabled')}
                      title={n.mockEnabled
                        ? 'Mock generator is producing synthetic readings — click to pause'
                        : 'Click to start synthetic readings for this node'}
                    />
                    <SourceSwitch
                      label="Hardware"
                      enabled={n.hardwareEnabled}
                      disabled={n.dataSource === 'simulation'}
                      activeColor="emerald"
                      onToggle={() => void toggleSourceFlag(n, 'hardwareEnabled')}
                      title={n.hardwareEnabled
                        ? 'Real-hardware ingestion ON — click to drop ESP32 messages silently'
                        : 'ESP32 messages dropped — click to accept real hardware data'}
                    />
                  </div>
                  <div className="text-xs text-muted text-right shrink-0">
                    <div className={n.isOnline ? 'text-green-400 font-medium' : ''}>
                      {n.isOnline ? 'Online' : 'Offline'}
                    </div>
                    {n.lastSeen && (
                      <div className="text-muted">{formatTimestamp(n.lastSeen)}</div>
                    )}
                  </div>
                  {n.nodeId === activeNodeId && (
                    <span className="px-2 py-0.5 rounded-full bg-aether-500/20 text-aether-400 text-xs font-semibold">
                      active
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-aether-400" />
            <h3 className="text-sm font-semibold text-primary">Node Detail</h3>
          </div>

          {!selected ? (
            <div className="text-xs text-muted py-4 text-center">Select a node to see details.</div>
          ) : (
            <div className="space-y-2 text-xs">
              {/* Collection environment — switching rooms is how the operator
                  moves the node between Home / Varsity / Hospital phases. */}
              <div className="p-3 rounded-xl bg-aether-500/10 border border-aether-500/30 space-y-2">
                <div className="text-xs font-semibold text-secondary uppercase tracking-wide">
                  Collection environment
                </div>
                <select
                  value={selected.roomId ?? ''}
                  onChange={(e) => void reassignRoom(selected, e.target.value || null)}
                  className="w-full bg-surface-1 border border-theme rounded-lg px-2 py-1.5 text-xs text-primary"
                >
                  <option value="">— unassigned (data not attributed) —</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} · {r.profile}</option>
                  ))}
                </select>
                <div className="text-[10px] text-muted">
                  New readings are stamped with the room&apos;s profile from the moment you switch.
                  Historical rows keep the profile they were collected under.
                </div>
              </div>

              <Row k="Name"          v={selected.name} />
              <Row k="Node ID"       v={<span className="font-data">{selected.nodeId}</span>} />
              <Row k="Room"          v={roomOf(selected)?.name ?? '—'} />
              <Row k="Profile"       v={<span className="font-data">{roomOf(selected)?.profile ?? '—'}</span>} />
              <Row k="Status"        v={<span className={selected.isOnline ? 'text-green-400 font-medium' : 'text-muted'}>
                {selected.isOnline ? 'Online' : 'Offline'}
              </span>} />
              <Row k="Connectivity"  v={selected.connectivity} />
              <Row k="Firmware"      v={selected.firmware ?? '—'} />
              <Row k="Last seen"     v={selected.lastSeen ? formatTimestamp(selected.lastSeen) : '—'} />
              <Row k="Position"      v={selected.posX != null && selected.posY != null
                ? `(${selected.posX.toFixed(2)}, ${selected.posY.toFixed(2)})`
                : 'Not placed'} />
              <Row k="Sources" v={
                <div className="flex items-center gap-2">
                  <SourceSwitch
                    label="Mock"
                    enabled={selected.mockEnabled}
                    disabled={selected.dataSource === 'simulation'}
                    activeColor="purple"
                    onToggle={() => void toggleSourceFlag(selected, 'mockEnabled')}
                  />
                  <SourceSwitch
                    label="Hardware"
                    enabled={selected.hardwareEnabled}
                    disabled={selected.dataSource === 'simulation'}
                    activeColor="emerald"
                    onToggle={() => void toggleSourceFlag(selected, 'hardwareEnabled')}
                  />
                </div>
              } />
              <Row k="State" v={
                <span className="font-data text-xs text-secondary">
                  {selected.dataSource === 'simulation' ? 'simulation (immutable)'
                    : selected.mockEnabled && selected.hardwareEnabled ? 'mixed (both running)'
                    : selected.mockEnabled ? 'mock only'
                    : selected.hardwareEnabled ? 'live only'
                    : 'paused (no data flowing)'}
                </span>
              } />

              <div className="pt-3 border-t border-theme space-y-2">
                <div className="text-xs font-semibold text-secondary uppercase tracking-wide">Commands</div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={() => void sendCommand('reboot')}>
                    <Power size={14} className="mr-1.5" /> Reboot
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void sendCommand('recalibrate')}>
                    <RefreshCw size={14} className="mr-1.5" /> Recalibrate
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void sendCommand('toggle_ventilation')}>
                    <Wind size={14} className="mr-1.5" /> Toggle ventilation
                  </Button>
                </div>
                {cmdState ? (
                  <div className={cn(
                    'text-xs px-2.5 py-1.5 rounded-lg border',
                    cmdState.ok
                      ? 'bg-green-500/10 border-green-500/20 text-green-400'
                      : 'bg-orange-500/10 border-orange-500/20 text-orange-400',
                  )}>
                    <span className="font-semibold uppercase tracking-wide mr-2">{cmdState.command}</span>
                    {cmdState.message}
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    MQTT downstream commands published to{' '}
                    <span className="font-data">aether/{userId ?? '<userId>'}/{selected.nodeId}/cmd</span>.
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-theme space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-secondary uppercase tracking-wide">ESP32 connection</div>
                  <Button size="sm" variant="ghost" onClick={() => setShowSnippet((s) => !s)}>
                    <Code size={14} className="mr-1.5" />
                    {showSnippet ? 'Hide' : 'Show'} snippet
                  </Button>
                </div>
                {showSnippet && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-1 text-xs">
                      <Row k="MQTT topic" v={
                        <span className="font-data text-aether-300">
                          aether/{userId ?? '<userId>'}/{selected.nodeId}/data
                        </span>
                      } />
                      <Row k="Status topic" v={
                        <span className="font-data text-aether-300">
                          aether/{userId ?? '<userId>'}/{selected.nodeId}/status
                        </span>
                      } />
                    </div>
                    <div className="relative">
                      <pre className="text-[11px] font-data leading-relaxed bg-surface-2 border border-theme rounded-xl p-3 overflow-x-auto whitespace-pre">
                        {buildEsp32Snippet(userId ?? '<userId>', selected.nodeId, 'your-broker.hivemq.cloud')}
                      </pre>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            buildEsp32Snippet(userId ?? '<userId>', selected.nodeId, 'your-broker.hivemq.cloud'),
                          );
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        }}
                        className="absolute top-2 right-2 px-2 py-1 rounded-md bg-surface-1 border border-theme text-xs text-secondary hover:text-primary"
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-theme">
                <Button
                  size="sm"
                  variant={selected.nodeId === activeNodeId ? 'primary' : 'secondary'}
                  onClick={() => setActiveNode(selected.nodeId)}
                  className="w-full"
                >
                  {selected.nodeId === activeNodeId
                    ? <><Check size={14} className="mr-1.5" /> Currently active</>
                    : 'Set as active node'}
                </Button>
              </div>

              <div className="pt-3 border-t border-theme">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setDeleteState({ node: selected, phase: 'confirm' }); setTypedConfirm(''); }}
                  className="w-full"
                >
                  <Trash2 size={14} className="mr-1.5 text-red-400" />
                  <span className="text-red-400">Delete node</span>
                </Button>
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </motion.div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-theme last:border-0">
      <span className="text-muted">{k}</span>
      <span className="text-primary text-right">{v}</span>
    </div>
  );
}

function SourceSwitch({
  label, enabled, disabled, activeColor, onToggle, title,
}: {
  label: string;
  enabled: boolean;
  disabled?: boolean;
  activeColor: 'purple' | 'emerald';
  onToggle: () => void;
  title?: string;
}) {
  const activeBg = activeColor === 'purple' ? 'bg-purple-500' : 'bg-emerald-500';
  const activeText = activeColor === 'purple' ? 'text-purple-300' : 'text-emerald-300';
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={title}
      aria-pressed={enabled}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold tracking-wider uppercase transition-colors',
        disabled
          ? 'opacity-40 cursor-not-allowed border-theme text-muted'
          : enabled
          ? `border-theme ${activeText}`
          : 'border-theme text-muted hover:text-primary',
      )}
    >
      <span
        className={cn(
          'relative inline-block w-6 h-3 rounded-full transition-colors',
          enabled ? activeBg : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-2 h-2 rounded-full bg-white transition-transform',
            enabled ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </span>
      {label}
    </button>
  );
}
