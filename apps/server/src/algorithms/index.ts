import { RawReading, ProcessedSnapshot, AlertLevel, EventType, VentilationCommand } from '@aether/shared';
import { processLayer1 } from './layer1-sfice';
import { processLayer2 } from './layer2-deps';
import { processLayer3 } from './layer3-health';
import { processLayer4 } from './layer4-predict';
import { processLayer5 } from './layer5-ml';
import { processLayer6 } from './layer6-occupancy';
import { processLayer7, SpatialInput } from './layer7-spatial';
import { processLayer8 } from './layer8-compliance';
import { aggregateNodes } from './layer9-multi';

export { aggregateNodes };
export { processLayer7 };

/**
 * Main algorithm pipeline orchestrator.
 * Runs all 9 layers in sequence for each incoming sensor reading.
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

  // Layer 1: Sensor Fusion + Kalman + corrections
  const l1 = processLayer1(nodeId, raw);

  // Layer 2: DEPS + EPA AQI
  const l2 = processLayer2(profileKey, l1.pm25_corrected, l1.co2_filtered, l1.voc_filtered);

  // Layer 3: Health Impact
  const l3 = processLayer3(
    nodeId,
    l1.co2_filtered,
    l1.pm25_corrected,
    l1.temp_filtered,
    l1.rh_filtered,
    intervalSeconds,
  );

  // Layer 4: Prediction
  const l4 = processLayer4(nodeId, l1.pm25_corrected, l1.co2_filtered);

  // Layer 5: ML/AI
  const l5 = processLayer5(
    nodeId,
    l1.pm25_corrected,
    l1.co2_filtered,
    l1.voc_filtered,
    l1.temp_filtered,
    l1.rh_filtered,
    l4.trend_slope ?? 0,
    0, // co2_slope — use 0 as default
    hourOfDay,
  );

  // Layer 6: Occupancy + PID
  const l6 = processLayer6(nodeId, l1.co2_filtered, roomVolumeLiters);

  // Layer 8: Compliance (Layer 7 is queried separately for spatial page)
  const l8 = processLayer8(
    l1.pm25_corrected,
    l1.co2_filtered,
    l1.temp_filtered,
    l1.rh_filtered,
    l2.deps_aqi,
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
    // Layer 2
    deps_aqi:    l2.deps_aqi,
    epa_aqi:     l2.epa_aqi,
    profile_used: l2.profile_used,
    // Layer 3
    cpis:         l3.cpis,
    ced_pm25:     l3.ced_pm25,
    ced_co2:      l3.ced_co2,
    thermal_pmv:  l3.thermal_pmv,
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
  };

  return snapshot;
}
