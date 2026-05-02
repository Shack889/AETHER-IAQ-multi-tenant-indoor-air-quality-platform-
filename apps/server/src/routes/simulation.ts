import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import {
  provisionSimulation,
  startSimulation,
  pauseSimulation,
  resetSimulation,
  deleteSimulation,
  injectEvent,
  getSimulationStatus,
  type RoomConfig,
  type NodePosition,
  type OccupancyBin,
  type SimEvent,
} from '../simulation/engine';

const router = Router();

const DEFAULT_ROOM: RoomConfig = {
  width_ft: 22,
  height_ft: 22,
  ceiling_ft: 10,
  ventType: 'fan',
  outdoorPM25: 18,
  outdoorTemp: 28,
  outdoorRH: 65,
};

const DEFAULT_SCHED: OccupancyBin[] = [
  { hour: 0, count: 0 }, { hour: 6, count: 0 }, { hour: 9, count: 8 },
  { hour: 12, count: 4 }, { hour: 13, count: 8 }, { hour: 17, count: 2 },
  { hour: 20, count: 0 },
];

/** GET /api/simulation — list user simulations */
router.get('/', async (req: Request, res: Response) => {
  try {
    const sims = await prisma.simulation.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: sims });
  } catch (err) {
    logger.error({ err }, 'GET /simulation failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/simulation/create */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      name?: string;
      roomConfig?: Partial<RoomConfig>;
      nodePositions?: NodePosition[];
      occupancySched?: OccupancyBin[];
      events?: SimEvent[];
      profile?: string;
      speed?: number;
    };
    const positions: NodePosition[] = body.nodePositions?.length
      ? body.nodePositions
      : [{ x: 0.5, y: 0.5, z: 0.5 }];
    const result = await provisionSimulation({
      userId: req.userId,
      name: body.name?.trim() || `Simulation ${new Date().toISOString().slice(0, 16)}`,
      roomConfig: { ...DEFAULT_ROOM, ...(body.roomConfig ?? {}) },
      nodePositions: positions,
      occupancySched: body.occupancySched?.length ? body.occupancySched : DEFAULT_SCHED,
      events: body.events ?? [],
      profile: body.profile?.trim() || 'OFFICE_OPEN',
      speed: Math.min(1000, Math.max(1, body.speed ?? 10)),
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.error({ err }, 'POST /simulation/create failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/simulation/start */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.body as { id: string };
    if (!id) return res.status(400).json({ success: false, message: 'id required' });
    await startSimulation(id);
    return res.json({ success: true, data: { id, status: 'running' } });
  } catch (err) {
    logger.error({ err }, 'POST /simulation/start failed');
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

/** POST /api/simulation/pause */
router.post('/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.body as { id: string };
    if (!id) return res.status(400).json({ success: false, message: 'id required' });
    await pauseSimulation(id);
    return res.json({ success: true, data: { id, status: 'paused' } });
  } catch (err) {
    logger.error({ err }, 'POST /simulation/pause failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/simulation/reset */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    const { id } = req.body as { id: string };
    if (!id) return res.status(400).json({ success: false, message: 'id required' });
    const result = await resetSimulation(id);
    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error({ err }, 'POST /simulation/reset failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/simulation/event */
router.post('/event', async (req: Request, res: Response) => {
  try {
    const { id, type } = req.body as { id: string; type: SimEvent['type'] };
    if (!id || !type) return res.status(400).json({ success: false, message: 'id and type required' });
    if (!['dust', 'combustion', 'chemical'].includes(type)) {
      return res.status(400).json({ success: false, message: 'invalid event type' });
    }
    await injectEvent(id, type);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'POST /simulation/event failed');
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

/** GET /api/simulation/status/:id */
router.get('/status/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sim = await prisma.simulation.findUnique({ where: { id } });
    if (!sim) return res.status(404).json({ success: false, message: 'Simulation not found' });
    const runtime = getSimulationStatus(id);
    return res.json({
      success: true,
      data: {
        id: sim.id,
        name: sim.name,
        status: sim.status,
        speed: sim.speed,
        profile: sim.profile,
        simNodeIds: sim.simNodeIds,
        roomConfig: sim.roomConfig,
        occupancySched: sim.occupancySched,
        events: sim.events,
        runtime,
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /simulation/status failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** DELETE /api/simulation/:id */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteSimulation(id);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /simulation/:id failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
