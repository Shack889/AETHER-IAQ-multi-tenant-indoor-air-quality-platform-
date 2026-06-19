/**
 * Air Quality Summary (History) — the simplest consumer report, built first to
 * prove the engine end to end. Per-pollutant mean/min/max/median/p95, time-series
 * charts, a plain-language characterisation, and data completeness — real data
 * only. Sparse/empty windows render an honest limited-data state, never fabricated
 * numbers.
 */
import {
  bandFor, CO2_BANDS, EPA_PM25_BANDS, MODE_LABEL, MODE_SUBLABEL, ReportMode,
  REFERENCES, VOC_NOTE, WHO,
} from './constants';
import { AirQualitySummary, getAirQualitySummary, RoomScope } from './dataAccess';
import { buildProvenance } from './provenance';
import { ReportDocument } from './reportEngine';
import { barChartSVG, escapeXml, lineChartSVG } from './charts';

const M3_PER_FT3 = 0.0283168;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'room';
}

function fmt(n: number | null, unit = ''): string {
  if (n == null) return '—';
  return `${Math.round(n * 10) / 10}${unit}`;
}

/** Plain-language one-paragraph characterisation from the period means. */
function characterise(s: AirQualitySummary): string {
  const pm = s.pollutants.find((p) => p.key === 'pm25')?.mean ?? null;
  const co2 = s.pollutants.find((p) => p.key === 'co2')?.mean ?? null;
  const parts: string[] = [];
  if (pm != null) {
    const band = bandFor(EPA_PM25_BANDS, pm);
    const vsWho = pm <= WHO.pm25_24h
      ? `at or below the WHO 24-hour guideline of ${WHO.pm25_24h} µg/m³`
      : `above the WHO 24-hour guideline of ${WHO.pm25_24h} µg/m³`;
    parts.push(`Average fine particles (PM₂.₅) were ${fmt(pm, ' µg/m³')}, ${vsWho} — in the EPA "${band.name}" range.`);
  }
  if (co2 != null) {
    const band = bandFor(CO2_BANDS, co2);
    parts.push(`Average CO₂ was ${fmt(co2, ' ppm')}, indicating ${band.name.toLowerCase()} ventilation.`);
  }
  parts.push(`Figures are computed from ${s.totalReadings.toLocaleString()} real hardware readings (${s.completenessPct}% of the expected 15-second cadence for this window).`);
  return parts.join(' ');
}

