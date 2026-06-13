import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Data retention enforcement. Reading and ProcessedData grow without bound
 * otherwise (the 1000x simulation era once filled the disk); this purges rows
 * older than the operator-set retentionDays on a schedule, always logging a
 * dry-run line (what WOULD be deleted) before deleting anything.
 *
 * Conservative by design for the collection campaign: the default keeps half
 * a year of data and the floor is 7 days.
 */

const SETTING_KEY = 'retentionDays';
export const DEFAULT_RETENTION_DAYS = 180;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;
const PURGE_INTERVAL_MS = 6 * 3600 * 1000;
const FIRST_RUN_DELAY_MS = 60_000;
const DELETE_BATCH = 5000;

export async function getRetentionDays(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  const days = Number((row?.value as { days?: number } | null)?.days);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS;
}

export async function setRetentionDays(days: number): Promise<number> {
  const clamped = Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.round(days)));
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: { days: clamped } },
    update: { value: { days: clamped } },
  });
  return clamped;
}

export interface PurgeReport {
  retentionDays: number;
  cutoff: string;
  dryRun: boolean;
  readings: { hardware: number; simulated: number };
  processed: { hardware: number; simulated: number };
  alerts: number;
  deleted: number;
}

async function countOlder(cutoff: Date) {
  const [rHw, rSim, pHw, pSim, alerts] = await Promise.all([
    prisma.reading.count({ where: { timestamp: { lt: cutoff }, simulated: false } }),
    prisma.reading.count({ where: { timestamp: { lt: cutoff }, simulated: true } }),
    prisma.processedData.count({ where: { timestamp: { lt: cutoff }, simulated: false } }),
    prisma.processedData.count({ where: { timestamp: { lt: cutoff }, simulated: true } }),
    prisma.alert.count({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return {
    readings: { hardware: rHw, simulated: rSim },
    processed: { hardware: pHw, simulated: pSim },
    alerts,
  };
}

/** Batched delete so a large backlog never holds one giant transaction. */
async function deleteBatched(table: 'Reading' | 'ProcessedData', cutoff: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE id IN (SELECT id FROM "${table}" WHERE timestamp < $1 LIMIT ${DELETE_BATCH})`,
      cutoff,
    );
    total += deleted;
    if (deleted < DELETE_BATCH) break;
  }
  return total;
}

export async function runRetentionPurge(dryRun = false): Promise<PurgeReport> {
  const retentionDays = await getRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
  const counts = await countOlder(cutoff);
  const candidates =
    counts.readings.hardware + counts.readings.simulated +
    counts.processed.hardware + counts.processed.simulated + counts.alerts;

  // Always log the dry-run line first — the operator can audit what retention
  // is about to do from the Railway logs alone.
  logger.info(
    { retentionDays, cutoff: cutoff.toISOString(), ...counts, dryRun },
    `retention dry-run: ${candidates} rows older than cutoff${dryRun ? '' : ' — deleting'}`,
  );
  if (dryRun || candidates === 0) {
    return { retentionDays, cutoff: cutoff.toISOString(), dryRun, ...counts, deleted: 0 };
  }

  const deletedReadings = await deleteBatched('Reading', cutoff);
  const deletedProcessed = await deleteBatched('ProcessedData', cutoff);
  const { count: deletedAlerts } = await prisma.alert.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  const deleted = deletedReadings + deletedProcessed + deletedAlerts;
  logger.info(
    { retentionDays, deletedReadings, deletedProcessed, deletedAlerts },
    `retention purge complete: ${deleted} rows deleted`,
  );
  return { retentionDays, cutoff: cutoff.toISOString(), dryRun, ...counts, deleted };
}

let timer: NodeJS.Timeout | null = null;

export function startRetentionJob(): void {
  if (timer) return;
  const tick = () => {
    runRetentionPurge(false).catch((err) => logger.error({ err }, 'retention purge failed'));
  };
  setTimeout(tick, FIRST_RUN_DELAY_MS);
  timer = setInterval(tick, PURGE_INTERVAL_MS);
  logger.info(
    { intervalHours: PURGE_INTERVAL_MS / 3600_000, defaultDays: DEFAULT_RETENTION_DAYS },
    'retention job scheduled',
  );
}
