import { RawReading, FilteredReading, EventType, KalmanState } from '@aether/shared';
import { KalmanFilter, createKalmanFilters } from '../utils/kalman';
import { linearRegression, clamp } from '../utils/statistics';

/**
 * Layer 1: Sensor Fusion with Integrated Correction Engine (SFICE)
 *
 * Applies per-channel Kalman filtering, humidity-compensated PM2.5 correction
 * (EPA/PurpleAir correction factor), cross-sensor validation (BME280 vs SCD41),
 * and multi-pollutant event classification via slope correlation analysis.
 *
 * References:
 *  - Welch & Bishop (1995), "An Introduction to the Kalman Filter"
 *  - Barkjohn et al. (2021), "Development and Application of a United States-Wide Correction for PM2.5 Data Collected with the PurpleAir Sensor", Atmos. Meas. Tech.
 */

// Per-node Kalman filter instances (persisted in memory between readings)
const nodeFilters = new Map<string, ReturnType<typeof createKalmanFilters>>();

// Sliding window for event classification (last 10 readings per node)
const nodeWindows = new Map<string, Array<{ pm25: number; co2: number; voc: number }>>();

export function processLayer1(nodeId: string, raw: RawReading): FilteredReading & { eventType: EventType | null } {
  // Initialize Kalman filters on first reading for this node
  if (!nodeFilters.has(nodeId)) {
    nodeFilters.set(nodeId, createKalmanFilters({
      pm25: raw.pm25,
      co2:  raw.co2,
      voc:  raw.tvoc,
      temp: raw.temp_bme,
      rh:   raw.rh_bme,
    }));
  }

  const filters = nodeFilters.get(nodeId)!;

  // Step 1: Kalman filter each channel
  const pm25_filtered = filters.pm25.update(raw.pm25);
  const co2_filtered  = filters.co2.update(raw.co2);
  const voc_filtered  = filters.voc.update(raw.tvoc);
  const temp_filtered = filters.temp.update(raw.temp_bme);
  const rh_filtered   = filters.rh.update(raw.rh_bme);

  // Step 2: Humidity-compensated PM2.5 (EPA/PurpleAir MLR correction)
  let pm25_corrected: number;
  if (rh_filtered > 50) {
    pm25_corrected = 0.786 * pm25_filtered - 0.085 * rh_filtered + 0.012 * temp_filtered + 1.24;
  } else {
    pm25_corrected = pm25_filtered;
  }
  pm25_corrected = clamp(pm25_corrected, 0, Infinity);

  // Step 3: Cross-sensor validation (BME280 vs SCD41 temp/RH agreement)
  let crossValidOk: boolean;
  if (raw.temp_scd != null && raw.rh_scd != null) {
    crossValidOk =
      Math.abs(raw.temp_bme - raw.temp_scd) < 3.0 &&
      Math.abs(raw.rh_bme   - raw.rh_scd)   < 10.0;
  } else {
    crossValidOk = true; // single sensor source — no cross-validation possible
  }

  // Step 4: Multi-pollutant event classification (slope correlation)
  const window = nodeWindows.get(nodeId) ?? [];
  window.push({ pm25: pm25_filtered, co2: co2_filtered, voc: voc_filtered });
  if (window.length > 10) window.shift();
  nodeWindows.set(nodeId, window);

  const eventType = classifyEvent(window);

  return {
    pm25_filtered,
    co2_filtered,
    voc_filtered,
    temp_filtered,
    rh_filtered,
    pm25_corrected,
    crossValidOk,
    eventType,
  };
}

function classifyEvent(
  window: Array<{ pm25: number; co2: number; voc: number }>,
): EventType | null {
  if (window.length < 5) return null;

  const indices = window.map((_, i) => i);
  const pm25Values = window.map((r) => r.pm25);
  const vocValues  = window.map((r) => r.voc);
  const co2Values  = window.map((r) => r.co2);

  const pm_slope  = linearRegression(indices, pm25Values).slope;
  const voc_slope = linearRegression(indices, vocValues).slope;
  const co2_slope = linearRegression(indices, co2Values).slope;

  if (pm_slope > 1.0 && voc_slope > 3.0)  return 'combustion';
  if (pm_slope > 1.0 && voc_slope < 1.0)  return 'dust';
  if (pm_slope < 0.5 && voc_slope > 5.0)  return 'chemical';
  if (co2_slope > 5.0 && pm_slope < 0.5)  return 'occupancy';
  return null;
}

/** Reset Kalman state for a node (called on reconnect) */
export function resetNodeFilters(nodeId: string): void {
  nodeFilters.delete(nodeId);
  nodeWindows.delete(nodeId);
}

export interface Layer1Snapshot {
  kalman: { pm25: KalmanState; co2: KalmanState; voc: KalmanState; temp: KalmanState; rh: KalmanState };
  window: Array<{ pm25: number; co2: number; voc: number }>;
}

export function snapshotLayer1(nodeId: string): Layer1Snapshot | null {
  const filters = nodeFilters.get(nodeId);
  if (!filters) return null;
  return {
    kalman: {
      pm25: filters.pm25.getState(),
      co2:  filters.co2.getState(),
      voc:  filters.voc.getState(),
      temp: filters.temp.getState(),
      rh:   filters.rh.getState(),
    },
    window: nodeWindows.get(nodeId) ?? [],
  };
}

export function restoreLayer1(nodeId: string, snap: Layer1Snapshot): void {
  const filters = createKalmanFilters({
    pm25: snap.kalman.pm25.x,
    co2:  snap.kalman.co2.x,
    voc:  snap.kalman.voc.x,
    temp: snap.kalman.temp.x,
    rh:   snap.kalman.rh.x,
  });
  // Restore covariance P as well
  (['pm25', 'co2', 'voc', 'temp', 'rh'] as const).forEach((k) => {
    filters[k].setState(snap.kalman[k]);
  });
  nodeFilters.set(nodeId, filters);
  nodeWindows.set(nodeId, [...snap.window]);
}
