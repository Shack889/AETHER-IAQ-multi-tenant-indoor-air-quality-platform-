import { Prisma } from '@prisma/client';
import { RawReading } from '@aether/shared';
import { prisma } from '../config/database';
import { runAlgorithmPipeline } from '../algorithms';
import { emitSensorUpdate } from '../websocket/emitter';
import { addGaussianNoise } from '../utils/statistics';
import { logger } from '../utils/logger';

/**
 * Simulation engine — runs virtual sensor nodes through the same algorithm
 * pipeline as real MQTT data. Each tick generates synthetic readings shaped
 * by the user-supplied occupancy schedule, ventilation type, external
 * conditions, and any injected events.
 */

const TICK_INTERVAL_MS = 1000; // wall-clock cadence; sim time advances by speed * 1s
const SIM_INTERVAL_SECONDS = 15; // sensor cadence in simulated time

export interface RoomConfig {
  width_ft: number;
  height_ft: number;
  ceiling_ft: number;
  ventType: 'none' | 'natural' | 'fan' | 'ac';
  outdoorPM25: number;
  outdoorTemp: number;
  outdoorRH: number;
}

export interface NodePosition {
  x: number;
  y: number;
  z: number;
}

export interface OccupancyBin {
  hour: number; // 0-23
  count: number;
}

export interface SimEvent {
  hour: number;
  minute: number;
  type: 'dust' | 'combustion' | 'chemical';
}

interface RuntimeState {
  ticker: NodeJS.Timeout | null;
  simTimeSeconds: number;
  pendingEvents: SimEvent[];
  activeEvent: { type: SimEvent['type']; elapsed: number; duration: number } | null;
}

const runtime = new Map<string, RuntimeState>();

const VENT_ACH: Record<RoomConfig['ventType'], number> = {
  none: 0.2,
  natural: 1.0,
  fan: 4.0,
  ac: 6.0,
};
const PENETRATION = 0.6;

function getOccupancyForHour(sched: OccupancyBin[], hour: number): number {
  const exact = sched.find((b) => b.hour === hour);
  if (exact) return exact.count;
  const sorted = [...sched].sort((a, b) => a.hour - b.hour);
  const before = [...sorted].reverse().find((b) => b.hour <= hour);
  const after = sorted.find((b) => b.hour > hour);
  if (before && after) {
    const span = after.hour - before.hour;
    const t = (hour - before.hour) / span;
    return before.count + (after.count - before.count) * t;
  }
  return before?.count ?? after?.count ?? 0;
}

function buildReading(
  occupancy: number,
  room: RoomConfig,
  activeEvent: RuntimeState['activeEvent'],
): RawReading {
  // CO2 mass-balance steady-state estimate.
  // Outdoor CO2 = 420 ppm. Each occupant emits ~17 L/hr CO2.
  // Effective dilution = ACH * room_volume_L.
  const volumeL = room.width_ft * room.height_ft * room.ceiling_ft * 28.3168;
  const ach = VENT_ACH[room.ventType];
  const generationLpHr = occupancy * 17;
  const dilutionLpHr = Math.max(0.05, ach) * volumeL;
  const co2Steady = 420 + (generationLpHr / dilutionLpHr) * 1_000_000; // ppm

  // Indoor PM2.5 = penetration * outdoor PM, plus any indoor events.
  let pm25 = PENETRATION * room.outdoorPM25 + 5; // 5 µg/m³ baseline
  let voc = 30 + occupancy * 12;

  if (activeEvent) {
    const phase = Math.sin((activeEvent.elapsed / activeEvent.duration) * Math.PI);
    if (activeEvent.type === 'dust') pm25 += 60 * phase;
    if (activeEvent.type === 'combustion') {
      pm25 += 80 * phase;
      voc += 90 * phase;
    }
    if (activeEvent.type === 'chemical') voc += 220 * phase;
  }

  // Indoor temperature drifts toward outdoor by HVAC strength.
  const tempBase = room.ventType === 'ac'
    ? 23
    : room.ventType === 'fan'
    ? room.outdoorTemp - 1
    : (room.outdoorTemp + 24) / 2;
  const rhBase = (room.outdoorRH + 50) / 2;

  return {
    pm1:      Math.max(0, addGaussianNoise(pm25 * 0.7, 1.5)),
    pm25:     Math.max(0, addGaussianNoise(pm25, 3)),
    pm10:     Math.max(0, addGaussianNoise(pm25 * 1.5, 4)),
    co2:      Math.max(400, addGaussianNoise(co2Steady, 40)),
    tvoc:     Math.max(0, addGaussianNoise(voc, 8)),
    temp_bme: addGaussianNoise(tempBase, 0.5),
    rh_bme:   Math.min(100, Math.max(0, addGaussianNoise(rhBase, 3))),
    pressure: addGaussianNoise(1013.2, 0.5),
    temp_scd: addGaussianNoise(tempBase + 0.2, 0.5),
    rh_scd:   Math.min(100, Math.max(0, addGaussianNoise(rhBase + 0.5, 3))),
  };
}

