import { EPA_PM25_BREAKPOINTS } from '@aether/shared';
import { getProfile } from '@aether/shared';
import { clamp } from '../utils/statistics';

/**
 * Layer 2: Dynamic Environment Profile Scoring (DEPS)
 *
 * Computes a weighted composite AQI tailored to the active environment profile.
 * Different spaces (ICU vs classroom vs factory) weight pollutants differently.
 * Also computes EPA standard AQI in parallel for comparison.
 *
 * Reference: DEPS algorithm — original contribution, see paper Section III-B.
 */

export interface Layer2Result {
  deps_aqi: number;
  epa_aqi: number;
  profile_used: string;
}

export function processLayer2(
  profileKey: string,
  pm25_corrected: number,
  co2_filtered: number,
  voc_filtered: number,
): Layer2Result {
  const profile = getProfile(profileKey);

  // DEPS sub-indices (0-100 each, clamped)
  const si_pm  = clamp((pm25_corrected / profile.pm_max)  * 100, 0, 100);
  const si_co2 = clamp((co2_filtered   / profile.co2_max) * 100, 0, 100);
  const si_voc = clamp((voc_filtered   / profile.voc_max) * 100, 0, 100);

  const totalWeight = profile.w_pm + profile.w_co2 + profile.w_voc;
  const deps_aqi = Math.round(
    (profile.w_pm * si_pm + profile.w_co2 * si_co2 + profile.w_voc * si_voc) / totalWeight,
  );

  // EPA AQI from PM2.5 only (standard 24-hr breakpoints)
  const epa_aqi = computeEpaAqi(pm25_corrected);

  return { deps_aqi, epa_aqi, profile_used: profile.key };
}

function computeEpaAqi(pm25: number): number {
  for (const bp of EPA_PM25_BREAKPOINTS) {
    if (pm25 >= bp.pm_lo && pm25 <= bp.pm_hi) {
      // Linear interpolation within breakpoint range
      return Math.round(
        ((bp.aqi_hi - bp.aqi_lo) / (bp.pm_hi - bp.pm_lo)) * (pm25 - bp.pm_lo) + bp.aqi_lo,
      );
    }
  }
  // Above 500 µg/m³ — hazardous maximum
  return 500;
}
