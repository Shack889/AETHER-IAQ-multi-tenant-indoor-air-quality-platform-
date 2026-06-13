/**
 * Natural CO₂ decay detector.
 *
 * Watches the per-node CO₂ stream for naturally occurring washout events
 * (room empties, CO₂ relaxes toward outdoor by mass balance). On a clean,
 * sufficiently long monotone decline it fits  ln(C - C_ext) = b - a·t  by OLS
 * and records the air-change rate a (= λ_CO₂ physical analogue) with its R².
 *
 * This grounds the TEM decay rate in observed data rather than a heuristic.
 */

export interface DecaySample {
  t: number;      // epoch ms
  co2: number;    // filtered CO₂ ppm
}

export interface DecayFit {
  startedAt: Date;
  endedAt: Date;
  durationMin: number;
  c0_ppm: number;
  cEnd_ppm: number;
  cExt_ppm: number;
  ach_est: number;     // per hour
  lambda_est: number;  // identical value, named for TEM correspondence
  r_squared: number;
  nPoints: number;
}

// ---- Tunable thresholds (calibrate against real data; see notes) ----
export const DECAY_CONFIG = {
  startMinPpm: 800,        // event must start above this (clearly elevated)
  cExtPpm: 420,            // assumed outdoor baseline; refine per site if known
  minDurationMin: 20,      // require a sustained decline
  minDropPpm: 150,         // total fall must exceed this (ignore noise wiggles)
  minPoints: 20,           // enough points for a stable fit
  maxRiseTolerancePpm: 40, // allow small non-monotonic blips (sensor noise)
  minRSquared: 0.90,       // only keep clean exponential fits
  bufferMaxAgeMin: 240,    // discard samples older than this from the buffer
} as const;

interface NodeBuffer {
  samples: DecaySample[];
  inDecline: boolean;
}

const buffers = new Map<string, NodeBuffer>();

/** Reset a node's buffer (e.g. on reassignment between rooms). */
export function resetDecayBuffer(nodeId: string): void {
  buffers.delete(nodeId);
}

/**
 * Feed one filtered CO₂ reading. Returns a DecayFit when a completed event is
 * detected on THIS sample (i.e. the decline just ended), else null.
 */
export function feedCo2(nodeId: string, tEpochMs: number, co2Filtered: number): DecayFit | null {
  const cfg = DECAY_CONFIG;
  let buf = buffers.get(nodeId);
  if (!buf) {
    buf = { samples: [], inDecline: false };
    buffers.set(nodeId, buf);
  }

  // Drop stale samples
  const cutoff = tEpochMs - cfg.bufferMaxAgeMin * 60_000;
  buf.samples = buf.samples.filter((s) => s.t >= cutoff);

  const prev = buf.samples[buf.samples.length - 1];

  // Start a decline when CO₂ is elevated and begins falling.
  if (!buf.inDecline) {
    if (co2Filtered >= cfg.startMinPpm && prev && co2Filtered < prev.co2) {
      buf.inDecline = true;
      buf.samples = [prev, { t: tEpochMs, co2: co2Filtered }];
      return null;
    }
    // not in a decline: keep only the last sample as a potential anchor
    buf.samples = [{ t: tEpochMs, co2: co2Filtered }];
    return null;
  }

  // In a decline. Is this sample still consistent with falling?
  const last = buf.samples[buf.samples.length - 1];
  if (co2Filtered <= last.co2 + cfg.maxRiseTolerancePpm) {
    // still declining (small noise rises tolerated)
    buf.samples.push({ t: tEpochMs, co2: co2Filtered });
    return null;
  }

  // Decline broken (CO₂ rose meaningfully → occupancy/source returned).
  // Try to close out the event with what we have.
  const fit = tryFit(buf.samples);
  // Reset to treat this rising sample as a fresh anchor.
  buffers.set(nodeId, { samples: [{ t: tEpochMs, co2: co2Filtered }], inDecline: false });
  return fit;
}

/** Attempt an exponential-decay fit on a buffered decline. Returns null if it
 *  fails the quality gates. */
function tryFit(samples: DecaySample[]): DecayFit | null {
  const cfg = DECAY_CONFIG;
  if (samples.length < cfg.minPoints) return null;

  const c0 = samples[0].co2;
  const cEnd = samples[samples.length - 1].co2;
  const durationMin = (samples[samples.length - 1].t - samples[0].t) / 60_000;
  if (durationMin < cfg.minDurationMin) return null;
  if (c0 - cEnd < cfg.minDropPpm) return null;

  const cExt = cfg.cExtPpm;
  // Need all points strictly above cExt to take logs.
  const usable = samples.filter((s) => s.co2 - cExt > 1);
  if (usable.length < cfg.minPoints) return null;

  // OLS of y = ln(C - cExt) on x = hours since start.  slope = -a.
  const t0 = usable[0].t;
  const xs = usable.map((s) => (s.t - t0) / 3_600_000); // hours
  const ys = usable.map((s) => Math.log(s.co2 - cExt));
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX, dy = ys[i] - meanY;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  const ach = -slope; // per hour

  if (ach <= 0) return null;                 // must actually be decaying
  if (r2 < cfg.minRSquared) return null;     // must be a clean exponential

  return {
    startedAt: new Date(samples[0].t),
    endedAt: new Date(samples[samples.length - 1].t),
    durationMin,
    c0_ppm: c0,
    cEnd_ppm: cEnd,
    cExt_ppm: cExt,
    ach_est: ach,
    lambda_est: ach,
    r_squared: r2,
    nPoints: n,
  };
}
