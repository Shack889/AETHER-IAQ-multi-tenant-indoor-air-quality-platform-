/**
 * Health Impact (consumer) report — what the period's air means for general
 * respiratory comfort, against cited WHO/EPA thresholds, with the exposure-
 * severity timeline and basic environmental guidance. Environmental information
 * only, never medical advice; carries the mandatory §Health-Safety disclaimer
 * and the unmeasured-pollutants honesty note. Real data only.
 */
import {
  bandFor, EPA_PM25_BANDS, HEALTH_DISCLAIMER, MODE_LABEL, MODE_SUBLABEL, ReportMode,
  REFERENCES, UNMEASURED_POLLUTANTS, VOC_NOTE, WHO,
} from './constants';
import { getAirQualitySummary, getComplianceStats, RoomScope } from './dataAccess';
import { buildProvenance } from './provenance';
import { ReportDocument } from './reportEngine';
import { barChartSVG, escapeXml, stackedBandBarSVG } from './charts';
import { allGuidance, atRiskNote } from './guidance';
import { siteMetadataRows } from './airQualitySummary';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'room';
}
const fmt = (n: number | null, u = '') => (n == null ? '—' : `${Math.round(n * 10) / 10}${u}`);

export async function buildHealthImpactDoc(params: {
  scope: RoomScope; from: Date; to: Date; mode: ReportMode;
}): Promise<{ doc: ReportDocument; filename: string }> {
  const { scope, from, to, mode } = params;
  const [c, s] = await Promise.all([
    getComplianceStats({ nodeIds: scope.nodeIds, from, to }),
    getAirQualitySummary({ nodeIds: scope.nodeIds, from, to }),
  ]);

  const provenance = buildProvenance({
    reportTitle: `Health Impact — ${scope.roomName ?? 'Unassigned room'}`,
    nodeIds: scope.nodeIds, roomId: scope.roomId, roomName: scope.roomName,
    from, to, mode, tables: ['ProcessedData (simulated=false)'],
  });

  const scenario: Array<[string, string]> = [
    ['Room', scope.roomName ?? '—'],
    ...siteMetadataRows(scope.room),
    ['Real hardware readings', c.totalReadings.toLocaleString()],
    ['Data completeness', `${s.completenessPct}% of expected 15-second cadence`],
    ['Report mode', MODE_LABEL[mode]],
  ];

  const empty = c.totalReadings === 0;
  const disclaimerBlock = `<div class="keep" style="margin:12px 0;padding:10px 12px;border:1px solid #fca5a5;background:#fef2f2;border-radius:6px;font-size:11px;color:#7f1d1d;"><strong>Important — not medical advice.</strong> ${escapeXml(HEALTH_DISCLAIMER)}</div>`;

  let body = '';
  if (!empty) {
    const pmBand = bandFor(EPA_PM25_BANDS, c.pm25.mean ?? 0);

    // Threshold comparison table (measured vs cited guideline).
    const thRows = [
      `<tr><td>PM₂.₅ (µg/m³)</td><td>${fmt(c.pm25.mean)}</td><td>WHO 24h ${WHO.pm25_24h}</td><td>${(c.pm25.mean ?? 0) > WHO.pm25_24h ? 'Exceeds' : 'Within'}</td><td>WHO 2021</td></tr>`,
      `<tr><td>PM₂.₅ (µg/m³)</td><td>${fmt(c.pm25.mean)}</td><td>EPA 24h NAAQS 35</td><td>${(c.pm25.mean ?? 0) > 35 ? 'Exceeds' : 'Within'}</td><td>US EPA 2024</td></tr>`,
      `<tr><td>CO₂ (ppm)</td><td>${fmt(c.co2.mean)}</td><td>&lt;1000 (ventilation)</td><td>${(c.co2.mean ?? 0) > 1000 ? 'Inadequate vent.' : 'Adequate vent.'}</td><td>ASHRAE-style*</td></tr>`,
      `<tr><td>VOC Index</td><td>${fmt(c.voc.mean)}</td><td>no health limit</td><td>—</td><td>SGP40 index</td></tr>`,
    ].join('');
    const thresholdTable = `<table class="data-table keep"><thead><tr><th>Pollutant</th><th>Period mean</th><th>Guideline</th><th>Status</th><th>Source</th></tr></thead><tbody>${thRows}</tbody></table>`;

    // Exposure-severity timeline (% time in each EPA PM2.5 band).
    const bandBar = `<figure class="figure">${stackedBandBarSVG({ title: 'PM₂.₅ — % of the period in each EPA AQI band', segments: c.pm25.bands.map((b) => ({ label: b.name, pct: b.pct, color: b.color })) })}<figcaption>Share of readings (≈ time) in each EPA PM₂.₅ category over the period.</figcaption></figure>`;
    const meanVsWho = `<figure class="figure">${barChartSVG({ title: 'Mean PM₂.₅ vs WHO guideline', unit: 'µg/m³', items: [{ label: 'Measured mean', value: c.pm25.mean ?? 0, color: pmBand.color }, { label: 'WHO 24h guideline', value: WHO.pm25_24h, color: '#92400e' }] })}<figcaption>Period mean PM₂.₅ against the WHO 24-hour guideline.</figcaption></figure>`;

    // Environmental guidance + at-risk context.
    const gs = allGuidance({ pm25: c.pm25.mean, co2: c.co2.mean, voc: c.voc.mean });
    const guidanceCards = gs.map((x) =>
      `<div class="keep" style="margin:6px 0;padding:8px 10px;border-left:3px solid ${x.color};background:#f8fafc;">` +
      `<strong>${escapeXml(x.label)}: ${escapeXml(x.tier)}</strong> <span class="muted">(${fmt(x.value)} ${escapeXml(x.unit)})</span><br>` +
      `${escapeXml(x.meaning)} <em>${escapeXml(x.action)}</em></div>`,
    ).join('');

    body =
      disclaimerBlock +
      `<h2>How the air compared to guidelines</h2><p class="summary">Over this period the air was in the EPA "<strong>${escapeXml(pmBand.name)}</strong>" range for fine particles.</p>${thresholdTable}` +
      `<h2>Exposure-severity timeline</h2>${bandBar}${meanVsWho}` +
      `<h2>What you can do (environmental guidance)</h2>${guidanceCards}` +
      `<p class="muted" style="margin-top:8px;">${escapeXml(atRiskNote(gs))}</p>` +
      `<h2>What this does not cover</h2><p class="muted">${escapeXml(UNMEASURED_POLLUTANTS)} ${escapeXml(VOC_NOTE)}</p>` +
      `<p class="muted">*CO₂ is an indoor ventilation indicator, not a regulated health threshold.</p>`;
  }

  const doc: ReportDocument = {
    provenance,
    subtitle: 'Health Impact — what the air meant, in plain terms (environmental, not medical).',
    modeLabel: MODE_LABEL[mode], modeSublabel: MODE_SUBLABEL[mode],
    summary: empty
      ? 'No hardware-collected readings were found in the selected window, so no health-impact assessment can be made.'
      : `This is a plain-language, environmental summary of the air in ${escapeXml(scope.roomName ?? 'this room')} over the selected period, compared against published WHO and US EPA guidelines. It is not medical advice.`,
    scenario,
    body,
    references: empty ? undefined : [REFERENCES.who2021, REFERENCES.epa2024],
    limitedData: empty
      ? { headline: 'No hardware-collected data in this window', detail: `There are no real (simulated = false) readings for ${scope.roomName ?? 'this room'} in the selected window${mode === 'research' ? ' within the research dataset of record (from 2026-06-14)' : ''}. No data has been fabricated.` }
      : null,
  };
  return { doc, filename: `aether-health-impact-${slug(scope.roomName ?? 'room')}-${new Date().toISOString().slice(0, 10)}.pdf` };
}
