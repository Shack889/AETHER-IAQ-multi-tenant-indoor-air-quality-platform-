import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { DEPS_PROFILES } from '@aether/shared';
import { calcCELI } from '../algorithms/layer2-celi';
import { INTERACTION_COEFFICIENTS } from '../algorithms/layer-pibt';
import { logger } from '../utils/logger';
import { userOwnsNode, userOwnsRoom, getUserNodeIds } from '../utils/ownership';
import { getMqttClient, publishMqtt } from '../config/mqtt';
import { isMockPaused, setMockPaused, dropMockNode } from '../mqtt/mockGenerator';
import { emitDataSourceChanged } from '../websocket/emitter';

const router = Router();

/** Derive the human-readable source state from the two flags + dataSource. */
function describeSource(
  mockEnabled: boolean,
  hardwareEnabled: boolean,
  dataSource: string,
): 'mock' | 'live' | 'simulation' | 'mixed' | 'paused' {
  if (dataSource === 'simulation') return 'simulation';
  if (mockEnabled && hardwareEnabled) return 'mixed';
  if (mockEnabled) return 'mock';
  if (hardwareEnabled) return 'live';
  return 'paused';
}

/** GET /api/config/mock-paused — runtime state of the mock generator pause flag */
router.get('/config/mock-paused', (_req: Request, res: Response) => {
  return res.json({ success: true, data: { paused: isMockPaused() } });
});

/** POST /api/config/mock-paused — pause/resume the mock generator without restart */
router.post('/config/mock-paused', (req: Request, res: Response) => {
  const { paused } = req.body as { paused?: boolean };
  if (typeof paused !== 'boolean') {
    return res.status(400).json({ success: false, message: 'paused (boolean) required' });
  }
  setMockPaused(paused);
  return res.json({ success: true, data: { paused } });
});

async function recomputeRoomDeps(roomId: string, profileKey: string): Promise<number> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { nodes: { select: { nodeId: true } } },
  });
  if (!room || room.nodes.length === 0) return 0;
  const nodeIds = room.nodes.map((n) => n.nodeId);
  const rows = await prisma.processedData.findMany({
    where: { nodeId: { in: nodeIds } },
    select: { id: true, pm25_corrected: true, co2_filtered: true, voc_filtered: true },
  });
  let updated = 0;
  for (const row of rows) {
    const { celi_score, celi_weights, profile_used } = calcCELI(profileKey, row.pm25_corrected, row.co2_filtered, row.voc_filtered);
    await prisma.processedData.update({
      where: { id: row.id },
      data: {
        deps_aqi:     celi_score,
        celi_score,
        celi_weights: celi_weights as unknown as Prisma.InputJsonValue,
        profile_used,
      },
    });
    updated++;
  }
  logger.info({ roomId, profileKey, updated }, 'recomputed historical DEPS');
  return updated;
}

