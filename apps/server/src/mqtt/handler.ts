import { RawReading } from '@aether/shared';
import { prisma } from '../config/database';
import { runAlgorithmPipeline } from '../algorithms';
import { maybeSaveState } from '../algorithms/state';
import { emitSensorUpdate, emitAlert, emitEventDetected } from '../websocket/emitter';
import { logger } from '../utils/logger';
import { recordReadingProcessed, recordReadingRejected } from '../utils/runtimeStats';

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/** Validates a raw sensor payload against physical sensor ranges. */
export function validateReading(data: Record<string, unknown>): ValidationResult {
  const num = (k: string): number | null => {
    const v = data[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const pm25 = num('pm25');
  if (pm25 === null) return { valid: false, reason: 'missing pm25' };
  if (pm25 < 0 || pm25 > 1000) return { valid: false, reason: 'pm25 out of range' };

  const co2 = num('co2');
  if (co2 === null) return { valid: false, reason: 'missing co2' };
  if (co2 < 200 || co2 > 10000) return { valid: false, reason: 'co2 out of range' };

  const tvoc = num('tvoc');
  if (tvoc === null) return { valid: false, reason: 'missing tvoc' };
  if (tvoc < 0 || tvoc > 500) return { valid: false, reason: 'voc out of range' };

  const tempBme = num('temp_bme');
  if (tempBme === null) return { valid: false, reason: 'missing temp_bme' };
  if (tempBme < -10 || tempBme > 60) return { valid: false, reason: 'temp out of range' };

  const rhBme = num('rh_bme');
  if (rhBme === null) return { valid: false, reason: 'missing rh_bme' };
  if (rhBme < 0 || rhBme > 100) return { valid: false, reason: 'rh out of range' };

  return { valid: true };
}

/**
 * Handles incoming MQTT messages from sensor nodes.
 * Parses payload, validates, runs algorithm pipeline, persists, and pushes via Socket.io.
 */
export async function handleMqttMessage(topic: string, payload: Buffer): Promise<void> {
  try {
    const parts = topic.split('/');
    if (parts[0] !== 'aether') return;

    // Spec format: aether/{userId}/{nodeId}/{data|status}  (4 parts)
    // Legacy:      aether/{nodeId}/{data|status}           (3 parts) — used by mock + older firmware
    let nodeId: string;
    let messageType: string;
    if (parts.length === 4) {
      nodeId = parts[2];
      messageType = parts[3];
    } else if (parts.length === 3) {
      nodeId = parts[1];
      messageType = parts[2];
    } else {
      return;
    }

    const rawText = payload.toString('utf8');
    const rawJson: unknown = JSON.parse(rawText);

    if (messageType === 'data') {
      await handleSensorData(nodeId, rawJson as Record<string, unknown>);
    } else if (messageType === 'status') {
      await handleNodeStatus(nodeId, rawJson as Record<string, unknown>);
    }
  } catch (err) {
    logger.error({ err, topic }, 'mqtt handler error');
  }
}

async function handleSensorData(
  nodeId: string,
  raw: Record<string, unknown>,
): Promise<void> {
  const validation = validateReading(raw);
  if (!validation.valid) {
    recordReadingRejected();
    logger.warn({ nodeId, reason: validation.reason }, 'rejected reading');
    return;
  }

  // Reject readings from unregistered nodes — anyone with broker creds
  // could otherwise spam the system. Mock + simulation paths register
  // their nodes upfront so this only blocks unknown publishers.
  const existing = await prisma.node.findUnique({ where: { nodeId } });
  if (!existing) {
    recordReadingRejected();
    logger.warn({ nodeId }, 'rejected reading from unregistered node');
    return;
  }
  const node = await prisma.node.update({
    where: { nodeId },
    data: { isOnline: true, lastSeen: new Date() },
  });

  const rawReading: RawReading = {
    pm1:      Number(raw['pm1']      ?? 0),
    pm25:     Number(raw['pm25']),
    pm10:     Number(raw['pm10']     ?? 0),
    co2:      Number(raw['co2']),
    tvoc:     Number(raw['tvoc']),
    temp_bme: Number(raw['temp_bme']),
    rh_bme:   Number(raw['rh_bme']),
    pressure: raw['pressure'] != null ? Number(raw['pressure']) : undefined,
    temp_scd: raw['temp_scd'] != null ? Number(raw['temp_scd']) : undefined,
    rh_scd:   raw['rh_scd']  != null ? Number(raw['rh_scd'])  : undefined,
    uptime:   raw['uptime']  != null ? Number(raw['uptime'])   : undefined,
    wifi_rssi: raw['wifi_rssi'] != null ? Number(raw['wifi_rssi']) : undefined,
    heap_free: raw['heap_free'] != null ? Number(raw['heap_free']) : undefined,
  };

  let profileKey = 'OFFICE_OPEN';
  let roomVolumeLiters: number | undefined;
  if (node.roomId) {
    const room = await prisma.room.findUnique({ where: { id: node.roomId } });
    if (room) {
      profileKey = room.profile;
      // ft³ → liters (1 ft³ = 28.3168 L)
      roomVolumeLiters = room.width_ft * room.height_ft * room.ceiling_ft * 28.3168;
    }
  }

  const processed = await runAlgorithmPipeline(nodeId, rawReading, profileKey, 15, roomVolumeLiters);
  const writeTs = processed.timestamp;

  await prisma.reading.create({
    data: {
      nodeId,
      timestamp:    writeTs,
      pm1_raw:      rawReading.pm1,
      pm25_raw:     rawReading.pm25,
      pm10_raw:     rawReading.pm10,
      co2_raw:      rawReading.co2,
      tvoc_raw:     rawReading.tvoc,
      temp_bme:     rawReading.temp_bme,
      rh_bme:       rawReading.rh_bme,
      pressure_hpa: rawReading.pressure ?? null,
      temp_scd:     rawReading.temp_scd ?? null,
      rh_scd:       rawReading.rh_scd  ?? null,
    },
  });

  await prisma.processedData.create({
    data: {
      nodeId,
      timestamp:      writeTs,
      pm25_filtered:  processed.pm25_filtered,
      co2_filtered:   processed.co2_filtered,
      voc_filtered:   processed.voc_filtered,
      temp_filtered:  processed.temp_filtered,
      rh_filtered:    processed.rh_filtered,
      pm25_corrected: processed.pm25_corrected,
      crossValidOk:   processed.crossValidOk,
      deps_aqi:       processed.deps_aqi,
      epa_aqi:        processed.epa_aqi,
      profile_used:   processed.profile_used,
      cpis:           processed.cpis,
      ced_pm25:       processed.ced_pm25,
      ced_co2:        processed.ced_co2,
      thermal_pmv:    processed.thermal_pmv ?? null,
      pm25_pred_30m:  processed.pm25_pred_30m ?? null,
      co2_pred_30m:   processed.co2_pred_30m  ?? null,
      trend_slope:    processed.trend_slope   ?? null,
      event_type:     processed.event_type    ?? null,
      event_confidence: processed.event_confidence ?? null,
      anomaly_score:  processed.anomaly_score ?? null,
      occupancy_est:  processed.occupancy_est ?? null,
      ventilation_cmd: processed.ventilation_cmd ?? null,
      pid_output:     processed.pid_output    ?? null,
      who_pass:       processed.who_pass      ?? null,
      epa_pass:       processed.epa_pass      ?? null,
      bnaaqs_pass:    processed.bnaaqs_pass   ?? null,
      ashrae_pass:    processed.ashrae_pass   ?? null,
      well_pass:      processed.well_pass     ?? null,
      reset_pass:     processed.reset_pass    ?? null,
      alert_level:    processed.alert_level,
    },
  });

  if (processed.alert_level > 0) {
    const alertParam = processed.pm25_corrected > 15 ? 'pm25' : 'co2';
    const alertValue = alertParam === 'pm25' ? processed.pm25_corrected : processed.co2_filtered;
    const alertThreshold = alertParam === 'pm25' ? 15 : 1000;
    const alertLabel = ['Good', 'Moderate', 'Warning', 'Alert', 'Hazardous'][processed.alert_level];
    const alertRow = await prisma.alert.create({
      data: {
        nodeId,
        level:    processed.alert_level,
        message:  `Air quality ${alertLabel}`,
        parameter: alertParam,
        value:    alertValue,
        threshold: alertThreshold,
      },
    });

    emitAlert({
      id: alertRow.id,
      nodeId,
      level: processed.alert_level,
      message: `Air quality ${alertLabel} — ${alertParam.toUpperCase()} ${alertValue.toFixed(1)}`,
      parameter: alertParam,
      value: alertValue,
    });
  }

  if (processed.event_type) {
    emitEventDetected({
      nodeId,
      eventType: processed.event_type,
      confidence: processed.event_confidence ?? 0.85,
      timestamp: processed.timestamp.toISOString(),
    });
  }

  emitSensorUpdate(nodeId, rawReading, processed);
  recordReadingProcessed();
  void maybeSaveState(nodeId);
}

async function handleNodeStatus(
  nodeId: string,
  status: Record<string, unknown>,
): Promise<void> {
  await prisma.node.upsert({
    where: { nodeId },
    create: {
      nodeId,
      name: nodeId,
      isOnline: Boolean(status['online'] ?? true),
      lastSeen: new Date(),
      firmware: status['firmware'] ? String(status['firmware']) : null,
      connectivity: String(status['connectivity'] ?? 'wifi'),
    },
    update: {
      isOnline: Boolean(status['online'] ?? true),
      lastSeen: new Date(),
      firmware: status['firmware'] ? String(status['firmware']) : undefined,
      connectivity: String(status['connectivity'] ?? 'wifi'),
    },
  });
}
