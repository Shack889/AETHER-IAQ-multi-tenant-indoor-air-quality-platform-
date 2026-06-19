// EPA PM2.5 AQI breakpoints (24-hour average)
export const EPA_PM25_BREAKPOINTS = [
  { pm_lo: 0,     pm_hi: 12.0,  aqi_lo: 0,   aqi_hi: 50,  label: 'Good' },
  { pm_lo: 12.1,  pm_hi: 35.4,  aqi_lo: 51,  aqi_hi: 100, label: 'Moderate' },
  { pm_lo: 35.5,  pm_hi: 55.4,  aqi_lo: 101, aqi_hi: 150, label: 'Unhealthy for Sensitive Groups' },
  { pm_lo: 55.5,  pm_hi: 150.4, aqi_lo: 151, aqi_hi: 200, label: 'Unhealthy' },
  { pm_lo: 150.5, pm_hi: 250.4, aqi_lo: 201, aqi_hi: 300, label: 'Very Unhealthy' },
  { pm_lo: 250.5, pm_hi: 500.4, aqi_lo: 301, aqi_hi: 500, label: 'Hazardous' },
] as const;

// AQI color mapping (alert levels 0-4)
export const AQI_COLORS = {
  0: '#22c55e', // green  — Good
  1: '#eab308', // yellow — Moderate
  2: '#f97316', // orange — Unhealthy for Sensitive
  3: '#ef4444', // red    — Unhealthy
  4: '#7c3aed', // purple — Hazardous
} as const;

// Alert level labels
export const ALERT_LEVEL_LABELS = {
  0: 'Good',
  1: 'Moderate',
  2: 'Warning',
  3: 'Alert',
  4: 'Hazardous',
} as const;

// Kalman filter noise parameters (tuned to sensor datasheets)
export const KALMAN_PARAMS = {
  pm25: { Q: 0.1,  R: 9    }, // PMS5003: noise ~3 µg/m³
  co2:  { Q: 1.0,  R: 1600 }, // SCD41:   noise ~40 ppm
  voc:  { Q: 0.5,  R: 64   }, // SGP40:   noise ~8 idx
  temp: { Q: 0.01, R: 1    }, // BME280:  noise ~1°C
  rh:   { Q: 0.1,  R: 9    }, // BME280:  noise ~3%
} as const;

// Compliance thresholds
export const COMPLIANCE_THRESHOLDS = {
  WHO_PM25_24H:    15,    // µg/m³
  EPA_PM25_24H:    35,    // µg/m³
  BNAAQS_PM25_24H: 65,   // µg/m³ (India NAAQS)
  ASHRAE_CO2:      1000,  // ppm
  WELL_CO2:        800,   // ppm
  RESET_CO2:       600,   // ppm
  ASHRAE_TEMP_MIN: 20,    // °C
  ASHRAE_TEMP_MAX: 26,    // °C
  ASHRAE_RH_MIN:   30,    // %
  ASHRAE_RH_MAX:   60,    // %
} as const;

// PID controller parameters for ventilation
export const PID_PARAMS = {
  Kp: 0.1,
  Ki: 0.001,
  Kd: 0.05,
  co2_setpoint: 800,    // ppm target
  integral_clamp: 5000, // anti-windup
} as const;

// Prediction EWMA alpha
export const EWMA_ALPHA = 0.1;

// Anomaly detection threshold (z-score based)
export const ANOMALY_Z_THRESHOLD = 2.5;

// CED reset interval
export const CED_RESET_HOURS = 8;

// Outdoor CO2 ambient
export const OUTDOOR_CO2_PPM = 420;

// CO2 per person (L/s, sedentary adult)
export const CO2_PER_PERSON_LS = 0.005;

// Default ventilation rate assumption (L/s)
export const DEFAULT_VENTILATION_RATE_LS = 5;

// Room profile defaults
export const DEFAULT_ROOM_DIMENSIONS = {
  width_ft: 22,
  height_ft: 22,
  ceiling_ft: 10,
} as const;

// Structured context annotations for manual occupancy logs. Shared between the
// logging UI and the API so both agree on the allowed set, and so later source
// inference (which PM/VOC/CO₂ excursion explains what) is defensible instead of
// guesswork. Keep 'none' and 'other' as the open ends of the list.
export const ALLOWED_EVENT_TAGS = [
  'none',
  'window_opened', 'window_closed',
  'door_opened', 'door_closed',
  'ac_on', 'ac_off',
  'fan_on', 'fan_off',
  'purifier_on', 'purifier_off',
  'cooking', 'combustion_nearby', 'smoking_nearby',
  'cleaning_chemicals',
  'occupancy_increase', 'occupancy_decrease', 'room_emptied',
  'other',
] as const;

export type EventTag = (typeof ALLOWED_EVENT_TAGS)[number];
