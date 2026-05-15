import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { userOwnsNode } from '../utils/ownership';
import { runAlgorithmPipeline } from '../algorithms';
import { validateReading } from '../mqtt/handler';
import { RawReading } from '@aether/shared';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const EXPORT_HEADERS = [
  'timestamp', 'data_source', 'pm25', 'pm10', 'co2', 'voc', 'temp', 'rh', 'pressure',
  'deps_aqi', 'celi_score', 'epa_aqi', 'cpis', 'cognitive_burden', 'ced_pm', 'ced_co2',
  'temporal_memory_pm', 'temporal_memory_co2', 'temporal_memory_voc',
  'direct_burden', 'interaction_burden', 'total_burden', 'dominant_interaction',
  'recovery_status', 'reliability_pm25', 'reliability_co2', 'reliability_voc',
  'event_type', 'alert_level', 'explanation_text',
];

type SourceFilter = 'all' | 'hardware' | 'simulated';

function parseSource(q: unknown): SourceFilter {
  const s = typeof q === 'string' ? q.toLowerCase() : '';
  if (s === 'hardware' || s === 'simulated') return s;
  return 'all';
}

function sourceWhere(source: SourceFilter): { simulated?: boolean } {
  if (source === 'hardware') return { simulated: false };
  if (source === 'simulated') return { simulated: true };
  return {};
}

interface ExportRow {
  timestamp: string;
  data_source: 'hardware' | 'simulated';
  pm25: number;
  pm10: number | null;
  co2: number;
  voc: number;
  temp: number;
  rh: number;
  pressure: number | null;
  deps_aqi: number;
  celi_score: number;
  epa_aqi: number;
  cpis: number;
  cognitive_burden: number | null;
  ced_pm: number;
  ced_co2: number;
  temporal_memory_pm: number | null;
  temporal_memory_co2: number | null;
  temporal_memory_voc: number | null;
  direct_burden: number | null;
  interaction_burden: number | null;
  total_burden: number | null;
  dominant_interaction: string | null;
  recovery_status: string | null;
  reliability_pm25: number | null;
  reliability_co2: number | null;
  reliability_voc: number | null;
  event_type: string | null;
  alert_level: number;
  explanation_text: string | null;
}

