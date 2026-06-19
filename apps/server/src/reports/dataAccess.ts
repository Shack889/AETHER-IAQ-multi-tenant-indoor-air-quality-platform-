/**
 * Report data access — the SINGLE place reports read measurements. Every query
 * here is hard-filtered `simulated: false`; centralising this is what guarantees
 * the real-hardware-only rule cannot be violated per-report. Nothing in reports/
 * should query Reading/ProcessedData directly.
 */
import { prisma } from '../config/database';
import { EXPECTED_INTERVAL_SECONDS, FREEZE_POINT, ReportMode } from './constants';

export interface RoomScope {
  roomId: string | null;
  roomName: string | null;
  nodeIds: string[];
  room: Awaited<ReturnType<typeof prisma.room.findUnique>> | null;
}

/** Resolve a room to its name + member node ids (the keys readings are stored under). */
export async function resolveRoomScope(roomId: string): Promise<RoomScope> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { nodes: { select: { nodeId: true } } },
  });
  if (!room) return { roomId, roomName: null, nodeIds: [], room: null };
  return {
    roomId: room.id,
    roomName: room.name,
    nodeIds: room.nodes.map((n) => n.nodeId),
    room,
  };
}

/** Min/max timestamp of REAL processed rows for a set of nodes (picker bounds). */
export async function getRealDataBounds(
  nodeIds: string[],
): Promise<{ min: Date | null; max: Date | null; count: number }> {
  if (nodeIds.length === 0) return { min: null, max: null, count: 0 };
  const agg = await prisma.processedData.aggregate({
    where: { simulated: false, nodeId: { in: nodeIds } },
    _min: { timestamp: true },
    _max: { timestamp: true },
    _count: { _all: true },
  });
  return { min: agg._min.timestamp, max: agg._max.timestamp, count: agg._count._all };
}

/** Rooms that actually have real data, with their available real-data span. */
export async function getRoomsWithRealData(): Promise<
  Array<{ roomId: string; roomName: string; min: Date | null; max: Date | null; count: number }>
> {
  const realNodes = await prisma.processedData.findMany({
    where: { simulated: false },
    distinct: ['nodeId'],
    select: { nodeId: true },
  });
  const nodeIds = realNodes.map((r) => r.nodeId);
  if (nodeIds.length === 0) return [];
  const nodes = await prisma.node.findMany({
    where: { nodeId: { in: nodeIds }, roomId: { not: null } },
    select: { nodeId: true, roomId: true, room: { select: { id: true, name: true } } },
  });
  const byRoom = new Map<string, { name: string; nodeIds: string[] }>();
  for (const n of nodes) {
    if (!n.room) continue;
    const e = byRoom.get(n.room.id) ?? { name: n.room.name, nodeIds: [] };
    e.nodeIds.push(n.nodeId);
    byRoom.set(n.room.id, e);
  }
  const out = [];
  for (const [roomId, { name, nodeIds: ids }] of byRoom) {
    const b = await getRealDataBounds(ids);
    out.push({ roomId, roomName: name, min: b.min, max: b.max, count: b.count });
  }
  return out;
}

/**
 * Clamp the requested window to the report mode. Research mode never reads
 * anything before the §M7 freeze point, even if the caller asks for earlier.
 */
export function applyModeWindow(from: Date, to: Date, mode: ReportMode): { from: Date; to: Date } {
  if (mode === 'research' && from < FREEZE_POINT) return { from: FREEZE_POINT, to };
  return { from, to };
}

export interface PollutantStat {
  key: string;
  label: string;
  unit: string;
  n: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  p95: number | null;
}

export interface SeriesPoint {
  t: number; // epoch ms
  pm25: number; co2: number; voc: number; temp: number; rh: number;
}

export interface AirQualitySummary {
  totalReadings: number;
  from: Date;
  to: Date;
  completenessPct: number;
  pollutants: PollutantStat[];
  series: SeriesPoint[];
}

const POLLUTANTS: Array<{ key: string; field: string; label: string; unit: string }> = [
  { key: 'pm25', field: 'pm25_corrected', label: 'PM₂.₅',       unit: 'µg/m³' },
  { key: 'co2',  field: 'co2_filtered',   label: 'CO₂',         unit: 'ppm' },
  { key: 'voc',  field: 'voc_filtered',   label: 'VOC Index',   unit: 'index' },
  { key: 'temp', field: 'temp_filtered',  label: 'Temperature', unit: '°C' },
  { key: 'rh',   field: 'rh_filtered',    label: 'Humidity',    unit: '%' },
];

