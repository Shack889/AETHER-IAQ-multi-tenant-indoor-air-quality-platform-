/**
 * Report engine — assembles a report document into paper-grade HTML and renders
 * it to a PDF Buffer via headless Chromium (Puppeteer). Owns the shared
 * stylesheet, the standard report skeleton, and pagination/footer handling so
 * every report looks consistent and paginates cleanly (no clipped figures, no
 * text-over-text). `break-inside: avoid` keeps figures and tables whole.
 */
import type { Browser } from 'puppeteer';
import { logger } from '../utils/logger';
import { Provenance } from './provenance';
import { escapeXml } from './charts';

export interface ReportDocument {
  provenance: Provenance;
  /** e.g. "Air Quality Summary". */
  subtitle: string;
  modeLabel: string;
  modeSublabel: string;
  /** Executive summary, plain language (HTML allowed). */
  summary: string;
  /** Data scenario & environment rows. */
  scenario: Array<[string, string]>;
  /** Report body HTML. */
  body: string;
  notes?: string;
  references?: string[];
  /** When set, a prominent "limited / no data" banner replaces normal framing. */
  limitedData?: { headline: string; detail: string } | null;
}

const SHARED_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937; font-size: 12px; line-height: 1.5;
  }
  h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; color: #111827; margin: 0 0 6px; }
  h1 { font-size: 22px; }
  h2 { font-size: 15px; margin-top: 18px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
  h3 { font-size: 13px; margin-top: 12px; }
  .eyebrow { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b7280; }
  .mode-banner {
    margin: 10px 0 14px; padding: 8px 12px; border-radius: 6px;
    background: #f0f9ff; border: 1px solid #bae6fd;
  }
  .mode-banner .label { font-weight: 700; color: #075985; }
  .mode-banner .sub { font-size: 10.5px; color: #475569; }
  .prov-table, .data-table { width: 100%; border-collapse: collapse; }
  .prov-table td { padding: 2px 6px; font-size: 10.5px; vertical-align: top; }
  .prov-table td.k { color: #6b7280; width: 130px; }
  .prov-table td.v { color: #374151; }
  .scenario td { padding: 3px 6px; border-bottom: 1px solid #f1f5f9; }
  .scenario td.k { color: #6b7280; width: 220px; }
  .data-table th, .data-table td { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: right; font-size: 11px; }
  .data-table th { background: #f8fafc; text-align: right; }
  .data-table td:first-child, .data-table th:first-child { text-align: left; }
  .figure { margin: 12px 0; break-inside: avoid; page-break-inside: avoid; }
  .figure figcaption { font-size: 10px; color: #6b7280; margin-top: 4px; }
  table, .figure, .keep { break-inside: avoid; page-break-inside: avoid; }
  .limited {
    margin: 16px 0; padding: 16px; border-radius: 8px;
    background: #fffbeb; border: 1px solid #fcd34d;
  }
  .limited .headline { font-weight: 700; color: #92400e; font-size: 14px; }
  .limited .detail { color: #78350f; margin-top: 6px; }
  .refs { font-size: 10px; color: #4b5563; }
  .refs li { margin-bottom: 4px; }
  .summary { font-size: 12.5px; }
  .muted { color: #6b7280; }
`;

function provenanceHeader(p: Provenance): string {
  const row = (k: string, v: string) => `<tr><td class="k">${escapeXml(k)}</td><td class="v">${escapeXml(v)}</td></tr>`;
  const fmt = (d: Date) =>
    d.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' (+06:00)';
  return `<table class="prov-table">
    ${row('Application', `${p.appName} v${p.appVersion} · commit ${p.commitSha}`)}
    ${row('Node(s)', p.nodeIds.length ? p.nodeIds.join(', ') : '—')}
    ${row('Room', p.roomName ?? '—')}
    ${row('Range queried', `${fmt(p.from)} → ${fmt(p.to)}`)}
    ${row('Generated', fmt(p.generatedAt))}
    ${row('Data source', p.dataSource)}
  </table>`;
}

/** Build the full standalone HTML document for a report. */
export function renderDocument(doc: ReportDocument): string {
  const p = doc.provenance;
  const scenarioRows = doc.scenario
    .map(([k, v]) => `<tr><td class="k">${escapeXml(k)}</td><td>${v}</td></tr>`)
    .join('');
  const refs = (doc.references ?? []).length
    ? `<h2>References</h2><ul class="refs">${doc.references!.map((r) => `<li>${escapeXml(r)}</li>`).join('')}</ul>`
    : '';
  const limited = doc.limitedData
    ? `<div class="limited keep"><div class="headline">${escapeXml(doc.limitedData.headline)}</div><div class="detail">${escapeXml(doc.limitedData.detail)}</div></div>`
    : '';
  const bodyOrNotes = doc.limitedData ? '' : `${doc.body}${doc.notes ? `<h2>Notes</h2>${doc.notes}` : ''}${refs}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${SHARED_CSS}</style></head>
<body>
  <div class="eyebrow">${escapeXml(p.appName)} · Consumer Report</div>
  <h1>${escapeXml(p.reportTitle)}</h1>
  <div class="muted">${escapeXml(doc.subtitle)}</div>
  <div class="mode-banner keep">
    <div class="label">Report mode: ${escapeXml(doc.modeLabel)}</div>
    <div class="sub">${escapeXml(doc.modeSublabel)}</div>
  </div>
  ${provenanceHeader(p)}
  ${limited}
  <h2>Summary</h2>
  <div class="summary">${doc.summary}</div>
  <h2>Data scenario &amp; environment</h2>
  <table class="scenario">${scenarioRows}</table>
  ${bodyOrNotes}
</body></html>`;
}

// ── Chromium lifecycle ─────────────────────────────────────────────────────

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise;
    if (b.connected) return b;
    browserPromise = null;
  }
  // Lazy require so the server still boots if Chromium isn't present (the route
  // surfaces a clear error instead of crashing the process at import time).
  const puppeteer = (await import('puppeteer')).default;
  browserPromise = puppeteer.launch({
    headless: true,
    executablePath: process.env['PUPPETEER_EXECUTABLE_PATH'] || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  return browserPromise;
}

function footerTemplate(p: Provenance): string {
  return `<div style="font-size:7px; color:#6b7280; width:100%; padding:0 14mm; font-family:sans-serif; line-height:1.3;">
    <div style="border-top:0.5px solid #d1d5db; padding-top:3px; display:flex; justify-content:space-between;">
      <span style="max-width:88%; overflow:hidden;">${p.footerLine.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  </div>`;
}

/** Render a report document to a PDF Buffer. */
export async function generatePdf(doc: ReportDocument): Promise<Buffer> {
  const html = renderDocument(doc);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(doc.provenance),
      margin: { top: '16mm', bottom: '20mm', left: '14mm', right: '14mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch((e) => logger.warn({ err: e }, 'report page close failed'));
  }
}
