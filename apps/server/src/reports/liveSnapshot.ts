/**
 * Live Snapshot (consumer) report — the current air at a glance plus the recent
 * window, in plain words. Current values come from the latest real reading; the
 * recent window (last ~2 h up to the snapshot) gives short trend charts. Real
 * data only; if there's no recent real reading it says so ("waiting for live
 * readings") rather than inventing a snapshot.
 */
import { MODE_LABEL, MODE_SUBLABEL, ReportMode, REFERENCES, VOC_NOTE } from './constants';
import { getAirQualitySummary, getLatestReal, RoomScope } from './dataAccess';
import { buildProvenance } from './provenance';
import { ReportDocument } from './reportEngine';
import { escapeXml, lineChartSVG } from './charts';
import { allGuidance, allWithinGuidelines } from './guidance';
import { siteMetadataRows } from './airQualitySummary';

const RECENT_MS = 2 * 3600 * 1000; // recent window length
function slug(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'room'; }
const fmt = (n: number | null, u = '') => (n == null ? '—' : `${Math.round(n * 10) / 10}${u}`);

function freshness(latest: Date, now: Date): string {
  const min = Math.round((now.getTime() - latest.getTime()) / 60000);
  if (min <= 2) return 'live (updated just now)';
  if (min < 60) return `most recent reading, ${min} min ago`;
  const h = Math.round(min / 60);
  return `most recent reading, ~${h} h ago (no fresher hardware data)`;
}

export async function buildLiveSnapshotDoc(params: {
  scope: RoomScope; from: Date; to: Date; mode: ReportMode;
}): Promise<{ doc: ReportDocument; filename: string }> {
  const { scope, from, to, mode } = params;
  // Snapshot at `to` (default now); recent window is the last ~2 h, but never
  // earlier than the (already mode-clamped) `from`, so research mode stays honest.
  const recentFrom = new Date(Math.max(from.getTime(), to.getTime() - RECENT_MS));
  const [latest, recent] = await Promise.all([
    getLatestReal(scope.nodeIds, to),
    getAirQualitySummary({ nodeIds: scope.nodeIds, from: recentFrom, to }),
  ]);

  const provenance = buildProvenance({
    reportTitle: `Live Snapshot — ${scope.roomName ?? 'Unassigned room'}`,
    nodeIds: scope.nodeIds, roomId: scope.roomId, roomName: scope.roomName,
    from: recentFrom, to, mode, tables: ['ProcessedData (simulated=false)'],
  });

  const scenario: Array<[string, string]> = [
    ['Room', scope.roomName ?? '—'],
    ...siteMetadataRows(scope.room),
    ['Snapshot data', latest ? freshness(latest.timestamp, provenance.generatedAt) : 'no real reading available'],
    ['Recent window', `last ${Math.round((to.getTime() - recentFrom.getTime()) / 60000)} min (${recent.totalReadings.toLocaleString()} real readings)`],
    ['Report mode', MODE_LABEL[mode]],
  ];

  const empty = latest == null;
  let body = '';
  if (!empty) {
    const gs = allGuidance({ pm25: latest.pm25, co2: latest.co2, voc: latest.voc });
    const cards = gs.map((x) =>
      `<div class="keep" style="display:inline-block;width:31%;margin:0 1% 8px 0;vertical-align:top;padding:8px 10px;border:1px solid #e5e7eb;border-top:3px solid ${x.color};border-radius:4px;">` +
      `<div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">${escapeXml(x.label)}</div>` +
      `<div style="font-size:18px;font-weight:700;color:#111827;">${fmt(x.value)} <span style="font-size:10px;font-weight:400;color:#6b7280;">${escapeXml(x.unit)}</span></div>` +
      `<div style="font-size:11px;font-weight:600;color:${x.color};">${escapeXml(x.tier)}</div>` +
      `<div style="font-size:10px;color:#374151;margin-top:3px;">${escapeXml(x.action)}</div></div>`,
    ).join('');

    const overall = allWithinGuidelines(gs)
      ? 'Air quality is within recommended guideline ranges right now.'
      : 'Some readings are above their recommended ranges right now — see the cards and the basic actions below.';

    const pick = (key: 'pm25' | 'co2') => recent.series.map((r) => ({ t: r.t, v: r[key] }));
    const charts = recent.series.length > 1
      ? `<h2>Recent trend (last ${Math.round((to.getTime() - recentFrom.getTime()) / 60000)} min)</h2>` +
        `<figure class="figure">${lineChartSVG({ points: pick('pm25'), title: 'PM₂.₅', unit: 'µg/m³', color: '#b91c1c', thresholds: [{ value: 15, label: 'WHO 24h 15', color: '#92400e' }] })}<figcaption>PM₂.₅ over the recent window.</figcaption></figure>` +
        `<figure class="figure">${lineChartSVG({ points: pick('co2'), title: 'CO₂', unit: 'ppm', color: '#0e7490', thresholds: [{ value: 1000, label: 'vent. 1000', color: '#b45309' }] })}<figcaption>CO₂ (ventilation indicator) over the recent window.</figcaption></figure>`
      : '<p class="muted">Not enough recent readings to draw a trend yet.</p>';

    body =
      `<h2>Right now</h2><p class="summary">${escapeXml(overall)}</p><div>${cards}</div>` +
      charts +
      `<p class="muted" style="margin-top:8px;">${escapeXml(VOC_NOTE)} CO₂ is a ventilation indicator, not a health limit.</p>`;
  }

  const doc: ReportDocument = {
    provenance,
    subtitle: 'Live Snapshot — the air right now, in plain terms.',
    modeLabel: MODE_LABEL[mode], modeSublabel: MODE_SUBLABEL[mode],
    summary: empty
      ? 'No real hardware reading is available for this room yet, so there is nothing to snapshot. Waiting for live readings.'
      : `A plain-language snapshot of the current air in ${escapeXml(scope.roomName ?? 'this room')}, with the last couple of hours for context.`,
    scenario,
    body,
    references: empty ? undefined : [REFERENCES.who2021, REFERENCES.epa2024],
    limitedData: empty
      ? { headline: 'Waiting for live readings', detail: `No real (simulated = false) reading is available for ${scope.roomName ?? 'this room'}${mode === 'research' ? ' within the research dataset of record (from 2026-06-14)' : ''}. Nothing has been fabricated.` }
      : null,
  };
  return { doc, filename: `aether-live-snapshot-${slug(scope.roomName ?? 'room')}-${new Date().toISOString().slice(0, 10)}.pdf` };
}
