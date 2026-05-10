import { EPA_PM25_BREAKPOINTS } from '@aether/shared';
import { getProfile } from '@aether/shared';
import { clamp } from '../utils/statistics';

/**
 * AECI Domain III: Contextual Environmental Load Index (CELI)
 *
 * Evolved from the static DEPS algorithm. The composite weighted-AQI formula
 * stays the same — `CELI = Σ(wᵢ × SIᵢ) / Σ(wᵢ)` — but weights are now DYNAMIC,
 * amplified by occupancy and exposure-history fatigue.
 *
 * The 15 profile base weights (w_pm, w_co2, w_voc) act as `w_base_*`. Per-reading
 * dynamic weights are derived from these and emitted alongside the score so the
 * frontend can show why this reading was scored the way it was.
 *
 * EPA standard AQI is computed in parallel (unchanged) for comparison.
 */

export interface BaseWeights {
  w_pm: number;
  w_co2: number;
  w_voc: number;
}

export interface DynamicWeights extends BaseWeights {}

export interface Layer2Result {
  celi_score: number;
  celi_weights: DynamicWeights;
  epa_aqi: number;
  profile_used: string;
  // backward-compat — same value as celi_score
  deps_aqi: number;
}

const DEFAULT_MEMORY_THRESHOLDS = { pm: 20, co2: 500, voc: 50 };

export function computeDynamicWeights(
  baseWeights: BaseWeights,
  occupancy: number,
  maxOccupancy: number,
  temporalMemory: { pm: number; co2: number; voc: number },
  memoryThresholds: { pm: number; co2: number; voc: number } = DEFAULT_MEMORY_THRESHOLDS,
): DynamicWeights {
  const occFactor = 1 + 0.1 * (occupancy / Math.max(1, maxOccupancy));

  const fatiguePm  = 1 + 0.05 * Math.min(1, temporalMemory.pm  / memoryThresholds.pm);
  const fatigueCo2 = 1 + 0.05 * Math.min(1, temporalMemory.co2 / memoryThresholds.co2);
  const fatigueVoc = 1 + 0.05 * Math.min(1, temporalMemory.voc / memoryThresholds.voc);

  return {
    w_pm:  baseWeights.w_pm  * occFactor * fatiguePm,
    w_co2: baseWeights.w_co2 * occFactor * fatigueCo2,
    w_voc: baseWeights.w_voc * occFactor * fatigueVoc,
  };
}

export function calcCELI(
  profileKey: string,
  pm25_corrected: number,
  co2_filtered: number,
  voc_filtered: number,
  options?: {
    occupancy?: number;
    maxOccupancy?: number;
    temporalMemory?: { pm: number; co2: number; voc: number };
  },
): Layer2Result {
  const profile = getProfile(profileKey);

  const baseWeights: BaseWeights = {
    w_pm:  profile.w_pm,
    w_co2: profile.w_co2,
    w_voc: profile.w_voc,
  };

  const occupancy    = options?.occupancy ?? 0;
  const maxOccupancy = options?.maxOccupancy ?? 10;
  const temporalMemory = options?.temporalMemory ?? { pm: 0, co2: 0, voc: 0 };

  const dynamicWeights = computeDynamicWeights(baseWeights, occupancy, maxOccupancy, temporalMemory);

  // CELI sub-indices (0-100 each, clamped) — using profile-defined max thresholds
  const si_pm  = clamp((pm25_corrected / profile.pm_max)  * 100, 0, 100);
  const si_co2 = clamp((co2_filtered   / profile.co2_max) * 100, 0, 100);
  const si_voc = clamp((voc_filtered   / profile.voc_max) * 100, 0, 100);

  const totalWeight = dynamicWeights.w_pm + dynamicWeights.w_co2 + dynamicWeights.w_voc;
  const celi_score = Math.round(
    (dynamicWeights.w_pm * si_pm + dynamicWeights.w_co2 * si_co2 + dynamicWeights.w_voc * si_voc) / totalWeight,
  );

  const epa_aqi = computeEpaAqi(pm25_corrected);

  return {
    celi_score,
    celi_weights: {
      w_pm:  Math.round(dynamicWeights.w_pm  * 1000) / 1000,
      w_co2: Math.round(dynamicWeights.w_co2 * 1000) / 1000,
      w_voc: Math.round(dynamicWeights.w_voc * 1000) / 1000,
    },
    epa_aqi,
    profile_used: profile.key,
    deps_aqi: celi_score,
  };
}

// Backward-compat alias for any callers that still import processLayer2
export const processLayer2 = calcCELI;

function computeEpaAqi(pm25: number): number {
  for (const bp of EPA_PM25_BREAKPOINTS) {
    if (pm25 >= bp.pm_lo && pm25 <= bp.pm_hi) {
      return Math.round(
        ((bp.aqi_hi - bp.aqi_lo) / (bp.pm_hi - bp.pm_lo)) * (pm25 - bp.pm_lo) + bp.aqi_lo,
      );
    }
  }
  return 500;
}
