import { SpatialZone } from '@aether/shared';

/**
 * Layer 7: Spatial Modeling — Virtual Environment Framework (VEF)
 *
 * For single-node deployments: divides room into 9 zones (3×3 grid).
 * Node position determines primary zone; adjacent zones estimated via distance decay.
 *
 * For multi-node deployments: uses Inverse Distance Weighting (IDW) interpolation.
 *
 * Reference: Shepard (1968), "A Two-Dimensional Interpolation Function for
 * Irregularly-Spaced Data", ACM National Conference.
 */

const GRID_SIZE = 3; // 3×3 = 9 zones

export interface SpatialInput {
  pm25: number;
  co2: number;
  voc: number;
  deps_aqi: number;
  nodeX: number; // 0-1 normalized position
  nodeY: number;
}

export function processLayer7(input: SpatialInput): SpatialZone[] {
  const zones: SpatialZone[] = [];
  const maxDiagonal = Math.sqrt(2); // normalized space diagonal

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const zoneX = (col + 0.5) / GRID_SIZE;
      const zoneY = (row + 0.5) / GRID_SIZE;

      const distance = Math.sqrt((zoneX - input.nodeX) ** 2 + (zoneY - input.nodeY) ** 2);
      const decay = 1.0 - (distance / maxDiagonal) * 0.3;

      zones.push({
        zoneIndex: row * GRID_SIZE + col,
        x: zoneX,
        y: zoneY,
        pm25:  Math.round(input.pm25  * decay * 10) / 10,
        co2:   Math.round(input.co2   * decay),
        voc:   Math.round(input.voc   * decay),
        aqi:   Math.round(input.deps_aqi * decay),
      });
    }
  }

  return zones;
}

/**
 * Multi-node IDW (Phase II) — Inverse Distance Weighting
 */
export function idwInterpolate(
  gridX: number,
  gridY: number,
  nodes: Array<{ x: number; y: number; value: number }>,
): number {
  const epsilon = 1e-10;
  let numerator = 0;
  let denominator = 0;

  for (const node of nodes) {
    const dist = Math.sqrt((gridX - node.x) ** 2 + (gridY - node.y) ** 2) + epsilon;
    const weight = 1 / (dist ** 2);
    numerator   += node.value * weight;
    denominator += weight;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}