async function persistAndEmit(
  nodeId: string,
  raw: RawReading,
  profileKey: string,
  roomVolumeLiters: number,
): Promise<void> {
  const processed = await runAlgorithmPipeline(nodeId, raw, profileKey, SIM_INTERVAL_SECONDS, roomVolumeLiters);

  await prisma.reading.create({
    data: {
      nodeId,
      simulated: true,
      pm1_raw: raw.pm1,
      pm25_raw: raw.pm25,
      pm10_raw: raw.pm10,
      co2_raw: raw.co2,
      tvoc_raw: raw.tvoc,
      temp_bme: raw.temp_bme,
      rh_bme: raw.rh_bme,
      pressure_hpa: raw.pressure ?? null,
      temp_scd: raw.temp_scd ?? null,
      rh_scd: raw.rh_scd ?? null,
    },
  });

  await prisma.processedData.create({
    data: {
      nodeId,
      simulated: true,
      pm25_filtered: processed.pm25_filtered,
      co2_filtered: processed.co2_filtered,
      voc_filtered: processed.voc_filtered,
      temp_filtered: processed.temp_filtered,
      rh_filtered: processed.rh_filtered,
      pm25_corrected: processed.pm25_corrected,
      crossValidOk: processed.crossValidOk,
      reliability_pm25: processed.reliability_pm25,
      reliability_co2:  processed.reliability_co2,
      reliability_voc:  processed.reliability_voc,
      deps_aqi: processed.deps_aqi,
      celi_score:   processed.celi_score,
      celi_weights: processed.celi_weights as unknown as Prisma.InputJsonValue,
      epa_aqi: processed.epa_aqi,
      profile_used: processed.profile_used,
      direct_burden:        processed.direct_burden,
      interaction_burden:   processed.interaction_burden,
      total_burden:         processed.total_burden,
      dominant_interaction: processed.dominant_interaction,
      interaction_details:  processed.interaction_details as unknown as Prisma.InputJsonValue,
      temporal_memory_pm:  processed.temporal_memory_pm,
      temporal_memory_co2: processed.temporal_memory_co2,
      temporal_memory_voc: processed.temporal_memory_voc,
      cognitive_burden:    processed.cognitive_burden,
      recovery_status:     processed.recovery_status,
      cpis_instantaneous:  processed.cpis_instantaneous,
      cpis: processed.cpis,
      ced_pm25: processed.ced_pm25,
      ced_co2: processed.ced_co2,
      thermal_pmv: processed.thermal_pmv ?? null,
      pm25_pred_30m: processed.pm25_pred_30m ?? null,
      co2_pred_30m: processed.co2_pred_30m ?? null,
      trend_slope: processed.trend_slope ?? null,
      event_type: processed.event_type ?? null,
      event_confidence: processed.event_confidence ?? null,
      anomaly_score: processed.anomaly_score ?? null,
      occupancy_est: processed.occupancy_est ?? null,
      ventilation_cmd: processed.ventilation_cmd ?? null,
      pid_output: processed.pid_output ?? null,
      who_pass: processed.who_pass ?? null,
      epa_pass: processed.epa_pass ?? null,
      bnaaqs_pass: processed.bnaaqs_pass ?? null,
      ashrae_pass: processed.ashrae_pass ?? null,
      well_pass: processed.well_pass ?? null,
      reset_pass: processed.reset_pass ?? null,
      alert_level: processed.alert_level,
      explanation_text: processed.explanation_text,
    },
  });

  emitSensorUpdate(nodeId, raw, processed);
}

