'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Cpu, Wifi, WifiOff, Plus, Power, RefreshCw, Check, X, Code, Copy, Wind } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useAetherStore } from '@/lib/store';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { cn, formatTimestamp } from '@/lib/utils';

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
  posX: number | null;
  posY: number | null;
}

export default function NodesPage() {
  const { activeNodeId, setActiveNode, userId } = useAetherStore();
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<NodeRecord | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cmdState, setCmdState] = useState<{ command: string; ok: boolean; message: string } | null>(null);
  const [newNode, setNewNode] = useState({ nodeId: '', name: '' });

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

  const toggleDataSource = async () => {
    if (!selected || selected.dataSource === 'simulation') return;
    const next = selected.dataSource === 'mock' ? 'live' : 'mock';
    await api.updateNode(selected.nodeId, { dataSource: next });
    const updated = { ...selected, dataSource: next as NodeRecord['dataSource'] };
    setSelected(updated);
    setNodes(nodes.map((n) => (n.nodeId === selected.nodeId ? updated : n)));
  };

  const refresh = async () => {
    setIsLoading(true);
    try {
      const data = (await api.getNodes()) as NodeRecord[];
      setNodes(data);
      if (data.length > 0 && !selected) setSelected(data[0]);
    } finally {
      setIsLoading(false);
    }
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
              <Row k="Name"          v={selected.name} />
              <Row k="Node ID"       v={<span className="font-data">{selected.nodeId}</span>} />
              <Row k="Status"        v={<span className={selected.isOnline ? 'text-green-400 font-medium' : 'text-muted'}>
                {selected.isOnline ? 'Online' : 'Offline'}
              </span>} />
              <Row k="Connectivity"  v={selected.connectivity} />
              <Row k="Firmware"      v={selected.firmware ?? '—'} />
              <Row k="Last seen"     v={selected.lastSeen ? formatTimestamp(selected.lastSeen) : '—'} />
              <Row k="Position"      v={selected.posX != null && selected.posY != null
                ? `(${selected.posX.toFixed(2)}, ${selected.posY.toFixed(2)})`
                : 'Not placed'} />
              <Row k="Data source"   v={
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-wider',
                    selected.dataSource === 'mock'       && 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                    selected.dataSource === 'live'       && 'bg-green-500/15 text-green-400 border-green-500/30',
                    selected.dataSource === 'simulation' && 'bg-purple-500/15 text-purple-400 border-purple-500/30',
                  )}>
                    {selected.dataSource.toUpperCase()}
                  </span>
                  {selected.dataSource !== 'simulation' && (
                    <button
                      onClick={() => void toggleDataSource()}
                      className="text-xs text-aether-400 hover:text-aether-300 underline"
                    >
                      switch to {selected.dataSource === 'mock' ? 'live' : 'mock'}
                    </button>
                  )}
                </div>
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