/** GET /api/nodes — only nodes belonging to the user's rooms */
router.get('/nodes', async (req: Request, res: Response) => {
  try {
    const nodes = await prisma.node.findMany({
      where: { room: { userId: req.userId } },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ success: true, data: nodes });
  } catch (err) {
    logger.error({ err }, 'GET /nodes failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/nodes — register a node and auto-link to the user's first room */
router.post('/nodes', async (req: Request, res: Response) => {
  try {
    const { nodeId, name, roomId } = req.body as { nodeId: string; name?: string; roomId?: string };
    if (!nodeId) return res.status(400).json({ success: false, message: 'nodeId is required' });

    if (roomId && !(await userOwnsRoom(req.userId, roomId))) {
      return res.status(403).json({ success: false, message: 'Room does not belong to user' });
    }

    let resolvedRoomId = roomId;
    if (!resolvedRoomId) {
      const room = await prisma.room.findFirst({ where: { userId: req.userId } });
      resolvedRoomId = room?.id;
    }

    const node = await prisma.node.upsert({
      where: { nodeId },
      create: { nodeId, name: name ?? nodeId, roomId: resolvedRoomId ?? null },
      update: { name: name ?? undefined, roomId: resolvedRoomId ?? undefined },
    });
    return res.status(201).json({ success: true, data: node });
  } catch (err) {
    logger.error({ err }, 'POST /nodes failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** PUT /api/nodes/:nodeId */
router.put('/nodes/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { name, roomId, posX, posY, posZ, dataSource, mockEnabled, hardwareEnabled } = req.body as {
      name?: string; roomId?: string; posX?: number; posY?: number; posZ?: number;
      dataSource?: 'mock' | 'live' | 'simulation';
      mockEnabled?: boolean;
      hardwareEnabled?: boolean;
    };
    if (roomId && !(await userOwnsRoom(req.userId, roomId))) {
      return res.status(403).json({ success: false, message: 'Target room not owned by user' });
    }
    if (dataSource && !['mock', 'live', 'simulation'].includes(dataSource)) {
      return res.status(400).json({ success: false, message: 'invalid dataSource' });
    }
    const before = await prisma.node.findUnique({ where: { nodeId } });
    // Simulation nodes are immutable — sim engine owns their flags entirely.
    if (before?.dataSource === 'simulation') {
      if (dataSource && dataSource !== 'simulation') {
        return res.status(400).json({ success: false, message: 'Simulation nodes cannot change data source' });
      }
      if (mockEnabled !== undefined || hardwareEnabled !== undefined) {
        return res.status(400).json({ success: false, message: 'Simulation nodes cannot toggle source flags' });
      }
    }
    // Guard against enabling Hardware when the MQTT broker isn't connected —
    // the flag would be meaningless. UI should pre-check, but defense in depth.
    if (hardwareEnabled === true && before?.hardwareEnabled === false) {
      const client = getMqttClient();
      if (!client?.connected) {
        return res.status(409).json({
          success: false,
          code: 'broker_disconnected',
          message: 'MQTT broker is not connected — connect a broker (or your ESP32 hardware) before enabling Hardware ingestion.',
        });
      }
    }
    // Auto-sync the legacy `dataSource` label when flags change so the Topbar
    // and other display surfaces stay accurate without each caller having to
    // pass dataSource explicitly.
    let nextDataSource = dataSource ?? before?.dataSource ?? 'live';
    if (before?.dataSource !== 'simulation' && !dataSource) {
      const nextMock = mockEnabled     ?? before?.mockEnabled     ?? false;
      const nextHw   = hardwareEnabled ?? before?.hardwareEnabled ?? true;
      if (nextMock && !nextHw) nextDataSource = 'mock';
      else if (!nextMock && nextHw) nextDataSource = 'live';
      else if (nextMock && nextHw) nextDataSource = 'mock';
      // both false → leave dataSource as it was so display shows last active state
    }

    const node = await prisma.node.update({
      where: { nodeId },
      data: {
        name:            name            ?? undefined,
        roomId:          roomId          ?? undefined,
        posX:            posX            ?? undefined,
        posY:            posY            ?? undefined,
        posZ:            posZ            ?? undefined,
        dataSource:      nextDataSource,
        mockEnabled:     mockEnabled     ?? undefined,
        hardwareEnabled: hardwareEnabled ?? undefined,
      },
    });

    // If the user just turned mock OFF, drop the node from the mock generator's
    // active list immediately rather than waiting for the 5s refresh.
    if (mockEnabled === false && before?.mockEnabled) dropMockNode(nodeId);

    // Emit a dataSourceChanged event for any meaningful transition so badges
    // and toasts update in real time across every tab.
    if (before) {
      const prevLabel = describeSource(before.mockEnabled, before.hardwareEnabled, before.dataSource);
      const nextLabel = describeSource(
        mockEnabled     ?? before.mockEnabled,
        hardwareEnabled ?? before.hardwareEnabled,
        dataSource      ?? before.dataSource,
      );
      if (prevLabel !== nextLabel) {
        emitDataSourceChanged({
          nodeId,
          previous: prevLabel,
          next: nextLabel,
          reason: 'manual',
          timestamp: new Date().toISOString(),
        });
      }
    }
    return res.json({ success: true, data: node });
  } catch (err) {
    logger.error({ err }, 'PUT /nodes/:nodeId failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/nodes/:nodeId/hardware-status — pre-flight check before enabling
 *  hardware ingestion. Tells the UI whether real-hardware data is possible
 *  right now (MQTT broker connected) and whether this specific node has been
 *  publishing recently. */
router.get('/nodes/:nodeId/hardware-status', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const node = await prisma.node.findUnique({ where: { nodeId } });
    if (!node) return res.status(404).json({ success: false, message: 'Node not found' });

    const client = getMqttClient();
    const brokerConnected = client?.connected ?? false;

    // "Recent hardware data" = a non-simulated reading in the last 60 seconds.
    const recent = await prisma.reading.findFirst({
      where: {
        nodeId,
        simulated: false,
        timestamp: { gte: new Date(Date.now() - 60_000) },
      },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });

    // canEnable: we allow turning Hardware ON only when the broker is up.
    // (Otherwise the flag would be meaningless — no real hardware can possibly
    // publish to a disconnected broker.)
    const canEnable = brokerConnected;
    const reason = canEnable
      ? null
      : 'MQTT broker is not connected. Real hardware cannot publish until the broker is reachable. '
        + 'In dev mock mode, this is expected — disable MOCK_DATA and configure MQTT_BROKER_URL to accept real ESP32 data.';

    return res.json({
      success: true,
      data: {
        brokerConnected,
        hasRecentHardwareData: !!recent,
        lastHardwareReadingAt: recent?.timestamp.toISOString() ?? null,
        canEnable,
        reason,
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /nodes/:nodeId/hardware-status failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/nodes/:nodeId/cmd — downstream MQTT command */
router.post('/nodes/:nodeId/cmd', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { command } = req.body as { command?: string };
    const allowed = ['reboot', 'recalibrate', 'toggle_ventilation'];
    if (!command || !allowed.includes(command)) {
      return res.status(400).json({ success: false, message: `command must be one of ${allowed.join(', ')}` });
    }

    const client = getMqttClient();
    if (!client?.connected) {
      return res.status(503).json({
        success: false,
        message: 'MQTT broker not connected — commands cannot be delivered in mock mode',
      });
    }

    const topic = `aether/${req.userId}/${nodeId}/cmd`;
    publishMqtt(topic, { command, ts: new Date().toISOString() });
    logger.info({ topic, command, nodeId, userId: req.userId }, 'mqtt command published');
    return res.json({ success: true, data: { topic, command } });
  } catch (err) {
    logger.error({ err }, 'POST /nodes/:nodeId/cmd failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** DELETE /api/nodes/:nodeId */
router.delete('/nodes/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await prisma.reading.deleteMany({ where: { nodeId } });
    await prisma.processedData.deleteMany({ where: { nodeId } });
    await prisma.alert.deleteMany({ where: { nodeId } });
    await prisma.algorithmState.deleteMany({ where: { nodeId } });
    await prisma.node.delete({ where: { nodeId } });
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /nodes/:nodeId failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/rooms — only the user's rooms */
router.get('/rooms', async (req: Request, res: Response) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { userId: req.userId },
      include: { nodes: { select: { nodeId: true, name: true, isOnline: true } } },
    });
    return res.json({ success: true, data: rooms });
  } catch (err) {
    logger.error({ err }, 'GET /rooms failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/rooms — owned by the calling user */
router.post('/rooms', async (req: Request, res: Response) => {
  try {
    const { name, width_ft, height_ft, ceiling_ft, maxOccupancy, profile } = req.body as {
      name?: string; width_ft?: number; height_ft?: number; ceiling_ft?: number;
      maxOccupancy?: number; profile?: string;
    };
    if (!name) return res.status(400).json({ success: false, message: 'name required' });

    // Ensure the User row exists so the FK doesn't blow up for fresh accounts
    await prisma.user.upsert({
      where: { id: req.userId },
      create: { id: req.userId, email: `${req.userId}@aether-iaq.local`, name: 'AETHER User' },
      update: {},
    });

    const room = await prisma.room.create({
      data: {
        name,
        width_ft:     width_ft     ?? 22,
        height_ft:    height_ft    ?? 22,
        ceiling_ft:   ceiling_ft   ?? 10,
        maxOccupancy: maxOccupancy ?? 10,
        profile:      profile      ?? 'OFFICE_OPEN',
        userId:       req.userId,
      },
    });
    return res.status(201).json({ success: true, data: room });
  } catch (err) {
    logger.error({ err }, 'POST /rooms failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** PUT /api/rooms/:roomId */
router.put('/rooms/:roomId', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    if (!(await userOwnsRoom(req.userId, roomId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { name, width_ft, height_ft, ceiling_ft, maxOccupancy, profile, alertThresholds } = req.body as {
      name?: string; width_ft?: number; height_ft?: number; ceiling_ft?: number;
      maxOccupancy?: number;
      profile?: string; alertThresholds?: Record<string, unknown>;
    };
    const existing = await prisma.room.findUnique({ where: { id: roomId } });
    const room = await prisma.room.update({
      where: { id: roomId },
      data: {
        name, width_ft, height_ft, ceiling_ft, maxOccupancy, profile,
        ...(alertThresholds !== undefined ? { alertThresholds: alertThresholds as Prisma.InputJsonValue } : {}),
      },
    });
    let recomputedRows = 0;
    if (profile && existing && existing.profile !== profile) {
      recomputedRows = await recomputeRoomDeps(roomId, profile);
    }
    return res.json({ success: true, data: room, recomputedRows });
  } catch (err) {
    logger.error({ err }, 'PUT /rooms/:roomId failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** DELETE /api/rooms/:roomId */
router.delete('/rooms/:roomId', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    if (!(await userOwnsRoom(req.userId, roomId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await prisma.node.updateMany({ where: { roomId }, data: { roomId: null } });
    await prisma.room.delete({ where: { id: roomId } });
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /rooms/:roomId failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/profiles */
router.get('/profiles', (_req: Request, res: Response) => {
  return res.json({ success: true, data: Object.values(DEPS_PROFILES) });
});

/** GET /api/interactions/coefficients — PIBT coefficients with labels & explanations */
router.get('/interactions/coefficients', (_req: Request, res: Response) => {
  const data = Object.entries(INTERACTION_COEFFICIENTS).map(([pair, c]) => ({
    pair,
    alpha: c.alpha,
    label: c.label,
    explanation: c.explanation,
  }));
  return res.json({ success: true, data });
});

/** POST /api/config/profile */
router.post('/config/profile', async (req: Request, res: Response) => {
  try {
    const { roomId, profileKey } = req.body as { roomId: string; profileKey: string };
    if (!roomId || !profileKey) {
      return res.status(400).json({ success: false, message: 'roomId and profileKey required' });
    }
    if (!DEPS_PROFILES[profileKey]) {
      return res.status(400).json({ success: false, message: 'Invalid profile key' });
    }
    if (!(await userOwnsRoom(req.userId, roomId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const existing = await prisma.room.findUnique({ where: { id: roomId } });
    const room = await prisma.room.update({
      where: { id: roomId },
      data: { profile: profileKey },
    });
    let recomputedRows = 0;
    if (existing && existing.profile !== profileKey) {
      recomputedRows = await recomputeRoomDeps(roomId, profileKey);
    }
    return res.json({ success: true, data: room, recomputedRows });
  } catch (err) {
    logger.error({ err }, 'POST /config/profile failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/compliance/history/:nodeId?from=&to= — compliance time series */
router.get('/compliance/history/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { from, to } = req.query as Record<string, string>;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const toDate   = to   ? new Date(to)   : new Date();

    const rows = await prisma.processedData.findMany({
      where: { nodeId, timestamp: { gte: fromDate, lte: toDate } },
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true, alert_level: true,
        who_pass: true, epa_pass: true, bnaaqs_pass: true,
        ashrae_pass: true, well_pass: true, reset_pass: true,
      },
      take: 10000,
    });
    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    logger.error({ err }, 'GET /compliance/history failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/compliance/:nodeId */
router.get('/compliance/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const latest = await prisma.processedData.findFirst({
      where: { nodeId },
      orderBy: { timestamp: 'desc' },
      select: {
        who_pass: true, epa_pass: true, bnaaqs_pass: true,
        ashrae_pass: true, well_pass: true, reset_pass: true,
        alert_level: true, deps_aqi: true, epa_aqi: true,
        pm25_corrected: true, co2_filtered: true, timestamp: true,
      },
    });
    if (!latest) return res.status(404).json({ success: false, message: 'No data found' });
    return res.json({ success: true, data: latest });
  } catch (err) {
    logger.error({ err }, 'GET /compliance failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/alerts — all alerts across the user's nodes */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const nodeIds = await getUserNodeIds(req.userId);
    if (nodeIds.length === 0) return res.json({ success: true, data: [] });
    const onlyUnack = req.query['unack'] === 'true';
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    const alerts = await prisma.alert.findMany({
      where: { nodeId: { in: nodeIds }, ...(onlyUnack ? { acknowledged: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return res.json({ success: true, data: alerts });
  } catch (err) {
    logger.error({ err }, 'GET /alerts (all) failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/alerts/:nodeId */
router.get('/alerts/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    const alerts = await prisma.alert.findMany({
      where: { nodeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return res.json({ success: true, data: alerts });
  } catch (err) {
    logger.error({ err }, 'GET /alerts failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/alerts/:alertId/ack */
router.post('/alerts/:alertId/ack', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const alert = await prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    if (!(await userOwnsNode(req.userId, alert.nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const updated = await prisma.alert.update({
      where: { id: alertId },
      data: { acknowledged: true },
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    logger.error({ err }, 'POST /alerts/:alertId/ack failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/alerts/ack-all — acknowledge every unack'd alert for this user */
router.post('/alerts/ack-all', async (req: Request, res: Response) => {
  try {
    const nodeIds = await getUserNodeIds(req.userId);
    if (nodeIds.length === 0) return res.json({ success: true, data: { acknowledged: 0 } });
    const result = await prisma.alert.updateMany({
      where: { nodeId: { in: nodeIds }, acknowledged: false },
      data: { acknowledged: true },
    });
    return res.json({ success: true, data: { acknowledged: result.count } });
  } catch (err) {
    logger.error({ err }, 'POST /alerts/ack-all failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/baselines/:nodeId */
router.get('/baselines/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const baselines = await prisma.baselinePattern.findMany({
      where: { nodeId },
      orderBy: [{ dayOfWeek: 'asc' }, { binIndex: 'asc' }],
    });
    return res.json({ success: true, data: baselines });
  } catch (err) {
    logger.error({ err }, 'GET /baselines failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