export async function startSimulation(simulationId: string): Promise<void> {
  const sim = await prisma.simulation.findUnique({ where: { id: simulationId } });
  if (!sim) throw new Error('Simulation not found');
  if (runtime.has(simulationId)) return;

  const room = sim.roomConfig as unknown as RoomConfig;
  const sched = sim.occupancySched as unknown as OccupancyBin[];
  const events = sim.events as unknown as SimEvent[];
  const simNodeIds = sim.simNodeIds as unknown as string[];
  const profileKey = sim.profile;
  const speed = sim.speed;
  const volumeL = room.width_ft * room.height_ft * room.ceiling_ft * 28.3168;

  const state: RuntimeState = {
    ticker: null,
    simTimeSeconds: sim.simulatedTime,
    pendingEvents: [...events],
    activeEvent: null,
  };

  state.ticker = setInterval(() => {
    state.simTimeSeconds += speed; // 1 wall-clock second = `speed` simulated seconds

    // Only emit a sensor reading every SIM_INTERVAL_SECONDS of simulated time
    if (Math.floor(state.simTimeSeconds / SIM_INTERVAL_SECONDS)
        === Math.floor((state.simTimeSeconds - speed) / SIM_INTERVAL_SECONDS)) {
      return;
    }

    const totalMinutes = Math.floor(state.simTimeSeconds / 60);
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    const occupancy = getOccupancyForHour(sched, hour);

    // Activate a pending event if its time has come
    if (!state.activeEvent) {
      const idx = state.pendingEvents.findIndex(
        (e) => e.hour === hour && Math.abs(e.minute - minute) < 1,
      );
      if (idx !== -1) {
        const ev = state.pendingEvents.splice(idx, 1)[0];
        state.activeEvent = { type: ev.type, elapsed: 0, duration: 30 };
        logger.info({ simulationId, type: ev.type, hour, minute }, 'sim event started');
      }
    }
    if (state.activeEvent) {
      state.activeEvent.elapsed++;
      if (state.activeEvent.elapsed >= state.activeEvent.duration) state.activeEvent = null;
    }

    for (const nodeId of simNodeIds) {
      const reading = buildReading(occupancy, room, state.activeEvent);
      void persistAndEmit(nodeId, reading, profileKey, volumeL).catch((err) => {
        logger.error({ err, simulationId, nodeId }, 'sim persist failed');
      });
    }

    // Persist sim time every 30 sim-seconds so resume picks up where it left off
    if (Math.floor(state.simTimeSeconds) % 30 === 0) {
      void prisma.simulation
        .update({ where: { id: simulationId }, data: { simulatedTime: state.simTimeSeconds } })
        .catch(() => undefined);
    }
  }, TICK_INTERVAL_MS);

  runtime.set(simulationId, state);
  await prisma.simulation.update({
    where: { id: simulationId },
    data: { status: 'running', startedAt: sim.startedAt ?? new Date(), pausedAt: null },
  });
}

export async function pauseSimulation(simulationId: string): Promise<void> {
  const state = runtime.get(simulationId);
  if (state?.ticker) {
    clearInterval(state.ticker);
    state.ticker = null;
  }
  runtime.delete(simulationId);
  await prisma.simulation.update({
    where: { id: simulationId },
    data: { status: 'paused', pausedAt: new Date(), simulatedTime: state?.simTimeSeconds ?? 0 },
  });
}

