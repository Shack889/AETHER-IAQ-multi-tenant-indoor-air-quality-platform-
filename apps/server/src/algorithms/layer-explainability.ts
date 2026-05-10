/**
 * AECI Domain VII: Explainable Environmental Intelligence
 *
 * Generates natural-language explanations for every environmental state.
 * Deterministic, reproducible, transparent — no black-box AI.
 */

export function generateExplanation(
  celiScore: number,
  pm25: number,
  co2: number,
  voc: number,
  temp: number,
  rh: number,
  occupancy: number,
  dominantInteraction: string | null,
  _temporalMemoryCo2: number,
  recoveryStatus: string,
  ventilationCmd: string,
  alertLevel: number,
  profileLabel: string,
): string {
  const parts: string[] = [];

  if (celiScore <= 30) {
    parts.push(`Air quality is excellent in this ${profileLabel.toLowerCase()} environment.`);
  } else if (celiScore <= 60) {
    parts.push(`Air quality is acceptable for the ${profileLabel.toLowerCase()} environment.`);
  } else if (celiScore <= 100) {
    const maxPollutant = getMaxContributor(pm25, co2, voc);
    parts.push(
      `Moderate environmental burden detected, primarily driven by elevated ${maxPollutant.name} (${maxPollutant.value} ${maxPollutant.unit}).`,
    );
  } else {
    const maxPollutant = getMaxContributor(pm25, co2, voc);
    parts.push(
      `Environmental burden escalation detected due to ${maxPollutant.name} at ${maxPollutant.value} ${maxPollutant.unit}.`,
    );
  }

  if (occupancy > 3 && co2 > 800) {
    parts.push(`Sustained occupancy of approximately ${occupancy} persons is driving CO₂ accumulation.`);
  }

  if (dominantInteraction) {
    const interactionText: Record<string, string> = {
      pm25_rh:        `Humidity at ${rh.toFixed(0)}% is amplifying particulate persistence through hygroscopic growth.`,
      co2_temp:       `Combined CO₂ (${co2.toFixed(0)} ppm) and elevated temperature (${temp.toFixed(1)}°C) are creating compounded cognitive-thermal stress.`,
      voc_temp:       'Elevated temperature is accelerating VOC off-gassing, increasing irritation potential.',
      co2_lowvent:    'Insufficient ventilation is causing CO₂ to accumulate faster than normal dissipation rate.',
      pm25_voc:       'Co-occurrence of elevated PM₂.₅ and VOC suggests a combustion or cooking source.',
      occupancy_vent: 'High occupancy combined with limited ventilation is the primary burden driver.',
    };
    if (interactionText[dominantInteraction]) {
      parts.push(interactionText[dominantInteraction]);
    }
  }

  if (recoveryStatus === 'accumulating') {
    parts.push('Exposure burden continues to accumulate; no recovery period detected in recent history.');
  } else if (recoveryStatus === 'recovering') {
    parts.push('Exposure memory is declining, indicating partial recovery from a previous burden period.');
  } else if (recoveryStatus === 'critical') {
    parts.push('Cumulative exposure has reached critical levels. Extended recovery period recommended.');
  }

  if (alertLevel >= 3 && ventilationCmd !== 'on') {
    parts.push('Immediate action recommended: activate ventilation and reduce occupancy if possible.');
  } else if (alertLevel >= 2) {
    parts.push('Consider increasing ventilation within the next 15 minutes to prevent further burden accumulation.');
  } else if (celiScore > 80 && ventilationCmd === 'on') {
    parts.push('Ventilation is active and working to reduce current burden levels.');
  }

  return parts.join(' ');
}

function getMaxContributor(pm25: number, co2: number, voc: number) {
  const contributors = [
    { name: 'PM₂.₅', value: pm25.toFixed(1), unit: 'µg/m³', normalized: pm25 / 50 },
    { name: 'CO₂',   value: co2.toFixed(0),  unit: 'ppm',   normalized: (co2 - 400) / 1600 },
    { name: 'VOC',   value: voc.toFixed(0),  unit: 'index', normalized: voc / 300 },
  ];
  return contributors.sort((a, b) => b.normalized - a.normalized)[0];
}
