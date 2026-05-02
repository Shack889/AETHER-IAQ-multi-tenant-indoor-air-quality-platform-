import { COMPLIANCE_THRESHOLDS, AlertLevel } from '@aether/shared';
import { ComplianceResult } from '@aether/shared';

/**
 * Layer 8: Regulatory Compliance & Alert Escalation
 *
 * Checks current readings against WHO 2021, EPA 2024, India BNAAQS,
 * ASHRAE 62.1, WELL v2, and RESET Air standards simultaneously.
 * Produces a 5-level alert escalation.
 *
 * References:
 *  - WHO Global Air Quality Guidelines 2021
 *  - EPA NAAQS 2024 Revision (PM2.5 annual 9 µg/m³)
 *  - BIS IS 5182 / CPCB BNAAQS (India)
 *  - ASHRAE Standard 62.1-2022, ASHRAE Standard 55-2020
 *  - WELL Building Standard v2 (IWBI 2020)
 *  - RESET Air Standard (RESET 2021)
 */

export interface Layer8Result {
  compliance: ComplianceResult[];
  who_pass:    boolean;
  epa_pass:    boolean;
  bnaaqs_pass: boolean;
  ashrae_pass: boolean;
  well_pass:   boolean;
  reset_pass:  boolean;
  alert_level: AlertLevel;
}

export function processLayer8(
  pm25_corrected: number,
  co2_filtered: number,
  temp_filtered: number,
  rh_filtered: number,
  deps_aqi: number,
): Layer8Result {
  const compliance: ComplianceResult[] = [
    {
      standard: 'WHO 2021',
      parameter: 'PM2.5 (24-hr)',
      threshold: COMPLIANCE_THRESHOLDS.WHO_PM25_24H,
      actual: pm25_corrected,
      passed: pm25_corrected <= COMPLIANCE_THRESHOLDS.WHO_PM25_24H,
    },
    {
      standard: 'EPA 2024',
      parameter: 'PM2.5 (24-hr)',
      threshold: COMPLIANCE_THRESHOLDS.EPA_PM25_24H,
      actual: pm25_corrected,
      passed: pm25_corrected <= COMPLIANCE_THRESHOLDS.EPA_PM25_24H,
    },
    {
      standard: 'BNAAQS',
      parameter: 'PM2.5 (24-hr)',
      threshold: COMPLIANCE_THRESHOLDS.BNAAQS_PM25_24H,
      actual: pm25_corrected,
      passed: pm25_corrected <= COMPLIANCE_THRESHOLDS.BNAAQS_PM25_24H,
    },
    {
      standard: 'ASHRAE 62.1',
      parameter: 'CO₂',
      threshold: COMPLIANCE_THRESHOLDS.ASHRAE_CO2,
      actual: co2_filtered,
      passed: co2_filtered <= COMPLIANCE_THRESHOLDS.ASHRAE_CO2,
    },
    {
      standard: 'WELL v2',
      parameter: 'CO₂',
      threshold: COMPLIANCE_THRESHOLDS.WELL_CO2,
      actual: co2_filtered,
      passed: co2_filtered <= COMPLIANCE_THRESHOLDS.WELL_CO2,
    },
    {
      standard: 'RESET Air',
      parameter: 'CO₂',
      threshold: COMPLIANCE_THRESHOLDS.RESET_CO2,
      actual: co2_filtered,
      passed: co2_filtered <= COMPLIANCE_THRESHOLDS.RESET_CO2,
    },
    {
      standard: 'ASHRAE 55',
      parameter: 'Temperature',
      threshold: COMPLIANCE_THRESHOLDS.ASHRAE_TEMP_MAX,
      actual: temp_filtered,
      passed: temp_filtered >= COMPLIANCE_THRESHOLDS.ASHRAE_TEMP_MIN &&
              temp_filtered <= COMPLIANCE_THRESHOLDS.ASHRAE_TEMP_MAX,
    },
    {
      standard: 'ASHRAE 55',
      parameter: 'Humidity',
      threshold: COMPLIANCE_THRESHOLDS.ASHRAE_RH_MAX,
      actual: rh_filtered,
      passed: rh_filtered >= COMPLIANCE_THRESHOLDS.ASHRAE_RH_MIN &&
              rh_filtered <= COMPLIANCE_THRESHOLDS.ASHRAE_RH_MAX,
    },
  ];

  const who_pass    = compliance.find((c) => c.standard === 'WHO 2021')?.passed ?? false;
  const epa_pass    = compliance.find((c) => c.standard === 'EPA 2024')?.passed ?? false;
  const bnaaqs_pass = compliance.find((c) => c.standard === 'BNAAQS')?.passed ?? false;
  const ashrae_pass = compliance.find((c) => c.standard === 'ASHRAE 62.1')?.passed ?? false;
  const well_pass   = compliance.find((c) => c.standard === 'WELL v2')?.passed ?? false;
  const reset_pass  = compliance.find((c) => c.standard === 'RESET Air')?.passed ?? false;

  const alert_level = computeAlertLevel(
    pm25_corrected,
    co2_filtered,
    deps_aqi,
    compliance,
  );

  return {
    compliance,
    who_pass,
    epa_pass,
    bnaaqs_pass,
    ashrae_pass,
    well_pass,
    reset_pass,
    alert_level,
  };
}

function computeAlertLevel(
  pm25: number,
  co2: number,
  deps_aqi: number,
  compliance: ComplianceResult[],
): AlertLevel {
  const failCount = compliance.filter((c) => !c.passed).length;

  // Level 4: Multiple failures or very high DEPS
  if (failCount >= 3 || deps_aqi > 200) return 4;

  // Level 3: Any threshold exceeded or DEPS > 150
  if (failCount >= 1 || deps_aqi > 150) return 3;

  // Level 2: 90% of thresholds or DEPS > 100
  if (
    deps_aqi > 100 ||
    pm25 > COMPLIANCE_THRESHOLDS.WHO_PM25_24H * 0.9 ||
    co2  > COMPLIANCE_THRESHOLDS.ASHRAE_CO2   * 0.9
  ) return 2;

  // Level 1: 70% of thresholds
  if (
    pm25 > COMPLIANCE_THRESHOLDS.WHO_PM25_24H * 0.7 ||
    co2  > COMPLIANCE_THRESHOLDS.ASHRAE_CO2   * 0.7
  ) return 1;

  return 0;
}
