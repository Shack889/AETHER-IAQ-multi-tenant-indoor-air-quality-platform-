/**
 * AECI Domain V: Temporal Exposure Memory (TEM)
 *
 * M(t) = M(t-1) × e^(-λ×Δt) + B(t) × Δt
 *
 * Unlike simple CED which only accumulates, TEM models RECOVERY:
 * when you leave polluted air, your exposure memory decays exponentially.
 */

export interface TEMState {
  memory_pm25: number;
  memory_co2: number;
  memory_voc: number;
  lastTimestamp: number;
}

export type RecoveryStatus = 'baseline' | 'recovering' | 'accumulating' | 'critical';

export interface TEMResult {
  temporalMemoryPm: number;
  temporalMemoryCo2: number;
  temporalMemoryVoc: number;
  cognitiveBurdenScore: number;
  recoveryStatus: RecoveryStatus;
  cpis_instantaneous: number;
}

const DECAY_RATES = {
  pm25: 0.05,
  co2:  0.20,
  voc:  0.10,
} as const;

export const MEMORY_THRESHOLDS = {
  pm25: { baseline: 5,   recovering: 20,  critical: 50   },
  co2:  { baseline: 100, recovering: 500, critical: 1500 },
  voc:  { baseline: 10,  recovering: 50,  critical: 150  },
} as const;

const temStates = new Map<string, TEMState>();

export function getTemState(nodeId: string): TEMState {
  return (
    temStates.get(nodeId) ?? {
      memory_pm25: 0,
      memory_co2: 0,
      memory_voc: 0,
      lastTimestamp: Date.now(),
    }
  );
}

export function computeTEM(
  pm25_corrected: number,
  co2_filtered: number,
  voc_filtered: number,
  _totalBurden: number,
  prevState: TEMState,
  currentTimestamp: number,
  intervalSeconds: number = 15,
): { result: TEMResult; newState: TEMState } {
  const dt_hours = intervalSeconds / 3600;

  const memory_pm  = prevState.memory_pm25 * Math.exp(-DECAY_RATES.pm25 * dt_hours) + pm25_corrected * dt_hours;
  const memory_co2 = prevState.memory_co2  * Math.exp(-DECAY_RATES.co2  * dt_hours) + Math.max(0, co2_filtered - 420) * dt_hours;
  const memory_voc = prevState.memory_voc  * Math.exp(-DECAY_RATES.voc  * dt_hours) + voc_filtered * dt_hours;

  const cpis = Math.max(0, Math.min(100, 100 - (co2_filtered - 600) * 0.0526));

  const memoryPenalty = Math.min(30, 5 * (memory_co2 / MEMORY_THRESHOLDS.co2.recovering));
  const cbs = Math.max(0, Math.min(100, cpis - memoryPenalty));

  let recoveryStatus: RecoveryStatus = 'baseline';
  if (memory_co2 > MEMORY_THRESHOLDS.co2.critical || memory_pm > MEMORY_THRESHOLDS.pm25.critical) {
    recoveryStatus = 'critical';
  } else if (memory_co2 > MEMORY_THRESHOLDS.co2.recovering || memory_pm > MEMORY_THRESHOLDS.pm25.recovering) {
    const prevTotal = prevState.memory_pm25 + prevState.memory_co2;
    const currTotal = memory_pm + memory_co2;
    recoveryStatus = currTotal < prevTotal ? 'recovering' : 'accumulating';
  }

  return {
    result: {
      temporalMemoryPm:  Math.round(memory_pm  * 100) / 100,
      temporalMemoryCo2: Math.round(memory_co2 * 100) / 100,
      temporalMemoryVoc: Math.round(memory_voc * 100) / 100,
      cognitiveBurdenScore: Math.round(cbs),
      recoveryStatus,
      cpis_instantaneous: Math.round(cpis),
    },
    newState: {
      memory_pm25: memory_pm,
      memory_co2:  memory_co2,
      memory_voc:  memory_voc,
      lastTimestamp: currentTimestamp,
    },
  };
}

export function setTemState(nodeId: string, state: TEMState): void {
  temStates.set(nodeId, { ...state });
}

export function resetTem(nodeId: string): void {
  temStates.delete(nodeId);
}

export function snapshotTem(nodeId: string): TEMState | null {
  const s = temStates.get(nodeId);
  return s ? { ...s } : null;
}

export function restoreTem(nodeId: string, state: TEMState): void {
  temStates.set(nodeId, { ...state });
}
