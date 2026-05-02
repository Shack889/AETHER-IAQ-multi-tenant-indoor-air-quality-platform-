import { KalmanState, KALMAN_PARAMS } from '@aether/shared';

/**
 * Single-dimensional Kalman filter for sensor noise reduction.
 * Reference: Welch & Bishop, "An Introduction to the Kalman Filter", UNC-Chapel Hill TR 95-041
 */
export class KalmanFilter {
  private state: KalmanState;
  private readonly Q: number; // process noise covariance
  private readonly R: number; // measurement noise covariance

  constructor(initialValue: number, Q: number, R: number) {
    this.state = { x: initialValue, P: 1.0 };
    this.Q = Q;
    this.R = R;
  }

  update(measurement: number): number {
    // Prediction step
    const x_pred = this.state.x;
    const P_pred = this.state.P + this.Q;

    // Update step
    const K = P_pred / (P_pred + this.R);
    this.state.x = x_pred + K * (measurement - x_pred);
    this.state.P = (1 - K) * P_pred;

    return this.state.x;
  }

  getState(): KalmanState {
    return { ...this.state };
  }

  reset(value: number): void {
    this.state = { x: value, P: 1.0 };
  }

  setState(state: KalmanState): void {
    this.state = { x: state.x, P: state.P };
  }
}

export function createKalmanFilters(initialReading: {
  pm25: number;
  co2: number;
  voc: number;
  temp: number;
  rh: number;
}): { pm25: KalmanFilter; co2: KalmanFilter; voc: KalmanFilter; temp: KalmanFilter; rh: KalmanFilter } {
  return {
    pm25: new KalmanFilter(initialReading.pm25, KALMAN_PARAMS.pm25.Q, KALMAN_PARAMS.pm25.R),
    co2:  new KalmanFilter(initialReading.co2,  KALMAN_PARAMS.co2.Q,  KALMAN_PARAMS.co2.R),
    voc:  new KalmanFilter(initialReading.voc,  KALMAN_PARAMS.voc.Q,  KALMAN_PARAMS.voc.R),
    temp: new KalmanFilter(initialReading.temp, KALMAN_PARAMS.temp.Q, KALMAN_PARAMS.temp.R),
    rh:   new KalmanFilter(initialReading.rh,   KALMAN_PARAMS.rh.Q,  KALMAN_PARAMS.rh.R),
  };
}
