/**
 * AECI Domain V: Temporal Exposure Memory (TEM)
 *
 * dM/dt = B - λM, solved exactly under piecewise-constant forcing B:
 *   M(t) = M(t-1) × e^(-λ×Δt) + (B/λ)(1 - e^(-λ×Δt))
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

// Recovery-status bands on the exposure-memory state M. After the exact-ODE fix
// (8557cd8) memory under sustained forcing B converges to the equilibrium
// M* = B/λ, so each band is a GUIDELINE-ANCHORED EQUILIBRIUM: M* computed from a
// WHO/EPA guideline concentration B with λ from DECAY_RATES — NOT fitted to
// collected data. Pending empirical recalibration once a full post-freeze-point
// collection week exists (the pilot/shakedown window is excluded from analysis
// and must not be used to calibrate thresholds).
//
//   pm25 (λ=0.05/hr, B = pm25_corrected µg·m⁻³):
//     baseline   M*=300  ← B≈15   (WHO 2021 24h guideline)
//     recovering M*=710  ← B≈35   (EPA 24h PM2.5 NAAQS)
//     critical   M*=1110 ← B≈55   (EPA "Unhealthy" 24h)
//   co2  (λ=0.20/hr, B = EXCESS CO₂ over the 420 ppm outdoor baseline, exactly
//         the forcing term Math.max(0, co2_filtered − 420); the ppm in parens
//         is the sustained co2_filtered level = B + 420):
//     baseline   M*=500  ← B≈100  (≈520 ppm sustained)
//     recovering M*=2000 ← B≈400  (≈820 ppm, ASHRAE/WELL drift)
//     critical   M*=5400 ← B≈1080 (≈1500 ppm sustained)
export const MEMORY_THRESHOLDS = {
  pm25: { baseline: 300, recovering: 710,  critical: 1110 },
  co2:  { baseline: 500, recovering: 2000, critical: 5400 },
  // TODO(voc): NOT guideline-anchored, unlike co2/pm25 above. voc_filtered is a
  // Sensirion SGP40 VOC Index (dimensionless, adaptive, baseline≈100) — confirmed
  // via KALMAN_PARAMS.voc ("idx") and profiles.ts voc_max ("VOC index") — not an
  // absolute ppb/µg·m⁻³ concentration, so there is no external health guideline
  // to derive M*=B/λ from. Values below are the pre-fix placeholders; they are
  // currently unused (only co2/pm25 bands feed recovery status). Recalibrate
  // empirically once a full post-freeze-point collection week exists.
  voc:  { baseline: 10,  recovering: 50,   critical: 150  },
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

  // Exact discretization of the leaky-integrator ODE  dM/dt = B - λM
  // under piecewise-constant forcing B over the step:
  //   M_next = M_prev·e^(-λΔt) + (B/λ)·(1 - e^(-λΔt))
  // This is the unique exact solution (see framework Theorem 1); the previous
  // Euler forcing (+B·Δt) carried a signed bias that compounded over many steps.
  const forcing = (B: number, lambda: number): number => {
    const decay = Math.exp(-lambda * dt_hours);
    return (B / lambda) * (1 - decay);
  };

  const B_pm  = pm25_corrected;
  const B_co2 = Math.max(0, co2_filtered - 420);
  const B_voc = voc_filtered;

  const memory_pm  = prevState.memory_pm25 * Math.exp(-DECAY_RATES.pm25 * dt_hours) + forcing(B_pm,  DECAY_RATES.pm25);
  const memory_co2 = prevState.memory_co2  * Math.exp(-DECAY_RATES.co2  * dt_hours) + forcing(B_co2, DECAY_RATES.co2);
  const memory_voc = prevState.memory_voc  * Math.exp(-DECAY_RATES.voc  * dt_hours) + forcing(B_voc, DECAY_RATES.voc);

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
