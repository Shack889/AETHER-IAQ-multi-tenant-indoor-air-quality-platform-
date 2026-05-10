import { RawReading, ProcessedSnapshot, AlertLevel, EventType, VentilationCommand } from '@aether/shared';
import { getProfile } from '@aether/shared';
import { processLayer1 } from './layer1-sfice';
import { calcCELI } from './layer2-celi';
import { processLayer3 } from './layer3-health';
import { processLayer4 } from './layer4-predict';
import { processLayer5 } from './layer5-ml';
import { processLayer6 } from './layer6-occupancy';
import { processLayer7, SpatialInput } from './layer7-spatial';
import { processLayer8 } from './layer8-compliance';
import { aggregateNodes } from './layer9-multi';
import { computeInteractionBurden } from './layer-pibt';
import { computeTEM, getTemState, setTemState } from './layer-tem';
import { generateExplanation } from './layer-explainability';
import { prisma } from '../config/database';

export { aggregateNodes };
export { processLayer7 };
export type { SpatialInput };

/**
 * Main algorithm pipeline orchestrator (AECI 7-domain / 9-layer flow).
 *
 * Order:
 *   1. Layer 1 SFICE (sensor fusion + Kalman + corrections) — unchanged
 *   2. Reliability scores  (R = 1 - |raw - filtered| / σ)
 *   3. Layer 2 CELI (dynamic-weight scoring, occupancy + temporal-memory aware)
 *   4. PIBT (interaction burden, after CELI, shares state)
 *   5. TEM (temporal exposure memory, receives totalBurden from PIBT)
 *   6. Layer 4 Prediction (forecasts CELI / burden alongside raw pollutants)
 *   7. Layer 5 ML/AI (event classification + anomaly detection)
 *   8. Layer 6 Occupancy + ventilation (feeds back into next-tick state)
 *   9. Layer 8 Compliance
 *  10. Explainability (runs last, consumes all outputs)
 */
