/**
 * Compliance (consumer) report — how often the air stayed within vs exceeded the
 * cited WHO/EPA thresholds over the period, in plain language, per pollutant.
 * Each comparison names its standard and citation. Bangladesh DoE is shown but
 * marked pending until a confirmed gazette value is supplied. Real data only.
 */
import {
  MODE_LABEL, MODE_SUBLABEL, ReportMode, REFERENCES, VOC_NOTE,
} from './constants';
import { getComplianceStats, PollutantCompliance, RoomScope } from './dataAccess';
import { buildProvenance } from './provenance';
import { ReportDocument } from './reportEngine';
import { escapeXml, stackedBandBarSVG } from './charts';
import { siteMetadataRows } from './airQualitySummary';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'room';
}
const fmt = (n: number | null, u = '') => (n == null ? '—' : `${Math.round(n * 10) / 10}${u}`);

function exceedanceTable(p: PollutantCompliance): string {
  if (p.exceedances.length === 0) {
    return `<p class="muted">No regulatory health threshold applies to ${escapeXml(p.label)} — see note below.</p>`;
  }
  const rows = p.exceedances.map((e) => {
    if (e.note) {
      return `<tr><td>${escapeXml(e.standard)}</td><td colspan="3" class="muted" style="text-align:left">${escapeXml(e.note)}</td></tr>`;
    }
    return `<tr><td>${escapeXml(e.standard)}</td><td>${e.threshold} ${escapeXml(e.unit)}</td><td>${e.withinPct}%</td><td>${e.exceedPct}%</td></tr>`;
  }).join('');
  return `<table class="data-table keep"><thead><tr><th>Standard</th><th>Threshold</th><th>% time within</th><th>% time exceeding</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Plain-language pass/attention sentence from the primary exceedance. */
function characterise(p: PollutantCompliance): string {
  const primary = p.exceedances.find((e) => !e.note);
  if (!primary) {
    return `${p.label}: no regulatory health limit applies; reported as a relative comfort indicator only.`;
  }
  if (primary.exceedPct === 0) {
    return `${p.label}: within the ${primary.standard} for the entire period (mean ${fmt(p.mean)} ${p.unit}). No attention needed.`;
  }
  return `${p.label}: exceeded the ${primary.standard} ${primary.exceedPct}% of the period (mean ${fmt(p.mean)} ${p.unit}). Attention suggested.`;
}

function section(p: PollutantCompliance): string {
  const bar = `<figure class="figure">${stackedBandBarSVG({ title: `${p.label} — % of the period in each band`, segments: p.bands.map((b) => ({ label: b.name, pct: b.pct, color: b.color })) })}<figcaption>Share of readings (≈ time) in each band.</figcaption></figure>`;
  return `<h3>${escapeXml(p.label)}</h3><p class="summary">${escapeXml(characterise(p))}</p>${exceedanceTable(p)}${bar}`;
}

export async function buildComplianceDoc(params: {
  scope: RoomScope; from: Date; to: Date; mode: ReportMode;
}): Promise<{ doc: ReportDocument; filename: string }> {
  const { scope, from, to, mode } = params;
  const c = await getComplianceStats({ nodeIds: scope.nodeIds, from, to });

  const provenance = buildProvenance({
    reportTitle: `Compliance — ${scope.roomName ?? 'Unassigned room'}`,
    nodeIds: scope.nodeIds, roomId: scope.roomId, roomName: scope.roomName,
    from, to, mode, tables: ['ProcessedData (simulated=false)'],
  });

  const scenario: Array<[string, string]> = [
    ['Room', scope.roomName ?? '—'],
    ...siteMetadataRows(scope.room),
    ['Real hardware readings', c.totalReadings.toLocaleString()],
    ['Report mode', MODE_LABEL[mode]],
  ];

  const empty = c.totalReadings === 0;
  const body = empty ? '' :
    `<p class="muted">Each comparison below names the standard it uses. Percentages are the share of real readings (≈ time) within or exceeding that threshold.</p>` +
    section(c.pm25) + section(c.co2) + section(c.voc) +
    `<h2>Notes</h2><p class="muted">${escapeXml(VOC_NOTE)}</p><p class="muted">CO₂ thresholds are indoor-ventilation guidance (ASHRAE-style), not a regulated health limit. The Bangladesh DoE row is pending a confirmed gazette value and is intentionally left blank rather than printed with an unverified number.</p>`;

  const doc: ReportDocument = {
    provenance,
    subtitle: 'Compliance — how often the air stayed within recognised guidelines.',
    modeLabel: MODE_LABEL[mode], modeSublabel: MODE_SUBLABEL[mode],
    summary: empty
      ? 'No hardware-collected readings were found in the selected window, so no compliance comparison can be made.'
      : `How often the air in ${escapeXml(scope.roomName ?? 'this room')} stayed within published WHO and US EPA guideline thresholds over the period, per pollutant.`,
    scenario,
    body,
    references: empty ? undefined : [REFERENCES.who2021, REFERENCES.epa2024],
    limitedData: empty
      ? { headline: 'No hardware-collected data in this window', detail: `There are no real (simulated = false) readings for ${scope.roomName ?? 'this room'} in the selected window${mode === 'research' ? ' within the research dataset of record (from 2026-06-14)' : ''}. No data has been fabricated.` }
      : null,
  };
  return { doc, filename: `aether-compliance-${slug(scope.roomName ?? 'room')}-${new Date().toISOString().slice(0, 10)}.pdf` };
}
