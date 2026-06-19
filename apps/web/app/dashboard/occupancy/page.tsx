'use client';

import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Check, Trash2, Pencil, X, Users, DoorOpen } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useAetherStore } from '@/lib/store';
import { ALLOWED_EVENT_TAGS } from '@aether/shared';
import { containerVariants, pageVariants } from '@/components/animations/variants';
import { cn, formatTimestamp } from '@/lib/utils';
import type { OccupancyEntry, OccupancyInput } from '@/lib/types';

interface NodeRecord {
  nodeId: string;
  name: string;
  roomId: string | null;
}
interface RoomRecord {
  id: string;
  name: string;
}

// Quick-count buttons prefill a representative value for the bucket; the user
// can override in the number field. Tuned for classroom (~30) + small rooms.
const QUICK_COUNTS: Array<{ label: string; value: number }> = [
  { label: '0 (empty)', value: 0 },
  { label: '1', value: 1 },
  { label: '2–5', value: 3 },
  { label: '6–15', value: 10 },
  { label: '16–30', value: 23 },
  { label: '30+', value: 35 },
];

const ACTIVITY_SUGGESTIONS = ['lecture', 'working', 'empty', 'cleaning', 'single occupant', 'meeting'];

const prettyTag = (t: string) => t.replace(/_/g, ' ');

