import { CED_RESET_HOURS } from '@aether/shared';
import { clamp } from '../utils/statistics';

/**
 * Layer 3: Health Impact Assessment
 *
 * Computes:
 *  - CPIS: Cognitive Performance Impact Score (CO2-cognition study, Harvard T.H. Chan)
 *  - CED:  Cumulative Exposure Dose for PM2.5 and CO2 (running integral)
 *  - PMV:  Predicted Mean Vote thermal comfort (ASHRAE 55 approximation)
 *
 * References:
 *  - Allen et al. (2016), "Associations of Cognitive Function Scores with Carbon Dioxide...", Environ. Health Perspect.
 *  - ISO 7730 / ASHRAE Standard 55-2020 for PMV
 */

interface CEDState {
  pm25: number;
  co2: number;
  lastResetAt: number;
}

// Running CED totals per node (in-memory, reset every 8 hours)
const cedStates = new Map<string, CEDState>();

export interface Layer3Result {
  cpis: number;
  ced_pm25: number;
  ced_co2: number;
  thermal_pmv: number | null;
  thermal_status: 'comfortable' | 'marginal' | 'uncomfortable';
}

export function processLayer3(
  nodeId: string,
  co2_filtered: number,
  pm25_corrected: number,
  temp_filtered: number,
  rh_filtered: number,
  interval_seconds: number = 15,
): Layer3Result {
  // CPIS: Cognitive Performance Impact Score
  // Based on Harvard CO2-cognition study — linear decline from 600→2500 ppm
  let cpis: number;
  if (co2_filtered <= 600) {
    cpis = 100;
  } else if (co2_filtered >= 2500) {
    cpis = 0;
  } else {
    cpis = Math.round(clamp(100 - (co2_filtered - 600) * 0.0526, 0, 100));
  }

  // CED: Cumulative Exposure Dose (running integral)
  const now = Date.now();
  const state = cedStates.get(nodeId) ?? {
    pm25: 0,
    co2: 0,
    lastResetAt: now,
  };

  // Reset CED every 8 hours
  const hoursSinceReset = (now - state.lastResetAt) / (1000 * 3600);
  if (hoursSinceReset >= CED_RESET_HOURS) {
    state.pm25 = 0;
    state.co2 = 0;
    state.lastResetAt = now;
  }

  state.pm25 += pm25_corrected * (interval_seconds / 3600);           // µg/m³·hr
  state.co2  += Math.max(0, co2_filtered - 420) * (interval_seconds / 3600); // ppm·hr above ambient
  cedStates.set(nodeId, state);

  // PMV: Simplified ASHRAE 55 Predicted Mean Vote
  const { pmv, status } = computePmv(temp_filtered, rh_filtered);

  return {
    cpis,
    ced_pm25: Math.round(state.pm25 * 100) / 100,
    ced_co2:  Math.round(state.co2  * 100) / 100,
    thermal_pmv: pmv,
    thermal_status: status,
  };
}

function computePmv(
  temp: number,
  rh: number,
): { pmv: number; status: 'comfortable' | 'marginal' | 'uncomfortable' } {
  if (temp >= 20 && temp <= 26 && rh >= 30 && rh <= 60) {
    return { pmv: 0, status: 'comfortable' };
  }
  if (temp < 20 || temp > 28 || rh < 20 || rh > 70) {
    return { pmv: temp > 26 ? 2 : -2, status: 'uncomfortable' };
  }
  return { pmv: (temp - 23) * 0.5, status: 'marginal' };
}

/** Reset CED for a node (e.g., on user request) */
export function resetCed(nodeId: string): void {
  cedStates.delete(nodeId);
}

export function snapshotLayer3(nodeId: string): CEDState | null {
  const s = cedStates.get(nodeId);
  return s ? { ...s } : null;
}

export function restoreLayer3(nodeId: string, state: CEDState): void {
  cedStates.set(nodeId, { ...state });
}
