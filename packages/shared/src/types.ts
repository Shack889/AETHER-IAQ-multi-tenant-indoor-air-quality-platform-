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
  // Domain II: Reliability scores
  reliability_pm25: number;
  reliability_co2: number;
  reliability_voc: number;
  // Layer 2 / Domain III: CELI (replaces DEPS — deps_aqi kept as alias)
  celi_score: number;
  celi_weights: { w_pm: number; w_co2: number; w_voc: number };
  deps_aqi: number; // backward-compat — equal to celi_score
  epa_aqi: number;
  profile_used: string;
  // Domain IV: Pollutant Interaction Burden Theory
  direct_burden: number;
  interaction_burden: number;
  total_burden: number;
  dominant_interaction: string | null;
  interaction_details: Array<{
    pair: string;
    coefficient: number;
    magnitude: number;
    explanation: string;
  }>;
  // Domain V: Temporal Exposure Memory (replaces ced_pm25/ced_co2)
  temporal_memory_pm: number;
  temporal_memory_co2: number;
  temporal_memory_voc: number;
  cognitive_burden: number;        // CBS
  recovery_status: 'baseline' | 'recovering' | 'accumulating' | 'critical';
  cpis_instantaneous: number;
  // Layer 3 — backward-compat — equal to cpis_instantaneous
  cpis: number;
  ced_pm25: number;
  ced_co2: number;
  thermal_pmv: number | null;
  // Domain VII: Explainability
  explanation_text: string;
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
  dataSource: 'mock' | 'live' | 'simulation';
  mockEnabled: boolean;
  hardwareEnabled: boolean;
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
  simulated: boolean;
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

export type DataSourceState =
  | 'mock'        // mock generator only
  | 'live'        // real hardware only
  | 'simulation'  // sim engine (immutable)
  | 'mixed'       // both mock and hardware enabled
  | 'paused';     // neither enabled

export interface DataSourceChangedEvent {
  nodeId: string;
  previous: DataSourceState;
  next: DataSourceState;
  reason: 'auto-detected' | 'manual';
  timestamp: string;
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
