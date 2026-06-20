/**
 * Deterministic SVG chart helpers. Returns SVG strings injected straight into
 * the report HTML — no client JS, no canvas, so Chromium renders them crisply
 * and identically every time.
 */

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

const fmtNum = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString());

export interface LineChartOptions {
  points: Array<{ t: number; v: number }>;
  title: string;
  unit: string;
  color?: string;
  width?: number;
  height?: number;
  thresholds?: Array<{ value: number; label: string; color: string }>;
}

/** A single time-series line chart with optional horizontal threshold lines. */
export function lineChartSVG(opts: LineChartOptions): string {
  const W = opts.width ?? 720;
  const H = opts.height ?? 220;
  const color = opts.color ?? '#0e7490';
  const m = { top: 28, right: 16, bottom: 28, left: 48 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const pts = opts.points;
  if (pts.length === 0) {
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#888">No data</text></svg>`;
  }

  const ts = pts.map((p) => p.t);
  const vs = pts.map((p) => p.v);
  const thr = opts.thresholds ?? [];
  const tMin = Math.min(...ts), tMax = Math.max(...ts);
  let vMin = Math.min(...vs, ...thr.map((t) => t.value));
  let vMax = Math.max(...vs, ...thr.map((t) => t.value));
  if (vMin === vMax) { vMin -= 1; vMax += 1; }
  const pad = (vMax - vMin) * 0.08;
  vMin -= pad; vMax += pad;

  const x = (t: number) => m.left + (tMax === tMin ? iw / 2 : ((t - tMin) / (tMax - tMin)) * iw);
  const y = (v: number) => m.top + ih - ((v - vMin) / (vMax - vMin)) * ih;

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

  const gridY = [vMin, (vMin + vMax) / 2, vMax]
    .map((v) => `<line x1="${m.left}" y1="${y(v).toFixed(1)}" x2="${m.left + iw}" y2="${y(v).toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>` +
      `<text x="${m.left - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif">${fmtNum(v)}</text>`)
    .join('');

  const thrLines = thr.map((t) =>
    `<line x1="${m.left}" y1="${y(t.value).toFixed(1)}" x2="${m.left + iw}" y2="${y(t.value).toFixed(1)}" stroke="${t.color}" stroke-width="1.2" stroke-dasharray="4 3"/>` +
    `<text x="${m.left + iw}" y="${(y(t.value) - 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${t.color}" font-family="sans-serif">${escapeXml(t.label)}</text>`,
  ).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">
  <text x="${m.left}" y="16" font-size="12" font-weight="600" fill="#111827">${escapeXml(opts.title)} <tspan fill="#6b7280" font-weight="400">(${escapeXml(opts.unit)})</tspan></text>
  ${gridY}
  ${thrLines}
  <path d="${path}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/>
  <text x="${m.left}" y="${H - 8}" font-size="10" fill="#6b7280">${escapeXml(fmtTime(tMin))}</text>
  <text x="${m.left + iw}" y="${H - 8}" text-anchor="end" font-size="10" fill="#6b7280">${escapeXml(fmtTime(tMax))}</text>
</svg>`;
}

export interface BarChartItem { label: string; value: number; color?: string }

/** A simple horizontal bar chart (e.g. measured mean vs guideline). */
export function barChartSVG(opts: { title: string; unit: string; items: BarChartItem[]; width?: number }): string {
  const W = opts.width ?? 720;
  const rowH = 26;
  const H = 30 + opts.items.length * rowH + 10;
  const labelW = 150;
  const max = Math.max(1, ...opts.items.map((i) => i.value));
  const barW = W - labelW - 70;
  const rows = opts.items.map((it, i) => {
    const yy = 30 + i * rowH;
    const w = (it.value / max) * barW;
    return `<text x="0" y="${yy + 14}" font-size="11" fill="#374151">${escapeXml(it.label)}</text>` +
      `<rect x="${labelW}" y="${yy + 4}" width="${w.toFixed(1)}" height="14" rx="2" fill="${it.color ?? '#0e7490'}"/>` +
      `<text x="${labelW + w + 6}" y="${yy + 15}" font-size="10" fill="#374151">${fmtNum(it.value)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">
  <text x="0" y="14" font-size="12" font-weight="600" fill="#111827">${escapeXml(opts.title)} <tspan fill="#6b7280" font-weight="400">(${escapeXml(opts.unit)})</tspan></text>
  ${rows}
</svg>`;
}

export interface BandSegment { label: string; pct: number; color: string }

/** A single horizontal 100%-stacked bar showing % time in each band, + legend. */
export function stackedBandBarSVG(opts: { title: string; segments: BandSegment[]; width?: number }): string {
  const W = opts.width ?? 720;
  const barY = 26, barH = 22, barX = 0, barW = W;
  const segs = opts.segments.filter((s) => s.pct > 0);
  let x = barX;
  const bars = segs.map((s) => {
    const w = (s.pct / 100) * barW;
    const rect = `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${s.color}"/>` +
      (w > 34 ? `<text x="${(x + w / 2).toFixed(1)}" y="${barY + 15}" text-anchor="middle" font-size="10" fill="#fff">${s.pct}%</text>` : '');
    x += w;
    return rect;
  }).join('');
  // Legend below
  const legendY = barY + barH + 18;
  let lx = 0; const perRow = 3; const rowH = 16;
  const legend = opts.segments.map((s, i) => {
    const col = i % perRow; const row = Math.floor(i / perRow);
    const ex = col * (W / perRow); const ey = legendY + row * rowH;
    return `<rect x="${ex}" y="${ey - 8}" width="9" height="9" fill="${s.color}"/>` +
      `<text x="${ex + 13}" y="${ey}" font-size="9.5" fill="#374151">${escapeXml(s.label)} ${s.pct}%</text>`;
    void lx;
  }).join('');
  const legendRows = Math.ceil(opts.segments.length / perRow);
  const H = legendY + legendRows * rowH + 4;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">
  <text x="0" y="14" font-size="12" font-weight="600" fill="#111827">${escapeXml(opts.title)}</text>
  ${bars}
  ${legend}
</svg>`;
}

export { escapeXml };
