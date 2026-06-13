/**
 * AECI Domain IV: Pollutant Interaction Burden Theory (PIBT)
 *
 * Models coupled pollutant interactions that amplify environmental burden
 * beyond what independent assessment captures.
 *
 * B(t) = Σ wᵢ·norm(xᵢ) + Σ αᵢⱼ·norm(xᵢ)·norm(xⱼ)
 *       [direct burden]    [interaction amplification]
 */

export interface InteractionDetail {
  pair: string;
  coefficient: number;
  magnitude: number;
  type: 'synergistic' | 'antagonistic' | 'none';
  explanation: string;
}

export interface InteractionResult {
  directBurden: number;
  interactionBurden: number;
  totalBurden: number;
  dominantInteraction: string | null;
  interactionDetails: InteractionDetail[];
}

// Interaction coefficients. Values below are literature priors and are to be
// REPLACED by empirical estimates from collected data (signed: a negative
// coefficient denotes an antagonistic interaction and is a valid finding).
export const INTERACTION_COEFFICIENTS = {
  pm25_rh:        { alpha: 0.15, label: 'PM₂.₅ × Humidity',        explanation: 'Hygroscopic particle growth increases aerosol persistence' },
  co2_temp:       { alpha: 0.12, label: 'CO₂ × Temperature',       explanation: 'Combined cognitive-thermal stress amplifies discomfort' },
  voc_temp:       { alpha: 0.10, label: 'VOC × Temperature',       explanation: 'Off-gassing rate increases with temperature' },
  co2_lowvent:    { alpha: 0.20, label: 'CO₂ × Low ventilation',   explanation: 'Poor ventilation causes exponential CO₂ accumulation' },
  pm25_voc:       { alpha: 0.08, label: 'PM₂.₅ × VOC',             explanation: 'Co-occurrence indicates combustion source' },
  occupancy_vent: { alpha: 0.18, label: 'Occupancy × Low vent.',   explanation: 'Crowding with poor ventilation accelerates exposure' },
} as const;

// Classify an interaction by the sign of its fitted coefficient.
export function interactionType(alpha: number): 'synergistic' | 'antagonistic' | 'none' {
  if (alpha > 0) return 'synergistic';
  if (alpha < 0) return 'antagonistic';
  return 'none';
}

const NORM_RANGES = {
  pm25: { min: 0, max: 100 },
  co2:  { min: 400, max: 2500 },
  voc:  { min: 0, max: 500 },
  temp: { min: 18, max: 40 },
  rh:   { min: 20, max: 95 },
} as const;

function normalize(value: number, param: keyof typeof NORM_RANGES): number {
  const range = NORM_RANGES[param];
  return Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
}

export function computeInteractionBurden(
  pm25: number,
  co2: number,
  voc: number,
  temp: number,
  rh: number,
  occupancy: number,
  ventilationState: string,
  weights: { w_pm: number; w_co2: number; w_voc: number },
): InteractionResult {
  const n_pm  = normalize(pm25, 'pm25');
  const n_co2 = normalize(co2, 'co2');
  const n_voc = normalize(voc, 'voc');
  const n_temp = normalize(temp, 'temp');
  const n_rh   = normalize(rh, 'rh');
  const n_occ  = Math.min(1, occupancy / 10);
  const n_vent = ventilationState === 'on' ? 0.2 : ventilationState === 'modulate' ? 0.5 : 1.0;

  const totalW = weights.w_pm + weights.w_co2 + weights.w_voc;
  const directBurden = ((weights.w_pm * n_pm + weights.w_co2 * n_co2 + weights.w_voc * n_voc) / totalW) * 100;

  const interactions = [
    { pair: 'pm25_rh',        value: INTERACTION_COEFFICIENTS.pm25_rh.alpha        * n_pm  * n_rh   },
    { pair: 'co2_temp',       value: INTERACTION_COEFFICIENTS.co2_temp.alpha       * n_co2 * n_temp },
    { pair: 'voc_temp',       value: INTERACTION_COEFFICIENTS.voc_temp.alpha       * n_voc * n_temp },
    { pair: 'co2_lowvent',    value: INTERACTION_COEFFICIENTS.co2_lowvent.alpha    * n_co2 * n_vent },
    { pair: 'pm25_voc',       value: INTERACTION_COEFFICIENTS.pm25_voc.alpha       * n_pm  * n_voc  },
    { pair: 'occupancy_vent', value: INTERACTION_COEFFICIENTS.occupancy_vent.alpha * n_occ * n_vent },
  ];

  // Net interaction burden is the SIGNED sum: antagonistic (negative) terms
  // reduce total burden, synergistic terms amplify it.
  const interactionBurden = interactions.reduce((sum, i) => sum + i.value, 0) * 100;

  // Dominant = largest by MAGNITUDE (so a strong antagonism is surfaced, not hidden).
  const sorted = [...interactions].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const dominant = Math.abs(sorted[0].value) > 0.01 ? sorted[0].pair : null;

  const details: InteractionDetail[] = interactions
    .filter((i) => Math.abs(i.value) > 0.005)
    .map((i) => {
      const coeff = INTERACTION_COEFFICIENTS[i.pair as keyof typeof INTERACTION_COEFFICIENTS].alpha;
      return {
        pair: i.pair,
        coefficient: coeff,
        magnitude: Math.round(i.value * 100 * 10) / 10, // signed; negative = antagonistic
        type: interactionType(coeff),
        explanation: INTERACTION_COEFFICIENTS[i.pair as keyof typeof INTERACTION_COEFFICIENTS].explanation,
      };
    });

  return {
    directBurden: Math.round(directBurden * 10) / 10,
    interactionBurden: Math.round(interactionBurden * 10) / 10,
    totalBurden: Math.round((directBurden + interactionBurden) * 10) / 10,
    dominantInteraction: dominant,
    interactionDetails: details,
  };
}
