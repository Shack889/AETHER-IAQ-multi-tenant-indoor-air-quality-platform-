/**
 * Consumer environmental guidance — plain-language status + ONE basic, non-medical
 * action per pollutant, tied to the cited WHO/EPA/ventilation bands. Reused by the
 * Health Impact report and the Phase 2 Health-page live section so wording stays
 * identical. NEVER diagnoses, names a disease, or gives medical instructions
 * (Brief #5 §2.2–2.3, §Health-Safety).
 */
import { WHO } from './constants';

export type Tier = 'Good' | 'Moderate' | 'Elevated' | 'High';

export interface Guidance {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  tier: Tier;
  color: string;
  meaning: string;
  action: string;
}

const TIER_COLOR: Record<Tier, string> = {
  Good: '#22c55e', Moderate: '#eab308', Elevated: '#f97316', High: '#ef4444',
};

function g(key: string, label: string, unit: string, value: number | null, tier: Tier, meaning: string, action: string): Guidance {
  return { key, label, unit, value, tier, color: TIER_COLOR[tier], meaning, action };
}

export function pm25Guidance(v: number | null): Guidance {
  if (v == null) return g('pm25', 'PM₂.₅', 'µg/m³', null, 'Good', 'No recent fine-particle reading.', 'Waiting for live readings.');
  const tier: Tier = v <= 9 ? 'Good' : v <= 35.4 ? 'Moderate' : v <= 55.4 ? 'Elevated' : 'High';
  if (tier === 'Good') return g('pm25', 'PM₂.₅', 'µg/m³', v, tier, `Fine particles are low and within the WHO 24-hour guideline of ${WHO.pm25_24h} µg/m³.`, 'No action needed.');
  return g('pm25', 'PM₂.₅', 'µg/m³', v, tier,
    `Fine particles are ${v > WHO.pm25_24h ? 'above' : 'near'} the WHO guideline of ${WHO.pm25_24h} µg/m³.`,
    'Reducing indoor sources (smoke, cooking fumes, dust) and improving airflow can help.');
}

export function co2Guidance(v: number | null): Guidance {
  if (v == null) return g('co2', 'CO₂', 'ppm', null, 'Good', 'No recent CO₂ reading.', 'Waiting for live readings.');
  const tier: Tier = v < 800 ? 'Good' : v < 1000 ? 'Moderate' : v < 1500 ? 'Elevated' : 'High';
  if (tier === 'Good') return g('co2', 'CO₂', 'ppm', v, tier, 'CO₂ is low, which indicates the room is well ventilated.', 'No action needed.');
  return g('co2', 'CO₂', 'ppm', v, tier,
    'CO₂ is raised, which usually means ventilation is low for the number of people present.',
    'Opening a window or door, or reducing how many people are in the room, will help bring fresh air in.');
}

export function vocGuidance(v: number | null): Guidance {
  if (v == null) return g('voc', 'VOC Index', 'index', null, 'Good', 'No recent VOC reading.', 'Waiting for live readings.');
  const tier: Tier = v < 150 ? 'Good' : v < 250 ? 'Elevated' : 'High';
  if (tier === 'Good') return g('voc', 'VOC Index', 'index', v, tier, 'Chemical vapours are around the normal baseline.', 'No action needed.');
  return g('voc', 'VOC Index', 'index', v, tier,
    'Chemical vapours are higher than usual (note: the VOC Index has no absolute health limit).',
    'Check for recent cleaning products, paints or solvents and increase ventilation.');
}

export function allGuidance(values: { pm25: number | null; co2: number | null; voc: number | null }): Guidance[] {
  return [pm25Guidance(values.pm25), co2Guidance(values.co2), vocGuidance(values.voc)];
}

/** True when nothing is above its "Good" band — drives the "all good" message. */
export function allWithinGuidelines(gs: Guidance[]): boolean {
  return gs.every((x) => x.tier === 'Good');
}

/**
 * Basic, cited, NON-medical at-risk context. Never names a disease as the
 * occupant's condition; frames as "guidelines note…" and ties advice to the bands.
 */
export function atRiskNote(gs: Guidance[]): string {
  const anyElevated = gs.some((x) => x.tier === 'Elevated' || x.tier === 'High');
  const advice = anyElevated
    ? 'At the current levels, guidelines suggest sensitive individuals reduce prolonged exposure and improve ventilation.'
    : 'At the current levels, guidelines suggest no special action is needed.';
  return 'Published guidelines (WHO, US EPA) note that children, older adults, and people with existing ' +
    'respiratory sensitivities may be more affected when levels are elevated. ' + advice;
}
