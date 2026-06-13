import { RawReading } from '@aether/shared';
import { addGaussianNoise } from '../utils/statistics';
import { handleMqttMessage } from './handler';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

/**
 * Mock data generator — drives every Node where dataSource='mock' through a
 * realistic 24-hour occupancy pattern. Each real second represents 15 simulated
 * seconds, so a full simulated day takes ~96 minutes wall-clock. The active node
 * list is refreshed periodically so toggling a node mock↔live in the UI takes
 * effect without restarting the server.
 */

const SEED_NODE_ID = 'AETHER-N01';
const NODE_REFRESH_INTERVAL_MS = 5_000;

let mockInterval: NodeJS.Timeout | null = null;
let nodeRefreshInterval: NodeJS.Timeout | null = null;
let activeMockNodeIds: string[] = [SEED_NODE_ID];
let globallyPaused = false;

/** Pause/resume the mock generator system-wide without restarting the server. */
export function setMockPaused(paused: boolean): void {
  globallyPaused = paused;
  logger.info({ paused }, 'mock generator pause state changed');
}

export function isMockPaused(): boolean {
  return globallyPaused;
}

/** Drop a node from the mock generator's active list immediately, without
 *  waiting for the next 5s refresh — used when a node is auto-promoted from
 *  mock to live after real hardware is detected. */
export function dropMockNode(nodeId: string): void {
  activeMockNodeIds = activeMockNodeIds.filter((n) => n !== nodeId);
}
let simulatedHour = 8;
let simulatedMinute = 0;
let simulatedSecond = 0;
let lastSimulatedDay = -1;

interface OccupancyState {
  co2_base: number;
  pm25_base: number;
  voc_base: number;
  temp_base: number;
}

function getBaselineForHour(hour: number): OccupancyState {
  if (hour < 6) return { co2_base: 430, pm25_base: 8, voc_base: 30, temp_base: 26 };
  if (hour < 9) {
    const p = (hour - 6) / 3;
    return {
      co2_base:  430 + p * 470,
      pm25_base: 8   + p * 17,
      voc_base:  30  + p * 90,
      temp_base: 26  - p * 1.5,
    };
  }
  if (hour < 12) return { co2_base: 900, pm25_base: 25, voc_base: 120, temp_base: 24.5 };
  if (hour < 13) return { co2_base: 750, pm25_base: 20, voc_base: 90, temp_base: 24.8 };
  if (hour < 17) return { co2_base: 1000, pm25_base: 30, voc_base: 140, temp_base: 25.0 };
  if (hour < 20) {
    const p = (hour - 17) / 3;
    return {
      co2_base:  1000 - p * 570,
      pm25_base: 30   - p * 22,
      voc_base:  140  - p * 110,
      temp_base: 25   + p * 1.0,
    };
  }
  return { co2_base: 430, pm25_base: 8, voc_base: 30, temp_base: 26 };
}

interface DayPlan {
  events: Array<{ hour: number; minute: number; type: 'dust' | 'combustion' | 'chemical' }>;
}

let dayPlan: DayPlan = { events: [] };

function planDayEvents(): DayPlan {
  const events: DayPlan['events'] = [];
  const dustCount = 1 + (Math.random() < 0.5 ? 1 : 0);
  const combustionCount = Math.random() < 0.4 ? 1 : 0;
  const chemicalCount = Math.random() < 0.4 ? 1 : 0;
  const push = (type: 'dust' | 'combustion' | 'chemical') => {
    const hour = 9 + Math.floor(Math.random() * 10);
    const minute = Math.floor(Math.random() * 60);
    events.push({ hour, minute, type });
  };
  for (let i = 0; i < dustCount; i++) push('dust');
  for (let i = 0; i < combustionCount; i++) push('combustion');
  for (let i = 0; i < chemicalCount; i++) push('chemical');
  events.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  return { events };
}

let activeEvent: { type: 'dust' | 'combustion' | 'chemical'; duration: number; elapsed: number } | null = null;

function maybeStartEvent(): void {
  if (activeEvent) return;
  const idx = dayPlan.events.findIndex(
    (e) =>
      e.hour === simulatedHour &&
      Math.abs(e.minute - simulatedMinute) < 1,
  );
  if (idx === -1) return;
  const ev = dayPlan.events.splice(idx, 1)[0];
  activeEvent = { type: ev.type, duration: 30 + Math.floor(Math.random() * 30), elapsed: 0 };
  logger.info({ type: ev.type, hour: simulatedHour, minute: simulatedMinute }, 'mock event started');
}

