import { OUTDOOR_CO2_PPM, CO2_PER_PERSON_LS, DEFAULT_VENTILATION_RATE_LS, PID_PARAMS } from '@aether/shared';
import { VentilationCommand } from '@aether/shared';
import { clamp } from '../utils/statistics';

/**
 * Layer 6: Occupancy Estimation & PID Ventilation Control
 *
 * Occupancy estimated via CO2 mass-balance model (ASHRAE 62.1-2022 basis).
 * PID controller outputs ventilation command to maintain CO2 below setpoint.
 *
 * References:
 *  - ASHRAE Standard 62.1-2022, Ventilation and Acceptable Indoor Air Quality
 *  - Åström & Hägglund (2006), "Advanced PID Control"
 */

interface PidState {
  integral: number;
  prevError: number;
  lastTimestamp: number;
}

const pidStates = new Map<string, PidState>();

export interface Layer6Result {
  occupancy_est: number;
  ventilation_cmd: VentilationCommand;
  pid_output: number;
}

export function processLayer6(
  nodeId: string,
  co2_filtered: number,
  roomVolume_liters?: number,
): Layer6Result {
  // CO2 mass-balance occupancy estimate. Larger rooms dilute CO2, so for the
  // same indoor concentration above outdoor, more occupants must be present.
  // Reference 22×22×10 ft room → ~136,800 L; we treat that as the unit scale.
  const REFERENCE_VOLUME_L = 136800;
  const volumeRatio = roomVolume_liters && roomVolume_liters > 0
    ? roomVolume_liters / REFERENCE_VOLUME_L
    : 1;
  const occupancy_est = Math.max(
    0,
    Math.round(((co2_filtered - OUTDOOR_CO2_PPM) / 25) * volumeRatio),
  );

  // PID ventilation controller
  const now = Date.now();
  const pidState = pidStates.get(nodeId) ?? {
    integral: 0,
    prevError: 0,
    lastTimestamp: now,
  };

  const dt = Math.max(0.1, (now - pidState.lastTimestamp) / 1000); // seconds
  const error = co2_filtered - PID_PARAMS.co2_setpoint;

  pidState.integral = clamp(
    pidState.integral + error * dt,
    -PID_PARAMS.integral_clamp,
    PID_PARAMS.integral_clamp,
  );
  const derivative = (error - pidState.prevError) / dt;
  const output = PID_PARAMS.Kp * error + PID_PARAMS.Ki * pidState.integral + PID_PARAMS.Kd * derivative;
  const pid_output = clamp(output, 0, 100);

  pidState.prevError = error;
  pidState.lastTimestamp = now;
  pidStates.set(nodeId, pidState);

  const ventilation_cmd: VentilationCommand =
    pid_output > 50 ? 'on' : pid_output > 10 ? 'modulate' : 'off';

  return {
    occupancy_est,
    ventilation_cmd,
    pid_output: Math.round(pid_output * 10) / 10,
  };
}

export function resetPid(nodeId: string): void {
  pidStates.delete(nodeId);
}

export function snapshotLayer6(nodeId: string): PidState | null {
  const s = pidStates.get(nodeId);
  return s ? { ...s } : null;
}

export function restoreLayer6(nodeId: string, state: PidState): void {
  pidStates.set(nodeId, { ...state });
}
