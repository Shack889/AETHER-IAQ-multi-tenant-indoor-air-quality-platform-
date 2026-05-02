// Core sensor reading from ESP32 via MQTT
export interface RawReading {
  pm1: number;
  pm25: number;
  pm10: number;
  co2: number;
  tvoc: number;
  temp_bme: number;
  rh_bme: number;
  pressure?: number;
  temp_scd?: number;
  rh_scd?: number;
  uptime?: number;
  wifi_rssi?: number;
  heap_free?: number;
}

// After Layer 1 (Kalman filter + corrections)
export interface FilteredReading {
  pm25_filtered: number;
  co2_filtered: number;
  voc_filtered: number;
  temp_filtered: number;
  rh_filtered: number;
  pm25_corrected: number;
  crossValidOk: boolean;
}

// Full processed data snapshot (all 9 layers)
export interface ProcessedSnapshot {
  nodeId: string;
  timestamp: Date;
  // Layer 1
  pm25_filtered: number;
  co2_filtered: number;
  voc_filtered: number;
  temp_filtered: number;
  rh_filtered: number;
  pm25_corrected: number;
  crossValidOk: boolean;
  // Layer 2
  deps_aqi: number;
  epa_aqi: number;
  profile_used: string;
  // Layer 3
  cpis: number;
  ced_pm25: number;
  ced_co2: number;
  thermal_pmv: number | null;
  // Layer 4
  pm25_pred_30m: number | null;
  co2_pred_30m: number | null;
  trend_slope: number | null;
  // Layer 5
  event_type: EventType | null;
  event_confidence: number | null;
  anomaly_score: number | null;
  // Layer 6
  occupancy_est: number | null;
  ventilation_cmd: VentilationCommand | null;
  pid_output: number | null;
  // Layer 8
  who_pass: boolean | null;
  epa_pass: boolean | null;
  bnaaqs_pass: boolean | null;
  ashrae_pass: boolean | null;
  well_pass: boolean | null;
  reset_pass: boolean | null;
  alert_level: AlertLevel;
}

export type EventType = 'combustion' | 'dust' | 'chemical' | 'occupancy';
export type VentilationCommand = 'on' | 'off' | 'modulate';
export type AlertLevel = 0 | 1 | 2 | 3 | 4;
export type Connectivity = 'wifi' | 'cellular' | 'espnow';

export interface NodeInfo {
  id: string;
  nodeId: string;
  name: string;
  roomId: string | null;
  posX: number | null;
  posY: number | null;
  posZ: number | null;
  isOnline: boolean;
  lastSeen: Date | null;
  firmware: string | null;
  connectivity: Connectivity;
}

export interface RoomConfig {
  id: string;
  name: string;
  width_ft: number;
  height_ft: number;
  ceiling_ft: number;
  profile: string;
  userId: string;
}

export interface AlertRecord {
  id: string;
  nodeId: string;
  level: AlertLevel;
  message: string;
  parameter: string;
  value: number;
  threshold: number;
  acknowledged: boolean;
  createdAt: Date;
}

export interface ComplianceResult {
  standard: string;
  parameter: string;
  threshold: number;
  actual: number;
  passed: boolean;
}

export interface SpatialZone {
  zoneIndex: number;
  x: number;
  y: number;
  pm25: number;
  co2: number;
  voc: number;
  aqi: number;
}

// WebSocket event payloads
export interface SensorUpdateEvent {
  nodeId: string;
  timestamp: string;
  raw: RawReading;
  processed: ProcessedSnapshot;
}

export interface AlertNewEvent {
  nodeId: string;
  level: AlertLevel;
  message: string;
  parameter: string;
  value: number;
}

export interface EventDetectedEvent {
  nodeId: string;
  eventType: EventType;
  confidence: number;
  timestamp: string;
}

export interface NodeStatusEvent {
  nodeId: string;
  isOnline: boolean;
  connectivity: Connectivity;
  lastSeen: string;
}

// Kalman filter state
export interface KalmanState {
  x: number;
  P: number;
}

export interface KalmanStates {
  pm25: KalmanState;
  co2: KalmanState;
  voc: KalmanState;
  temp: KalmanState;
  rh: KalmanState;
}

// Prediction window entry
export interface PredictionWindowEntry {
  pm25: number;
  co2: number;
  timestamp: number;
}

// API response wrappers
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface HistoricalDataQuery {
  from: string;
  to: string;
  interval?: '15m' | '1h' | '6h' | '24h';
}
