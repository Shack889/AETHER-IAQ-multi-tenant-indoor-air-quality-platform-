/**
 * Chromium render proof — self-contained (no DB). Builds a small report document
 * and renders it to a real PDF via the engine, confirming headless Chromium
 * launches and produces a valid multi-section PDF. Run this locally after the
 * Chromium system libs are installed, and on Railway to confirm the deploy image
 * can render (Brief #5 §TECH "verify Chromium launches before building the rest").
 *
 *   npx tsx scripts/report-render.ts   →   writes /tmp/aether-report-smoke.pdf
 */
import * as fs from 'fs';
import { buildProvenance } from '../src/reports/provenance';
import { generatePdf, ReportDocument } from '../src/reports/reportEngine';
import { lineChartSVG } from '../src/reports/charts';
import { MODE_LABEL, MODE_SUBLABEL } from '../src/reports/constants';

async function main() {
  const from = new Date('2026-06-18T08:00:00+06:00');
  const to = new Date('2026-06-18T10:00:00+06:00');
  const provenance = buildProvenance({
    reportTitle: 'Air Quality Summary — Render Smoke Test',
    nodeIds: ['AETHER-N01'], roomId: 'demo', roomName: 'Demo Room',
    from, to, mode: 'showcase', tables: ['ProcessedData (simulated=false)'],
  });
  const series = Array.from({ length: 60 }, (_, i) => ({ t: from.getTime() + i * 120000, v: 12 + 8 * Math.sin(i / 5) }));
  const doc: ReportDocument = {
    provenance,
    subtitle: 'Engine render verification.',
    modeLabel: MODE_LABEL.showcase, modeSublabel: MODE_SUBLABEL.showcase,
    summary: 'This is a render smoke test confirming headless Chromium produces a clean, paginated PDF with a provenance footer on every page.',
    scenario: [['Room', 'Demo Room'], ['Readings', '60'], ['Mode', MODE_LABEL.showcase]],
    body: `<h2>Trend</h2><figure class="figure">${lineChartSVG({ points: series, title: 'PM₂.₅', unit: 'µg/m³', color: '#b91c1c', thresholds: [{ value: 15, label: 'WHO 24h 15', color: '#92400e' }] })}<figcaption>Render test chart.</figcaption></figure>`.repeat(6),
    references: ['World Health Organization (2021). WHO global air quality guidelines.'],
  };

  console.log('Launching Chromium and rendering…');
  const pdf = await generatePdf(doc);
  const out = '/tmp/aether-report-smoke.pdf';
  fs.writeFileSync(out, pdf);
  const ok = pdf.subarray(0, 5).toString() === '%PDF-';
  console.log(`${ok ? '✓' : '✗'} wrote ${out} (${pdf.length.toLocaleString()} bytes), header=${pdf.subarray(0, 5).toString()}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('✗ render failed:', e.message); process.exit(1); });