/** Current local wall-clock as a value for <input type="datetime-local">. */
function nowLocalInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
/** Convert an existing ISO timestamp to a datetime-local input value. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const EMPTY_FORM = {
  count: '' as number | '',
  activity: '',
  eventTag: 'none',
  note: '',
};

export default function OccupancyPage() {
  const { activeNodeId } = useAetherStore();
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [nodeId, setNodeId] = useState<string>('');
  const [time, setTime] = useState<string>(nowLocalInput());
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [entries, setEntries] = useState<OccupancyEntry[]>([]);

  const selectedNode = nodes.find((n) => n.nodeId === nodeId);
  const roomName = useMemo(
    () => (selectedNode?.roomId ? rooms.find((r) => r.id === selectedNode.roomId)?.name ?? null : null),
    [selectedNode, rooms],
  );

  // Today's window (local midnight → now) for the entries table.
  const startOfDayIso = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const loadEntries = useCallback(async (forNode: string) => {
    if (!forNode) { setEntries([]); return; }
    const list = await api.getOccupancy({ nodeId: forNode, from: startOfDayIso });
    setEntries(list);
  }, [startOfDayIso]);

  useEffect(() => {
    Promise.all([api.getNodes(), api.getRooms()])
      .then(([n, r]) => {
        const nodeList = n as NodeRecord[];
        const roomList = r as RoomRecord[];
        setNodes(nodeList);
        setRooms(roomList);
        // Default to the currently active node, else the first registered node.
        const initial = nodeList.find((x) => x.nodeId === activeNodeId)?.nodeId
          ?? nodeList[0]?.nodeId ?? '';
        setNodeId(initial);
      })
      .finally(() => setIsLoading(false));
    // activeNodeId is only used to seed the initial selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nodeId) void loadEntries(nodeId);
  }, [nodeId, loadEntries]);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setTime(nowLocalInput());
    setEditingId(null);
  };

  const beginEdit = (e: OccupancyEntry) => {
    setEditingId(e.id);
    setTime(isoToLocalInput(e.timestamp));
    setForm({
      count: e.count ?? '',
      activity: e.activity ?? '',
      eventTag: e.eventTag ?? 'none',
      note: e.note ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async () => {
    if (!nodeId) { flashToast('Select a node first'); return; }
    setSaving(true);
    try {
      const body: OccupancyInput = {
        nodeId,
        // Tie the log to the node's room too, so analysis can join on either.
        roomId: selectedNode?.roomId ?? undefined,
        timestamp: new Date(time).toISOString(),
        count: form.count === '' ? null : Number(form.count),
        activity: form.activity.trim() || null,
        eventTag: form.eventTag,
        note: form.note.trim() || null,
      };
      if (editingId) {
        await api.updateOccupancy(editingId, body);
        flashToast('Entry updated');
      } else {
        await api.createOccupancy(body);
        flashToast('Logged');
      }
      resetForm();
      await loadEntries(nodeId);
    } catch (err) {
      flashToast((err as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (id: string) => {
    await api.deleteOccupancy(id);
    setConfirmDeleteId(null);
    if (editingId === id) resetForm();
    await loadEntries(nodeId);
  };

  // Class-session shortcuts — the classroom's scheduled fill/empty cycle is the
  // strongest H1 evidence, so make those two entries one tap to prefill.
  const prefillClassStart = () => {
    setEditingId(null);
    setTime(nowLocalInput());
    setForm({ count: '', activity: 'lecture', eventTag: 'occupancy_increase', note: '' });
    flashToast('Enter headcount, then Save');
  };
  const prefillRoomEmptied = () => {
    setEditingId(null);
    setTime(nowLocalInput());
    setForm({ count: 0, activity: 'empty', eventTag: 'room_emptied', note: '' });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>;
  }

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Log Occupancy / Event</h1>
          <p className="text-xs text-secondary mt-0.5">
            Independent ground truth for occupancy + context. Log 3–5× a day — these observations
            cannot be reconstructed later.
          </p>
        </div>
      </div>

      {nodes.length === 0 ? (
        <Card>
          <div className="text-sm text-secondary py-6 text-center">
            No nodes registered yet. Register a node first to attribute occupancy logs.
          </div>
        </Card>
      ) : (
        <motion.div variants={containerVariants} initial="initial" animate="animate" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* FORM */}
          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-aether-400" />
              <h3 className="text-sm font-semibold text-primary">
                {editingId ? 'Edit entry' : 'New entry'}
              </h3>
              {editingId && (
                <button onClick={resetForm} className="ml-auto text-xs text-muted hover:text-primary flex items-center gap-1">
                  <X size={12} /> Cancel edit
                </button>
              )}
            </div>

            {/* Node + Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Node</label>
                <select
                  value={nodeId}
                  onChange={(e) => setNodeId(e.target.value)}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
                >
                  {nodes.map((n) => (
                    <option key={n.nodeId} value={n.nodeId}>{n.name}</option>
                  ))}
                </select>
                <div className="text-[10px] text-muted mt-1">
                  {roomName ? <>Room: <span className="text-aether-400">{roomName}</span></> : 'No room assigned — logged against node only'}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Time</label>
                <input
                  type="datetime-local"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
                />
                <button
                  onClick={() => setTime(nowLocalInput())}
                  className="text-[10px] text-muted hover:text-primary mt-1"
                >
                  Reset to now
                </button>
              </div>
            </div>

            {/* Count */}
            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Person count</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {QUICK_COUNTS.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => setForm((f) => ({ ...f, count: q.value }))}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                      form.count === q.value
                        ? 'bg-aether-500/15 text-aether-400 border-aether-500/30'
                        : 'bg-surface-2 text-secondary border-theme hover:text-primary',
                    )}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <input
                type="number" min="0" step="1"
                placeholder="exact count (optional — leave blank if unknown)"
                value={form.count}
                onChange={(e) => setForm((f) => ({ ...f, count: e.target.value === '' ? '' : Number(e.target.value) }))}
                className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm font-data text-primary"
              />
            </div>

            {/* Activity */}
            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Activity</label>
              <input
                type="text"
                list="activity-suggestions"
                placeholder="e.g. lecture, working, empty"
                value={form.activity}
                onChange={(e) => setForm((f) => ({ ...f, activity: e.target.value }))}
                className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
              />
              <datalist id="activity-suggestions">
                {ACTIVITY_SUGGESTIONS.map((a) => <option key={a} value={a} />)}
              </datalist>
            </div>

            {/* Event tag */}
            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Event tag</label>
              <select
                value={form.eventTag}
                onChange={(e) => setForm((f) => ({ ...f, eventTag: e.target.value }))}
                className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary capitalize"
              >
                {ALLOWED_EVENT_TAGS.map((t) => (
                  <option key={t} value={t}>{prettyTag(t)}</option>
                ))}
              </select>
              <div className="text-[10px] text-muted mt-1">
                The contextual event that explains a PM / VOC / CO₂ change — logging it now makes later
                attribution defensible.
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-xs font-medium text-secondary mb-1.5 block">Note <span className="text-muted">(optional)</span></label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full bg-surface-2 border border-theme rounded-xl px-3 py-2 text-sm text-primary"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button variant="primary" size="sm" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : editingId ? 'Update entry' : 'Save entry'}
              </Button>
              {toast && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-1 text-xs text-green-400"
                >
                  <Check size={14} /> {toast}
                </motion.span>
              )}
            </div>

            {/* Class-session shortcuts */}
            <div className="pt-3 border-t border-theme">
              <div className="text-[10px] uppercase tracking-wide text-muted mb-2">Classroom shortcuts</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={prefillClassStart}>
                  <Users size={14} className="mr-1.5" /> Class start
                </Button>
                <Button size="sm" variant="secondary" onClick={prefillRoomEmptied}>
                  <DoorOpen size={14} className="mr-1.5" /> Room emptied
                </Button>
              </div>
            </div>
          </Card>

          {/* TODAY'S ENTRIES */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary">Today&apos;s entries</h3>
              <span className="text-xs text-muted">{selectedNode?.name ?? nodeId}</span>
            </div>

            {entries.length === 0 ? (
              <div className="text-xs text-muted py-8 text-center">No entries logged today for this node.</div>
            ) : (
              <div className="space-y-1.5">
                {entries.slice().reverse().map((e) => (
                  <div
                    key={e.id}
                    className={cn(
                      'flex items-center gap-3 p-2.5 rounded-xl border bg-surface-2',
                      editingId === e.id ? 'border-aether-500/40' : 'border-theme',
                    )}
                  >
                    <div className="font-data text-xs text-primary tabular-nums shrink-0 w-16">
                      {formatTimestamp(e.timestamp)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-primary truncate">
                        <span className="font-semibold">{e.count ?? '—'}</span>
                        {e.activity ? <span className="text-secondary"> · {e.activity}</span> : null}
                      </div>
                      {e.eventTag && e.eventTag !== 'none' && (
                        <div className="text-[10px] text-aether-400 capitalize truncate">{prettyTag(e.eventTag)}</div>
                      )}
                      {e.note && <div className="text-[10px] text-muted truncate">{e.note}</div>}
                    </div>
                    {confirmDeleteId === e.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => void doDelete(e.id)} className="text-[10px] text-red-400 hover:underline">Delete</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] text-muted hover:text-primary">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => beginEdit(e)} className="p-1 text-muted hover:text-aether-400" title="Edit">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDeleteId(e.id)} className="p-1 text-muted hover:text-red-400" title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