export async function resetSimulation(simulationId: string): Promise<{ deletedReadings: number; deletedProcessed: number }> {
  const state = runtime.get(simulationId);
  if (state?.ticker) clearInterval(state.ticker);
  runtime.delete(simulationId);

  const sim = await prisma.simulation.findUnique({ where: { id: simulationId } });
  if (!sim) return { deletedReadings: 0, deletedProcessed: 0 };
  const simNodeIds = sim.simNodeIds as unknown as string[];

  const [r, p] = await Promise.all([
    prisma.reading.deleteMany({ where: { nodeId: { in: simNodeIds }, simulated: true } }),
    prisma.processedData.deleteMany({ where: { nodeId: { in: simNodeIds }, simulated: true } }),
  ]);

  await prisma.simulation.update({
    where: { id: simulationId },
    data: { status: 'created', simulatedTime: 0, startedAt: null, pausedAt: null },
  });

  return { deletedReadings: r.count, deletedProcessed: p.count };
}

export async function injectEvent(simulationId: string, type: SimEvent['type']): Promise<void> {
  const state = runtime.get(simulationId);
  if (!state) throw new Error('Simulation is not running');
  state.activeEvent = { type, elapsed: 0, duration: 30 };
  logger.info({ simulationId, type }, 'sim event injected (live)');
}

export function getSimulationStatus(simulationId: string): {
  running: boolean;
  simTimeSeconds: number;
  activeEvent: RuntimeState['activeEvent'];
  pendingEventCount: number;
} | null {
  const state = runtime.get(simulationId);
  if (!state) return null;
  return {
    running: !!state.ticker,
    simTimeSeconds: state.simTimeSeconds,
    activeEvent: state.activeEvent,
    pendingEventCount: state.pendingEvents.length,
  };
}

export async function provisionSimulation(input: {
  userId: string;
  name: string;
  roomConfig: RoomConfig;
  nodePositions: NodePosition[];
  occupancySched: OccupancyBin[];
  events: SimEvent[];
  profile: string;
  speed: number;
}): Promise<{ id: string; simNodeIds: string[] }> {
  const sim = await prisma.simulation.create({
    data: {
      userId: input.userId,
      name: input.name,
      roomConfig: input.roomConfig as unknown as Prisma.InputJsonValue,
      nodePositions: input.nodePositions as unknown as Prisma.InputJsonValue,
      occupancySched: input.occupancySched as unknown as Prisma.InputJsonValue,
      events: input.events as unknown as Prisma.InputJsonValue,
      profile: input.profile,
      speed: input.speed,
      simNodeIds: [] as unknown as Prisma.InputJsonValue,
    },
  });

  const simNodeIds: string[] = [];
  for (let i = 0; i < input.nodePositions.length; i++) {
    const nodeId = `SIM-${sim.id.slice(0, 6)}-N${i + 1}`;
    simNodeIds.push(nodeId);
    await prisma.node.upsert({
      where: { nodeId },
      create: {
        nodeId,
        name: `Sim Node ${i + 1}`,
        posX: input.nodePositions[i].x,
        posY: input.nodePositions[i].y,
        posZ: input.nodePositions[i].z,
        isOnline: false,
        firmware: 'sim-1.0',
        connectivity: 'wifi',
        dataSource: 'simulation',
      },
      update: { dataSource: 'simulation' },
    });
  }

  await prisma.simulation.update({
    where: { id: sim.id },
    data: { simNodeIds: simNodeIds as unknown as Prisma.InputJsonValue },
  });

  return { id: sim.id, simNodeIds };
}

export async function deleteSimulation(simulationId: string): Promise<void> {
  await resetSimulation(simulationId).catch(() => undefined);
  const sim = await prisma.simulation.findUnique({ where: { id: simulationId } });
  if (sim) {
    const simNodeIds = sim.simNodeIds as unknown as string[];
    await prisma.node.deleteMany({ where: { nodeId: { in: simNodeIds } } });
    await prisma.simulation.delete({ where: { id: simulationId } });
  }
}