/** Downsample a time series to at most `maxPoints` averaged buckets. */
function downsample(rows: SeriesPoint[], maxPoints = 320): SeriesPoint[] {
  if (rows.length <= maxPoints) return rows;
  const bucketMs = (rows[rows.length - 1].t - rows[0].t) / maxPoints || 1;
  const out: SeriesPoint[] = [];
  let bucketStart = rows[0].t;
  let acc: SeriesPoint | null = null;
  let count = 0;
  const flush = () => {
    if (acc && count > 0) {
      out.push({
        t: acc.t / count, pm25: acc.pm25 / count, co2: acc.co2 / count,
        voc: acc.voc / count, temp: acc.temp / count, rh: acc.rh / count,
      });
    }
    acc = null; count = 0;
  };
  for (const r of rows) {
    if (r.t >= bucketStart + bucketMs) { flush(); bucketStart = r.t; }
    acc = acc
      ? { t: acc.t + r.t, pm25: acc.pm25 + r.pm25, co2: acc.co2 + r.co2, voc: acc.voc + r.voc, temp: acc.temp + r.temp, rh: acc.rh + r.rh }
      : { ...r };
    count++;
  }
  flush();
  return out;
}

/**
 * Air-quality summary over real data only. Returns per-pollutant aggregates,
 * a downsampled series for charts, and data completeness vs the expected 15 s
 * cadence. Empty windows return totalReadings = 0 (caller renders the limited
 * data state) — it never fabricates or interpolates.
 */
export async function getAirQualitySummary(params: {
  nodeIds: string[];
  from: Date;
  to: Date;
}): Promise<AirQualitySummary> {
  const { nodeIds, from, to } = params;
  const empty: AirQualitySummary = {
    totalReadings: 0, from, to, completenessPct: 0,
    pollutants: POLLUTANTS.map((p) => ({ ...p, n: 0, mean: null, min: null, max: null, median: null, p95: null })),
    series: [],
  };
  if (nodeIds.length === 0) return empty;

  // Aggregates (count/mean/min/max + median/p95 via percentile_cont) in one pass.
  const selects = POLLUTANTS.flatMap((p) => [
    `avg("${p.field}") AS ${p.key}_mean`,
    `min("${p.field}") AS ${p.key}_min`,
    `max("${p.field}") AS ${p.key}_max`,
    `percentile_cont(0.5)  WITHIN GROUP (ORDER BY "${p.field}") AS ${p.key}_med`,
    `percentile_cont(0.95) WITHIN GROUP (ORDER BY "${p.field}") AS ${p.key}_p95`,
  ]).join(',\n         ');

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, number | bigint | null>>>(
    `SELECT count(*) AS n,
         ${selects}
       FROM "ProcessedData"
       WHERE simulated = false AND "nodeId" = ANY($1) AND timestamp >= $2 AND timestamp < $3`,
    nodeIds, from, to,
  );
  const r = rows[0];
  const total = Number(r.n ?? 0);
  if (total === 0) return empty;

  const num = (v: number | bigint | null): number | null =>
    v == null ? null : Math.round(Number(v) * 100) / 100;

  const pollutants: PollutantStat[] = POLLUTANTS.map((p) => ({
    key: p.key, label: p.label, unit: p.unit, n: total,
    mean: num(r[`${p.key}_mean`]), min: num(r[`${p.key}_min`]), max: num(r[`${p.key}_max`]),
    median: num(r[`${p.key}_med`]), p95: num(r[`${p.key}_p95`]),
  }));

  // Series for charts (capped fetch, then downsampled).
  const raw = await prisma.processedData.findMany({
    where: { simulated: false, nodeId: { in: nodeIds }, timestamp: { gte: from, lt: to } },
    orderBy: { timestamp: 'asc' },
    select: { timestamp: true, pm25_corrected: true, co2_filtered: true, voc_filtered: true, temp_filtered: true, rh_filtered: true },
    take: 20000,
  });
  const series = downsample(raw.map((x) => ({
    t: x.timestamp.getTime(), pm25: x.pm25_corrected, co2: x.co2_filtered,
    voc: x.voc_filtered, temp: x.temp_filtered, rh: x.rh_filtered,
  })));

  const expected = Math.max(1, Math.floor((to.getTime() - from.getTime()) / 1000 / EXPECTED_INTERVAL_SECONDS));
  const completenessPct = Math.min(100, Math.round((total / expected) * 1000) / 10);

  return { totalReadings: total, from, to, completenessPct, pollutants, series };
}