export async function runAlgorithmPipeline(
  nodeId: string,
  raw: RawReading,
  profileKey: string,
  intervalSeconds: number = 15,
  roomVolumeLiters?: number,
): Promise<ProcessedSnapshot> {
  const now = new Date();
  const hourOfDay = now.getHours();

  // 1. Sensor fusion
  const l1 = processLayer1(nodeId, raw);

  // 2. Reliability scores: R_i = 1 - |raw - filtered| / σ
  // σ chosen as a sensor-typical scale; clamped 0..1.
  const reliability_pm25 = clampUnit(1 - Math.abs(raw.pm25      - l1.pm25_filtered) / 25);
  const reliability_co2  = clampUnit(1 - Math.abs(raw.co2       - l1.co2_filtered)  / 200);
  const reliability_voc  = clampUnit(1 - Math.abs(raw.tvoc      - l1.voc_filtered)  / 80);

  // We need an occupancy estimate AND prior temporal-memory for CELI's dynamic
  // weights. Layer 6 produces occupancy from CO2 — we run it first here so the
  // value can feed CELI. Ventilation command from L6 also feeds PIBT.
  const l6 = processLayer6(nodeId, l1.co2_filtered, roomVolumeLiters);

  // Pull last-tick TEM state for fatigue weighting
  const prevTemState = getTemState(nodeId);

  // Look up max occupancy from the room (default 10)
  let maxOccupancy = 10;
  try {
    const node = await prisma.node.findUnique({ where: { nodeId }, include: { room: true } });
    if (node?.room?.maxOccupancy && node.room.maxOccupancy > 0) {
      maxOccupancy = node.room.maxOccupancy;
    }
  } catch {
    // fall back to default
  }

  // 3. CELI (dynamic-weighted)
  const l2 = calcCELI(profileKey, l1.pm25_corrected, l1.co2_filtered, l1.voc_filtered, {
    occupancy: l6.occupancy_est,
    maxOccupancy,
    temporalMemory: {
      pm:  prevTemState.memory_pm25,
      co2: prevTemState.memory_co2,
      voc: prevTemState.memory_voc,
    },
  });

  // 4. PIBT — interaction burden
  const pibt = computeInteractionBurden(
    l1.pm25_corrected,
    l1.co2_filtered,
    l1.voc_filtered,
    l1.temp_filtered,
    l1.rh_filtered,
    l6.occupancy_est,
    l6.ventilation_cmd,
    l2.celi_weights,
  );

  // 5. TEM — temporal exposure memory
  const tem = computeTEM(
    l1.pm25_corrected,
    l1.co2_filtered,
    l1.voc_filtered,
    pibt.totalBurden,
    prevTemState,
    now.getTime(),
    intervalSeconds,
  );
  setTemState(nodeId, tem.newState);

  // Layer 3 — keep CPIS sub-score, PMV; CED retained for backward-compat output
  const l3 = processLayer3(
    nodeId,
    l1.co2_filtered,
    l1.pm25_corrected,
    l1.temp_filtered,
    l1.rh_filtered,
    intervalSeconds,
  );

  // 6. Prediction
  const l4 = processLayer4(nodeId, l1.pm25_corrected, l1.co2_filtered);

  // 7. ML / anomaly detection
  const l5 = processLayer5(
    nodeId,
    l1.pm25_corrected,
    l1.co2_filtered,
    l1.voc_filtered,
    l1.temp_filtered,
    l1.rh_filtered,
    l4.trend_slope ?? 0,
    0,
    hourOfDay,
  );

  // 9. Compliance
  const l8 = processLayer8(
    l1.pm25_corrected,
    l1.co2_filtered,
    l1.temp_filtered,
    l1.rh_filtered,
    l2.celi_score,
  );

  // 10. Explainability
  const profile = getProfile(profileKey);
  const explanation_text = generateExplanation(
    l2.celi_score,
    l1.pm25_corrected,
    l1.co2_filtered,
    l1.voc_filtered,
    l1.temp_filtered,
    l1.rh_filtered,
    l6.occupancy_est,
    pibt.dominantInteraction,
    tem.result.temporalMemoryCo2,
    tem.result.recoveryStatus,
    l6.ventilation_cmd,
    l8.alert_level,
    profile.label,
  );

  const snapshot: ProcessedSnapshot = {
    nodeId,
    timestamp: now,
    // Layer 1
    pm25_filtered:  l1.pm25_filtered,
    co2_filtered:   l1.co2_filtered,
    voc_filtered:   l1.voc_filtered,
    temp_filtered:  l1.temp_filtered,
    rh_filtered:    l1.rh_filtered,
    pm25_corrected: l1.pm25_corrected,
    crossValidOk:   l1.crossValidOk,
    // Domain II
    reliability_pm25,
    reliability_co2,
    reliability_voc,
    // Domain III (CELI)
    celi_score:    l2.celi_score,
    celi_weights:  l2.celi_weights,
    deps_aqi:      l2.deps_aqi,
    epa_aqi:       l2.epa_aqi,
    profile_used:  l2.profile_used,
    // Domain IV (PIBT)
    direct_burden:        pibt.directBurden,
    interaction_burden:   pibt.interactionBurden,
    total_burden:         pibt.totalBurden,
    dominant_interaction: pibt.dominantInteraction,
    interaction_details:  pibt.interactionDetails,
    // Domain V (TEM)
    temporal_memory_pm:  tem.result.temporalMemoryPm,
    temporal_memory_co2: tem.result.temporalMemoryCo2,
    temporal_memory_voc: tem.result.temporalMemoryVoc,
    cognitive_burden:    tem.result.cognitiveBurdenScore,
    recovery_status:     tem.result.recoveryStatus,
    cpis_instantaneous:  tem.result.cpis_instantaneous,
    // Backward-compat for Layer 3
    cpis:        tem.result.cpis_instantaneous,
    ced_pm25:    l3.ced_pm25,
    ced_co2:     l3.ced_co2,
    thermal_pmv: l3.thermal_pmv,
    // Layer 4
    pm25_pred_30m: l4.pm25_pred_30m,
    co2_pred_30m:  l4.co2_pred_30m,
    trend_slope:   l4.trend_slope,
    // Layer 5
    event_type:       (l1.eventType ?? null) as EventType | null,
    event_confidence: l1.eventType ? 0.85 : null,
    anomaly_score:    l5.anomaly_score,
    // Layer 6
    occupancy_est:   l6.occupancy_est,
    ventilation_cmd: l6.ventilation_cmd as VentilationCommand,
    pid_output:      l6.pid_output,
    // Layer 8
    who_pass:    l8.who_pass,
    epa_pass:    l8.epa_pass,
    bnaaqs_pass: l8.bnaaqs_pass,
    ashrae_pass: l8.ashrae_pass,
    well_pass:   l8.well_pass,
    reset_pass:  l8.reset_pass,
    alert_level: l8.alert_level as AlertLevel,
    // Domain VII
    explanation_text,
  };

  return snapshot;
}

function clampUnit(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}
