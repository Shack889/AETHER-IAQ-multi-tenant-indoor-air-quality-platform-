/**
 * Statistical utility functions for the AETHER-IAQ algorithm pipeline.
 */

/** Compute arithmetic mean of an array */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Compute population standard deviation */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Simple linear regression — returns slope and intercept.
 * @returns { slope, intercept, r2 }
 */
export function linearRegression(
  x: number[],
  y: number[],
): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0, r2: 0 };

  const meanX = mean(x);
  const meanY = mean(y);

  let ssXY = 0;
  let ssXX = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (x[i] - meanX) * (y[i] - meanY);
    ssXX += (x[i] - meanX) ** 2;
  }

  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  // R-squared
  const ssTot = y.reduce((sum, yi) => sum + (yi - meanY) ** 2, 0);
  const ssRes = y.reduce((sum, yi, i) => sum + (yi - (slope * x[i] + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

/**
 * Pearson correlation coefficient between two arrays.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = mean(x);
  const my = mean(y);
  const sx = stddev(x);
  const sy = stddev(y);
  if (sx === 0 || sy === 0) return 0;
  const cov = x.reduce((sum, xi, i) => sum + (xi - mx) * (y[i] - my), 0) / n;
  return cov / (sx * sy);
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Add Gaussian noise to a value (Box-Muller transform) */
export function addGaussianNoise(value: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return value + sigma * z;
}
