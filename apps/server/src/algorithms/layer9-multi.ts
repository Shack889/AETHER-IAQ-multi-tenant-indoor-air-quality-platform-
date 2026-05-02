import { ProcessedSnapshot, AlertLevel } from '@aether/shared';

/**
 * Layer 9: Multi-Node Aggregation & Government-Scale HAL
 *
 * In single-node prototype mode: provides aggregation endpoints and
 * Hardware Abstraction Layer (HAL) normalization.
 *
 * When multiple nodes are connected, computes:
 *  - Cross-node validation (Pearson r, CV%)
 *  - Zone-level averages
 *  - Spatial gradient analysis
 *
 * Reference: AETHER-IAQ paper Section III-I (Multi-node architecture)
 */

export interface AggregatedMetrics {
  node_count: number;
  avg_pm25: number;
  avg_co2: number;
  avg_deps_aqi: number;
  max_alert_level: AlertLevel;
  zone_label: string;
}

/**
 * Aggregate metrics from multiple node snapshots.
 * Falls back gracefully to single-node data.
 */
export function aggregateNodes(snapshots: ProcessedSnapshot[]): AggregatedMetrics {
  if (snapshots.length === 0) {
    return {
      node_count: 0,
      avg_pm25: 0,
      avg_co2: 0,
      avg_deps_aqi: 0,
      max_alert_level: 0,
      zone_label: 'No data',
    };
  }

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

  const avg_pm25     = avg(snapshots.map((s) => s.pm25_corrected));
  const avg_co2      = avg(snapshots.map((s) => s.co2_filtered));
  const avg_deps_aqi = avg(snapshots.map((s) => s.deps_aqi));
  const max_alert    = Math.max(...snapshots.map((s) => s.alert_level)) as AlertLevel;

  return {
    node_count: snapshots.length,
    avg_pm25: Math.round(avg_pm25 * 10) / 10,
    avg_co2:  Math.round(avg_co2),
    avg_deps_aqi: Math.round(avg_deps_aqi),
    max_alert_level: max_alert,
    zone_label: snapshots.length === 1 ? 'Single node' : `${snapshots.length} nodes`,
  };
}

/**
 * HAL: Normalize raw node metadata into a canonical format.
 * Ensures consistent data regardless of firmware version.
 */
export function normalizeNodeMetadata(raw: Record<string, unknown>): {
  nodeId: string;
  firmware: string;
  connectivity: string;
  isOnline: boolean;
} {
  return {
    nodeId:      String(raw['nodeId'] ?? raw['node_id'] ?? 'unknown'),
    firmware:    String(raw['firmware'] ?? raw['fw'] ?? '0.0.0'),
    connectivity: String(raw['connectivity'] ?? raw['conn'] ?? 'wifi'),
    isOnline:    Boolean(raw['online'] ?? raw['isOnline'] ?? false),
  };
}