function generateReading(): RawReading {
  advanceSimulatedTime();
  const baseline = getBaselineForHour(simulatedHour);
  maybeStartEvent();

  let pm25 = baseline.pm25_base;
  let co2 = baseline.co2_base;
  let voc = baseline.voc_base;

  if (activeEvent) {
    activeEvent.elapsed++;
    const intensity = Math.sin((activeEvent.elapsed / activeEvent.duration) * Math.PI);
    if (activeEvent.type === 'dust')       { pm25 += 40 * intensity; }
    if (activeEvent.type === 'combustion') { pm25 += 60 * intensity; voc += 80 * intensity; }
    if (activeEvent.type === 'chemical')   { voc  += 200 * intensity; }
    if (activeEvent.elapsed >= activeEvent.duration) activeEvent = null;
  }

  return {
    pm1:      Math.max(0, addGaussianNoise(pm25 * 0.7, 1.5)),
    pm25:     Math.max(0, addGaussianNoise(pm25, 3)),
    pm10:     Math.max(0, addGaussianNoise(pm25 * 1.5, 4)),
    co2:      Math.max(400, addGaussianNoise(co2, 40)),
    tvoc:     Math.max(0, addGaussianNoise(voc, 8)),
    temp_bme: addGaussianNoise(baseline.temp_base, 0.5),
    rh_bme:   Math.min(100, Math.max(0, addGaussianNoise(55, 3))),
    pressure: addGaussianNoise(1013.2, 0.5),
    temp_scd: addGaussianNoise(baseline.temp_base + 0.2, 0.5),
    rh_scd:   Math.min(100, Math.max(0, addGaussianNoise(55.5, 3))),
    uptime:   simulatedSecond + simulatedMinute * 60 + simulatedHour * 3600,
    wifi_rssi: addGaussianNoise(-45, 3),
    heap_free: 180000 + Math.floor(Math.random() * 10000),
  };
}

function advanceSimulatedTime(): void {
  simulatedSecond += 15;
  while (simulatedSecond >= 60) {
    simulatedSecond -= 60;
    simulatedMinute++;
  }
  while (simulatedMinute >= 60) {
    simulatedMinute -= 60;
    simulatedHour = (simulatedHour + 1) % 24;
    if (simulatedHour === 0) {
      lastSimulatedDay += 1;
      dayPlan = planDayEvents();
      logger.info({ day: lastSimulatedDay, eventCount: dayPlan.events.length }, 'mock day rolled, events scheduled');
    }
  }
}

async function refreshActiveMockNodes(): Promise<void> {
  try {
    const nodes = await prisma.node.findMany({
      where: { mockEnabled: true },
      select: { nodeId: true },
    });
    activeMockNodeIds = nodes.map((n) => n.nodeId);
  } catch (err) {
    logger.warn({ err }, 'failed to refresh mock node list');
  }
}

export function startMockDataGenerator(): void {
  logger.info('mock data generator started');
  dayPlan = planDayEvents();
  lastSimulatedDay = 0;

  void prisma.node
    .upsert({
      where: { nodeId: SEED_NODE_ID },
      create: {
        nodeId: SEED_NODE_ID,
        name: 'Mock Sensor Node',
        isOnline: true,
        lastSeen: new Date(),
        firmware: '1.0.0-mock',
        connectivity: 'wifi',
        dataSource: 'mock',
        mockEnabled: true,
        hardwareEnabled: false,
      },
      update: { isOnline: true, lastSeen: new Date() },
    })
    .then(() => {
      logger.info({ nodeId: SEED_NODE_ID }, 'mock node ready');
      void refreshActiveMockNodes();
    })
    .catch((err) => {
      logger.error({ err }, 'mock node upsert failed at startup');
    });

  nodeRefreshInterval = setInterval(() => {
    void refreshActiveMockNodes();
  }, NODE_REFRESH_INTERVAL_MS);

  mockInterval = setInterval(() => {
    if (globallyPaused) return;
    try {
      const reading = generateReading();
      for (const nodeId of activeMockNodeIds) {
        const topic = `aether/${nodeId}/data`;
        const payload = Buffer.from(JSON.stringify(reading));
        void handleMqttMessage(topic, payload);
      }
    } catch (err) {
      logger.error({ err }, 'mock generator tick failed');
    }
  }, 2000);
}

export function stopMockDataGenerator(): void {
  if (mockInterval) {
    clearInterval(mockInterval);
    mockInterval = null;
  }
  if (nodeRefreshInterval) {
    clearInterval(nodeRefreshInterval);
    nodeRefreshInterval = null;
  }
  logger.info('mock data generator stopped');
}
