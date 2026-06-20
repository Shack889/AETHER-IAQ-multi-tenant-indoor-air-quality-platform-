/**
 * Shared report constants — thresholds, mode definitions, and the dataset
 * freeze point. Centralised so every consumer report cites identical values
 * (Brief #5 §Health / Brief #3 §Health, verified figures).
 */

export const APP_NAME = 'AETHER-IAQ';
export const APP_VERSION = '1.0.0';

/**
 * Dataset-of-record freeze point (§M7). Research mode excludes anything before
 * this instant — it is the moment the TEM/PIBT correctness fixes were live, so
 * data after it was collected under the corrected math. Pilot/shakedown data
 * before it must never enter a research-mode report.
 */
export const FREEZE_POINT = new Date('2026-06-14T01:03:00+06:00');

/** Firmware publishes roughly every 15 s; used for completeness %. */
export const EXPECTED_INTERVAL_SECONDS = 15;

export type ReportMode = 'showcase' | 'research';

export const MODE_LABEL: Record<ReportMode, string> = {
  showcase: 'Showcase — demonstration',
  research: 'Research — dataset of record from 2026-06-14',
};

export const MODE_SUBLABEL: Record<ReportMode, string> = {
  showcase: 'Uses all available hardware-collected data (simulated = false) as a capability demonstration.',
  research: 'Uses only hardware data after the 2026-06-14 01:03 +06:00 dataset-of-record freeze point; pilot/shakedown data excluded.',
};

// ── Verified reference thresholds (cite exactly) ───────────────────────────

/** WHO 2021 global air-quality guidelines. */
export const WHO = {
  pm25_24h: 15,    // µg/m³
  pm25_annual: 5,  // µg/m³
  pm10_24h: 45,    // µg/m³
} as const;

/**
 * US EPA AQI for PM2.5, breakpoints effective 2024-05-06 (24-h µg/m³ → band).
 * Note the "Good" upper bound moved from 12.0 to 9.0 in the 2024 update.
 */
export const EPA_PM25_BANDS = [
  { name: 'Good',                           lo: 0.0,   hi: 9.0,   color: '#22c55e' },
  { name: 'Moderate',                       lo: 9.1,   hi: 35.4,  color: '#eab308' },
  { name: 'Unhealthy for Sensitive Groups', lo: 35.5,  hi: 55.4,  color: '#f97316' },
  { name: 'Unhealthy',                      lo: 55.5,  hi: 125.4, color: '#ef4444' },
  { name: 'Very Unhealthy',                 lo: 125.5, hi: 225.4, color: '#a21caf' },
  { name: 'Hazardous',                      lo: 225.5, hi: Infinity, color: '#7f1d1d' },
] as const;

/**
 * CO₂ as a ventilation / IAQ indicator — NOT a health toxicity threshold.
 * Frame as ASHRAE-style ventilation guidance.
 */
export const CO2_BANDS = [
  { name: 'Well ventilated',     lo: 0,    hi: 800,      color: '#22c55e' },
  { name: 'Acceptable',          lo: 800,  hi: 1000,     color: '#eab308' },
  { name: 'Inadequate vent.',    lo: 1000, hi: 1500,     color: '#f97316' },
  { name: 'Noticeable / stuffy', lo: 1500, hi: Infinity, color: '#ef4444' },
] as const;

/** SGP40 VOC Index — dimensionless, baseline ~100, no regulatory health limit. */
export const VOC_NOTE =
  'VOC is reported as the Sensirion SGP40 VOC Index (dimensionless, baseline ≈ 100), not an absolute concentration. There is no universal regulatory health threshold for this index; bands below are relative comfort indicators only.';

export const VOC_BANDS = [
  { name: 'Low',      lo: 0,   hi: 150,      color: '#22c55e' },
  { name: 'Elevated', lo: 150, hi: 250,      color: '#eab308' },
  { name: 'High',     lo: 250, hi: Infinity, color: '#f97316' },
] as const;

export const REFERENCES = {
  who2021:
    'World Health Organization (2021). WHO global air quality guidelines: particulate matter (PM2.5 and PM10), ozone, nitrogen dioxide, sulfur dioxide and carbon monoxide. Geneva: WHO.',
  epa2024:
    'US Environmental Protection Agency (2024). Final Updates to the Air Quality Index (AQI) for Particulate Matter (effective May 6, 2024); AirNow, AQI Basics.',
} as const;

/**
 * Mandatory health-safety disclaimer (Brief #5 §Health-Safety) — printed
 * verbatim on the Health report and the Health page live-guidance section.
 * Environmental guidance only; never medical advice or diagnosis.
 */
export const HEALTH_DISCLAIMER =
  'This information is based on general public-health air-quality guidelines (WHO, US EPA). ' +
  'It describes the environment, not any individual’s health. It is not medical advice, ' +
  'diagnosis, or a personal risk assessment, and the platform cannot detect or diagnose any ' +
  'disease. Anyone with health concerns should consult a qualified healthcare professional.';

/** Pollutants this hardware does NOT measure but that matter for air quality —
 *  flagged for honesty so the health picture isn't presented as complete. */
export const UNMEASURED_POLLUTANTS =
  'This platform measures PM₂.₅, CO₂, VOC, temperature and humidity. It does NOT measure ' +
  'NO₂, O₃, SO₂, CO or PM₁₀, which also affect respiratory health — so this is a partial picture.';

export function bandFor<T extends { lo: number; hi: number; name: string }>(
  bands: readonly T[],
  value: number,
): T {
  return bands.find((b) => value >= b.lo && value <= b.hi) ?? bands[bands.length - 1];
}