async function fetchRows(
  nodeId: string,
  from?: string,
  to?: string,
  source: SourceFilter = 'all',
): Promise<ExportRow[]> {
  const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const toDate = to ? new Date(to) : new Date();

  const processed = await prisma.processedData.findMany({
    where: {
      nodeId,
      timestamp: { gte: fromDate, lte: toDate },
      ...sourceWhere(source),
    },
    orderBy: { timestamp: 'asc' },
    take: 10000,
  });
  // Pull matching raw readings to recover pm10 + pressure (they're not on ProcessedData).
  // For new rows the handler shares a timestamp; for older rows the two writes drift
  // a few ms apart, so fall back to the closest reading within ±2s.
  const raws = await prisma.reading.findMany({
    where: { nodeId, timestamp: { gte: fromDate, lte: toDate } },
    select: { timestamp: true, pm10_raw: true, pressure_hpa: true },
    orderBy: { timestamp: 'asc' },
  });
  const rawTimes = raws.map((r) => r.timestamp.getTime());
  const findClosestRaw = (targetMs: number) => {
    if (raws.length === 0) return null;
    let lo = 0, hi = raws.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rawTimes[mid] < targetMs) lo = mid + 1; else hi = mid;
    }
    const candidates = [raws[Math.max(0, lo - 1)], raws[lo]];
    let best = candidates[0]; let bestDelta = Math.abs(rawTimes[Math.max(0, lo - 1)] - targetMs);
    const d2 = Math.abs(rawTimes[lo] - targetMs);
    if (d2 < bestDelta) { best = candidates[1]; bestDelta = d2; }
    return bestDelta <= 2000 ? best : null;
  };

  return processed.map((p) => {
    const raw = findClosestRaw(p.timestamp.getTime());
    return {
      timestamp: p.timestamp.toISOString(),
      data_source: p.simulated ? 'simulated' : 'hardware',
      pm25: round(p.pm25_corrected, 2),
      pm10: raw?.pm10_raw ?? null,
      co2: Math.round(p.co2_filtered),
      voc: Math.round(p.voc_filtered),
      temp: round(p.temp_filtered, 2),
      rh: round(p.rh_filtered, 1),
      pressure: raw?.pressure_hpa ?? null,
      deps_aqi: p.deps_aqi,
      celi_score: p.celi_score ?? p.deps_aqi,
      epa_aqi: p.epa_aqi,
      cpis: p.cpis,
      cognitive_burden: p.cognitive_burden,
      ced_pm: round(p.ced_pm25, 2),
      ced_co2: round(p.ced_co2, 2),
      temporal_memory_pm:  p.temporal_memory_pm,
      temporal_memory_co2: p.temporal_memory_co2,
      temporal_memory_voc: p.temporal_memory_voc,
      direct_burden:        p.direct_burden,
      interaction_burden:   p.interaction_burden,
      total_burden:         p.total_burden,
      dominant_interaction: p.dominant_interaction,
      recovery_status:      p.recovery_status,
      reliability_pm25: p.reliability_pm25,
      reliability_co2:  p.reliability_co2,
      reliability_voc:  p.reliability_voc,
      event_type: p.event_type,
      alert_level: p.alert_level,
      explanation_text: p.explanation_text,
    };
  });
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function rowsToCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_HEADERS.join(',')];
  for (const r of rows) {
    lines.push(EXPORT_HEADERS.map((h) => {
      const v = (r as unknown as Record<string, unknown>)[h];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
  }
  return lines.join('\n');
}

function summarize(values: number[]): Record<string, number> {
  if (values.length === 0) return { count: 0, mean: 0, min: 0, max: 0, std: 0, p50: 0, p90: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return {
    count: values.length,
    mean: round(mean, 3),
    min: round(sorted[0], 3),
    max: round(sorted[sorted.length - 1], 3),
    std: round(Math.sqrt(variance), 3),
    p50: round(pct(50), 3),
    p90: round(pct(90), 3),
    p95: round(pct(95), 3),
  };
}

/** GET /api/data/export/csv/:nodeId?from=&to=&source= */
router.get('/export/csv/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { from, to } = req.query as Record<string, string>;
    const source = parseSource(req.query['source']);
    const rows = await fetchRows(nodeId, from, to, source);
    const csv = rowsToCsv(rows);
    const suffix = source === 'all' ? '' : `-${source}`;
    const filename = `aether-${nodeId}${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    logger.error({ err }, 'export CSV failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/data/export/xlsx/:nodeId?from=&to=&source= */
router.get('/export/xlsx/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { from, to } = req.query as Record<string, string>;
    const source = parseSource(req.query['source']);
    const rows = await fetchRows(nodeId, from, to, source);

    const wb = XLSX.utils.book_new();

    // Sheet 1: raw data — data_source column is the 2nd column per spec.
    const dataSheet = XLSX.utils.json_to_sheet(rows, { header: EXPORT_HEADERS });
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');

    // Sheet 2: side-by-side hardware vs simulated statistics so the paper's
    // analysis can compare regimes when an export contains both.
    const numericParams = ['pm25', 'co2', 'voc', 'temp', 'rh', 'cpis', 'deps_aqi', 'celi_score', 'epa_aqi'] as const;
    const hardwareRows  = rows.filter((r) => r.data_source === 'hardware');
    const simulatedRows = rows.filter((r) => r.data_source === 'simulated');
    const statsRows = numericParams.map((p) => {
      const hwValues  = hardwareRows.map((r) => Number((r as unknown as Record<string, unknown>)[p])).filter(Number.isFinite);
      const simValues = simulatedRows.map((r) => Number((r as unknown as Record<string, unknown>)[p])).filter(Number.isFinite);
      const hw  = summarize(hwValues);
      const sim = summarize(simValues);
      return {
        parameter: p,
        hardware_count: hw.count,
        hardware_mean:  hw.mean,
        hardware_min:   hw.min,
        hardware_max:   hw.max,
        hardware_std:   hw.std,
        hardware_p95:   hw.p95,
        simulated_count: sim.count,
        simulated_mean:  sim.mean,
        simulated_min:   sim.min,
        simulated_max:   sim.max,
        simulated_std:   sim.std,
        simulated_p95:   sim.p95,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statsRows), 'Statistics');

    // Sheet 3: compliance — pull pass/fail booleans from ProcessedData
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const compRows = await prisma.processedData.findMany({
      where: { nodeId, timestamp: { gte: fromDate, lte: toDate }, ...sourceWhere(source) },
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true, who_pass: true, epa_pass: true, bnaaqs_pass: true,
        ashrae_pass: true, well_pass: true, reset_pass: true, alert_level: true,
      },
      take: 10000,
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(compRows.map((c) => ({
        timestamp: c.timestamp.toISOString(),
        who: c.who_pass, epa: c.epa_pass, bnaaqs: c.bnaaqs_pass,
        ashrae: c.ashrae_pass, well: c.well_pass, reset: c.reset_pass,
        alert_level: c.alert_level,
      }))),
      'Compliance',
    );

    // Sheet 4: event log — non-null event_type rows
    const events = rows.filter((r) => r.event_type);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(events.length ? events.map((e) => ({
        timestamp: e.timestamp, event_type: e.event_type, pm25: e.pm25, co2: e.co2, voc: e.voc, alert_level: e.alert_level,
      })) : [{ note: 'No events in selected range' }]),
      'Events',
    );

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const suffix = source === 'all' ? '' : `-${source}`;
    const filename = `aether-${nodeId}${suffix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);
  } catch (err) {
    logger.error({ err }, 'export XLSX failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/data/import — multipart CSV upload (field "file"), form field "nodeId" */
router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ success: false, message: 'file field required' });
    const nodeId = (req.body as { nodeId?: string }).nodeId?.trim();
    if (!nodeId) return res.status(400).json({ success: false, message: 'nodeId required' });
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden — node not owned by user' });
    }

    const node = await prisma.node.findUnique({ where: { nodeId } });
    let profileKey = 'OFFICE_OPEN';
    let roomVolumeLiters: number | undefined;
    if (node?.roomId) {
      const room = await prisma.room.findUnique({ where: { id: node.roomId } });
      if (room) {
        profileKey = room.profile;
        roomVolumeLiters = room.width_ft * room.height_ft * room.ceiling_ft * 28.3168;
      }
    }

    const text = file.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) {
      return res.status(400).json({ success: false, message: 'CSV is empty' });
    }
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idx = (name: string) => headers.indexOf(name);
    const requiredCols = ['timestamp', 'pm25', 'co2', 'tvoc', 'temp', 'rh'];
    for (const c of requiredCols) {
      if (idx(c) === -1) {
        return res.status(400).json({ success: false, message: `missing column: ${c}` });
      }
    }

    let inserted = 0;
    let rejected = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const row: Record<string, unknown> = {
        timestamp: cols[idx('timestamp')]?.trim(),
        pm25: Number(cols[idx('pm25')]),
        co2: Number(cols[idx('co2')]),
        tvoc: Number(cols[idx('tvoc')]),
        temp_bme: Number(cols[idx('temp')]),
        rh_bme: Number(cols[idx('rh')]),
      };
      if (idx('pressure') !== -1) row.pressure = Number(cols[idx('pressure')]);

      const v = validateReading(row);
      if (!v.valid) {
        rejected++;
        if (errors.length < 5) errors.push(`row ${i}: ${v.reason}`);
        continue;
      }
      const ts = row.timestamp ? new Date(String(row.timestamp)) : new Date();
      if (isNaN(ts.getTime())) {
        rejected++;
        if (errors.length < 5) errors.push(`row ${i}: invalid timestamp`);
        continue;
      }

      const raw: RawReading = {
        pm1: Number(row.pm25) * 0.7,
        pm25: Number(row.pm25),
        pm10: Number(row.pm25) * 1.5,
        co2: Number(row.co2),
        tvoc: Number(row.tvoc),
        temp_bme: Number(row.temp_bme),
        rh_bme: Number(row.rh_bme),
        pressure: row.pressure != null ? Number(row.pressure) : undefined,
      };

      const processed = await runAlgorithmPipeline(nodeId, raw, profileKey, 15, roomVolumeLiters);

      await prisma.reading.create({
        data: {
          nodeId,
          timestamp: ts,
          pm1_raw: raw.pm1,
          pm25_raw: raw.pm25,
          pm10_raw: raw.pm10,
          co2_raw: raw.co2,
          tvoc_raw: raw.tvoc,
          temp_bme: raw.temp_bme,
          rh_bme: raw.rh_bme,
          pressure_hpa: raw.pressure ?? null,
        },
      });
      await prisma.processedData.create({
        data: {
          nodeId,
          timestamp: ts,
          pm25_filtered: processed.pm25_filtered,
          co2_filtered: processed.co2_filtered,
          voc_filtered: processed.voc_filtered,
          temp_filtered: processed.temp_filtered,
          rh_filtered: processed.rh_filtered,
          pm25_corrected: processed.pm25_corrected,
          crossValidOk: processed.crossValidOk,
          reliability_pm25: processed.reliability_pm25,
          reliability_co2:  processed.reliability_co2,
          reliability_voc:  processed.reliability_voc,
          deps_aqi: processed.deps_aqi,
          celi_score:   processed.celi_score,
          celi_weights: processed.celi_weights as unknown as Prisma.InputJsonValue,
          epa_aqi: processed.epa_aqi,
          profile_used: processed.profile_used,
          direct_burden:        processed.direct_burden,
          interaction_burden:   processed.interaction_burden,
          total_burden:         processed.total_burden,
          dominant_interaction: processed.dominant_interaction,
          interaction_details:  processed.interaction_details as unknown as Prisma.InputJsonValue,
          temporal_memory_pm:  processed.temporal_memory_pm,
          temporal_memory_co2: processed.temporal_memory_co2,
          temporal_memory_voc: processed.temporal_memory_voc,
          cognitive_burden:    processed.cognitive_burden,
          recovery_status:     processed.recovery_status,
          cpis_instantaneous:  processed.cpis_instantaneous,
          cpis: processed.cpis,
          ced_pm25: processed.ced_pm25,
          ced_co2: processed.ced_co2,
          thermal_pmv: processed.thermal_pmv ?? null,
          pm25_pred_30m: processed.pm25_pred_30m ?? null,
          co2_pred_30m: processed.co2_pred_30m ?? null,
          trend_slope: processed.trend_slope ?? null,
          event_type: processed.event_type ?? null,
          event_confidence: processed.event_confidence ?? null,
          anomaly_score: processed.anomaly_score ?? null,
          occupancy_est: processed.occupancy_est ?? null,
          ventilation_cmd: processed.ventilation_cmd ?? null,
          pid_output: processed.pid_output ?? null,
          who_pass: processed.who_pass ?? null,
          epa_pass: processed.epa_pass ?? null,
          bnaaqs_pass: processed.bnaaqs_pass ?? null,
          ashrae_pass: processed.ashrae_pass ?? null,
          well_pass: processed.well_pass ?? null,
          reset_pass: processed.reset_pass ?? null,
          alert_level: processed.alert_level,
          explanation_text: processed.explanation_text,
        },
      });
      inserted++;
    }

    logger.info({ nodeId, inserted, rejected }, 'CSV import complete');
    return res.json({ success: true, data: { inserted, rejected, errors } });
  } catch (err) {
    logger.error({ err }, 'CSV import failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
