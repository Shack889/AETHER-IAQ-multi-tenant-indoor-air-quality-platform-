/**
 * Provenance — the honesty layer. Every report carries, in its header and on
 * every page footer, exactly where the numbers came from: app + commit, the
 * node(s) and room, the precise queried range, the report mode, when it was
 * generated, and an explicit "hardware, simulated=false" data-source statement.
 */
import { APP_NAME, APP_VERSION, MODE_LABEL, ReportMode } from './constants';

export interface ProvenanceInput {
  reportTitle: string;
  nodeIds: string[];
  roomId: string | null;
  roomName: string | null;
  from: Date;
  to: Date;
  mode: ReportMode;
  /** DB tables the figures were computed from. */
  tables: string[];
}

export interface Provenance extends ProvenanceInput {
  appName: string;
  appVersion: string;
  commitSha: string;
  generatedAt: Date;
  dataSource: string;
  /** Compact one-line footer printed on every PDF page. */
  footerLine: string;
}

/** Short commit SHA — Railway injects RAILWAY_GIT_COMMIT_SHA at deploy time. */
export function commitSha(): string {
  const sha =
    process.env['RAILWAY_GIT_COMMIT_SHA'] ||
    process.env['GIT_COMMIT_SHA'] ||
    process.env['SOURCE_VERSION'] ||
    'local-dev';
  return sha.slice(0, 7);
}

/** ISO-ish timestamp with explicit +06:00 offset (Dhaka), for human reading. */
export function formatTs(d: Date): string {
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }) + ' (+06:00)';
}

export function buildProvenance(input: ProvenanceInput): Provenance {
  const generatedAt = new Date();
  const sha = commitSha();
  const dataSource = 'AETHER-IAQ platform, hardware node(s), simulated = false';
  const nodes = input.nodeIds.length ? input.nodeIds.join(', ') : '—';
  const footerLine =
    `${APP_NAME} v${APP_VERSION} · commit ${sha} · ` +
    `node(s): ${nodes} · room: ${input.roomName ?? '—'} · ` +
    `range: ${formatTs(input.from)} → ${formatTs(input.to)} · ` +
    `mode: ${MODE_LABEL[input.mode]} · generated: ${formatTs(generatedAt)} · ` +
    `data source: hardware, simulated=false`;

  return {
    ...input,
    appName: APP_NAME,
    appVersion: APP_VERSION,
    commitSha: sha,
    generatedAt,
    dataSource,
    footerLine,
  };
}
