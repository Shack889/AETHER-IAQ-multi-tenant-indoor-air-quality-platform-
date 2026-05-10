import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { snapshotLayer1, restoreLayer1, type Layer1Snapshot } from './layer1-sfice';
import { snapshotLayer3, restoreLayer3 } from './layer3-health';
import { snapshotLayer4, restoreLayer4, type Layer4Snapshot } from './layer4-predict';
import { snapshotLayer5, restoreLayer5 } from './layer5-ml';
import { snapshotLayer6, restoreLayer6 } from './layer6-occupancy';
import { snapshotTem, restoreTem, type TEMState } from './layer-tem';

interface PersistedState {
  layer1: Layer1Snapshot | null;
  layer3: ReturnType<typeof snapshotLayer3>;
  layer4: Layer4Snapshot | null;
  layer5: ReturnType<typeof snapshotLayer5>;
  layer6: ReturnType<typeof snapshotLayer6>;
  tem:    TEMState | null;
}

const SAVE_EVERY_N_READINGS = 10;
const readingCounters = new Map<string, number>();

export function snapshotState(nodeId: string): PersistedState {
  return {
    layer1: snapshotLayer1(nodeId),
    layer3: snapshotLayer3(nodeId),
    layer4: snapshotLayer4(nodeId),
    layer5: snapshotLayer5(nodeId),
    layer6: snapshotLayer6(nodeId),
    tem:    snapshotTem(nodeId),
  };
}

export function restoreState(nodeId: string, state: PersistedState): void {
  if (state.layer1) restoreLayer1(nodeId, state.layer1);
  if (state.layer3) restoreLayer3(nodeId, state.layer3);
  if (state.layer4) restoreLayer4(nodeId, state.layer4);
  if (state.layer5) restoreLayer5(nodeId, state.layer5);
  if (state.layer6) restoreLayer6(nodeId, state.layer6);
  if (state.tem)    restoreTem(nodeId, state.tem);
}

export async function maybeSaveState(nodeId: string): Promise<void> {
  const next = (readingCounters.get(nodeId) ?? 0) + 1;
  readingCounters.set(nodeId, next);
  if (next % SAVE_EVERY_N_READINGS !== 0) return;

  const snap = snapshotState(nodeId);
  try {
    await prisma.algorithmState.upsert({
      where: { nodeId },
      create: { nodeId, state: snap as unknown as Prisma.JsonObject },
      update: { state: snap as unknown as Prisma.JsonObject },
    });
  } catch (err) {
    logger.warn({ err, nodeId }, 'failed to persist algorithm state');
  }
}

export async function loadAllStates(): Promise<number> {
  let restored = 0;
  try {
    const rows = await prisma.algorithmState.findMany();
    for (const row of rows) {
      try {
        restoreState(row.nodeId, row.state as unknown as PersistedState);
        restored++;
      } catch (err) {
        logger.warn({ err, nodeId: row.nodeId }, 'failed to restore algorithm state');
      }
    }
  } catch (err) {
    logger.warn({ err }, 'failed to query algorithm states on startup');
  }
  return restored;
}
