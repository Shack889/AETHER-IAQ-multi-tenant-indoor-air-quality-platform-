/**
 * Tracks runtime metrics surfaced via /api/health.
 * Updated by the MQTT/mock handler on each successful reading.
 */

interface RuntimeStats {
  readingsProcessed: number;
  readingsRejected: number;
  lastReadingAt: Date | null;
  mqttConnected: boolean;
}

const stats: RuntimeStats = {
  readingsProcessed: 0,
  readingsRejected: 0,
  lastReadingAt: null,
  mqttConnected: false,
};

export function recordReadingProcessed(): void {
  stats.readingsProcessed += 1;
  stats.lastReadingAt = new Date();
}

export function recordReadingRejected(): void {
  stats.readingsRejected += 1;
}

export function setMqttConnected(connected: boolean): void {
  stats.mqttConnected = connected;
}

export function getRuntimeStats(): Readonly<RuntimeStats> {
  return stats;
}