function statsTable(s: AirQualitySummary): string {
  const rows = s.pollutants.map((p) =>
    `<tr><td>${escapeXml(p.label)} <span class="muted">(${escapeXml(p.unit)})</span></td>` +
    `<td>${fmt(p.mean)}</td><td>${fmt(p.median)}</td><td>${fmt(p.p95)}</td>` +
    `<td>${fmt(p.min)}</td><td>${fmt(p.max)}</td></tr>`,
  ).join('');
  return `<table class="data-table keep">
    <thead><tr><th>Pollutant</th><th>Mean</th><th>Median</th><th>P95</th><th>Min</th><th>Max</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function charts(s: AirQualitySummary): string {
  const pick = (key: keyof typeof s.series[number]) => s.series.map((r) => ({ t: r.t, v: r[key] as number }));
  const fig = (svg: string, caption: string) =>
    `<figure class="figure">${svg}<figcaption>${escapeXml(caption)}</figcaption></figure>`;

  const pm = bandFor(EPA_PM25_BANDS, s.pollutants.find((p) => p.key === 'pm25')?.mean ?? 0);
  const co2Mean = s.pollutants.find((p) => p.key === 'co2')?.mean ?? 0;

  return [
    fig(lineChartSVG({
      points: pick('pm25'), title: 'PM₂.₅ over the period', unit: 'µg/m³', color: '#b91c1c',
      thresholds: [{ value: WHO.pm25_24h, label: `WHO 24h ${WHO.pm25_24h}`, color: '#92400e' }],
    }), 'PM₂.₅ fine particles. Dashed line: WHO 2021 24-hour guideline.'),
    fig(lineChartSVG({
      points: pick('co2'), title: 'CO₂ over the period', unit: 'ppm', color: '#0e7490',
      thresholds: [{ value: 1000, label: 'vent. 1000', color: '#b45309' }],
    }), 'CO₂ as a ventilation indicator (not a health limit). Dashed line: 1000 ppm.'),
    fig(lineChartSVG({ points: pick('voc'), title: 'VOC Index over the period', unit: 'index', color: '#7c3aed' }),
      'VOC Index (Sensirion SGP40, dimensionless, baseline ≈ 100).'),
    fig(lineChartSVG({ points: pick('temp'), title: 'Temperature', unit: '°C', color: '#ca8a04' }),
      'Air temperature over the period.'),
    fig(lineChartSVG({ points: pick('rh'), title: 'Relative humidity', unit: '%', color: '#2563eb' }),
      'Relative humidity over the period.'),
    fig(barChartSVG({
      title: 'Mean PM₂.₅ vs WHO guideline', unit: 'µg/m³',
      items: [
        { label: 'Measured mean', value: s.pollutants.find((p) => p.key === 'pm25')?.mean ?? 0, color: pm.color },
        { label: `WHO 24h guideline`, value: WHO.pm25_24h, color: '#92400e' },
      ],
    }), `Measured mean PM₂.₅ against the WHO 24-hour guideline. CO₂ period mean: ${fmt(co2Mean, ' ppm')}.`),
  ].join('');
}

export function siteMetadataRows(room: RoomScope['room']): Array<[string, string]> {
  if (!room) return [];
  const rows: Array<[string, string]> = [];
  if (room.siteType) rows.push(['Site type', room.siteType]);
  if (room.locationLabel) rows.push(['Location', room.locationLabel]);
  const ft3 = room.width_ft * room.height_ft * room.ceiling_ft;
  rows.push(['Room volume', `${Math.round(ft3 * M3_PER_FT3)} m³ (${Math.round(ft3)} ft³)`]);
  if (room.ventilationType) rows.push(['Ventilation', room.ventilationType + (room.hasAC ? ', has AC' : '')]);
  if (room.occupancyMin != null || room.occupancyMax != null) {
    rows.push(['Occupancy range', `${room.occupancyMin ?? '?'}–${room.occupancyMax ?? '?'} people`]);
  }
  if (room.climateDescriptor) rows.push(['Climate', room.climateDescriptor]);
  if (room.mountingNote) rows.push(['Sensor mounting', room.mountingNote]);
  return rows;
}

export async function buildAirQualitySummaryDoc(params: {
  scope: RoomScope;
  from: Date;
  to: Date;
  mode: ReportMode;
}): Promise<{ doc: ReportDocument; filename: string }> {
  const { scope, from, to, mode } = params;
  const s = await getAirQualitySummary({ nodeIds: scope.nodeIds, from, to });

  const provenance = buildProvenance({
    reportTitle: `Air Quality Summary — ${scope.roomName ?? 'Unassigned room'}`,
    nodeIds: scope.nodeIds,
    roomId: scope.roomId,
    roomName: scope.roomName,
    from, to, mode,
    tables: ['ProcessedData (simulated=false)'],
  });

  const scenario: Array<[string, string]> = [
    ['Room', scope.roomName ?? '—'],
    ...siteMetadataRows(scope.room),
    ['Real hardware readings', s.totalReadings.toLocaleString()],
    ['Data completeness', `${s.completenessPct}% of expected 15-second cadence`],
    ['Report mode', MODE_LABEL[mode]],
  ];

  const empty = s.totalReadings === 0;
  const doc: ReportDocument = {
    provenance,
    subtitle: 'Air Quality Summary — what the air was like, in plain terms.',
    modeLabel: MODE_LABEL[mode],
    modeSublabel: MODE_SUBLABEL[mode],
    summary: empty
      ? 'No hardware-collected readings were found in the selected window for this room, so no air-quality figures can be reported.'
      : characterise(s),
    scenario,
    body: empty ? '' : `<h2>Per-pollutant summary</h2>${statsTable(s)}<h2>Trends over the period</h2>${charts(s)}`,
    notes: empty ? undefined : `<p class="muted">${escapeXml(VOC_NOTE)}</p><p class="muted">All figures use real hardware data only (simulated = false). CO₂ is reported as a ventilation/indoor-air indicator, not a regulated health threshold.</p>`,
    references: empty ? undefined : [REFERENCES.who2021, REFERENCES.epa2024],
    limitedData: empty
      ? {
          headline: 'No hardware-collected data in this window',
          detail: `There are no real (simulated = false) readings for ${scope.roomName ?? 'this room'} between the selected dates${mode === 'research' ? ' within the research dataset of record (from 2026-06-14)' : ''}. Try a wider range, a different room, or Showcase mode. No data has been fabricated or interpolated.`,
        }
      : null,
  };

  const filename = `aether-air-quality-summary-${slug(scope.roomName ?? 'room')}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { doc, filename };
}
