import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { processLayer7 } from '../algorithms';
import { logger } from '../utils/logger';
import { userOwnsNode } from '../utils/ownership';

const router = Router();

/** GET /api/data/latest/:nodeId */
router.get('/latest/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const latest = await prisma.processedData.findFirst({
      where: { nodeId },
      orderBy: { timestamp: 'desc' },
    });

    if (!latest) {
      return res.status(404).json({ success: false, message: 'No data found for node' });
    }

    return res.json({ success: true, data: latest });
  } catch (err) {
    logger.error({ err }, 'GET /data/latest failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/data/history/:nodeId?from=&to=&interval= */
router.get('/history/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { from, to } = req.query as Record<string, string>;

    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 3600 * 1000);
    const toDate   = to   ? new Date(to)   : new Date();

    const data = await prisma.processedData.findMany({
      where: {
        nodeId,
        timestamp: { gte: fromDate, lte: toDate },
      },
      orderBy: { timestamp: 'asc' },
      take: 2000,
    });

    return res.json({ success: true, data, count: data.length });
  } catch (err) {
    logger.error({ err }, 'GET /data/history failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/data/readings/:nodeId — raw readings */
router.get('/readings/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const page = Number(req.query['page'] ?? 1);
    const limit = Math.min(Number(req.query['limit'] ?? 100), 500);

    const [data, total] = await Promise.all([
      prisma.reading.findMany({
        where: { nodeId },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.reading.count({ where: { nodeId } }),
    ]);

    return res.json({ success: true, data, total, page, limit });
  } catch (err) {
    logger.error({ err }, 'GET /data/readings failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/data/stats/:nodeId?from=&to= — summary statistics per parameter */
router.get('/stats/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { from, to } = req.query as Record<string, string>;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 3600 * 1000);
    const toDate   = to   ? new Date(to)   : new Date();

    const rows = await prisma.processedData.findMany({
      where: { nodeId, timestamp: { gte: fromDate, lte: toDate } },
      orderBy: { timestamp: 'asc' },
      select: {
        pm25_corrected: true, co2_filtered: true, voc_filtered: true,
        temp_filtered: true, rh_filtered: true, cpis: true, deps_aqi: true,
        cognitive_burden: true, total_burden: true,
      },
      take: 10000,
    });

    const summarize = (vals: number[]) => {
      if (vals.length === 0) return { count: 0, mean: 0, min: 0, max: 0, std: 0, p50: 0, p90: 0, p95: 0 };
      const sorted = [...vals].sort((a, b) => a - b);
      const sum = vals.reduce((a, b) => a + b, 0);
      const mean = sum / vals.length;
      const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length;
      const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
      const round = (n: number) => Math.round(n * 1000) / 1000;
      return {
        count: vals.length,
        mean: round(mean), min: round(sorted[0]), max: round(sorted[sorted.length - 1]),
        std: round(Math.sqrt(variance)),
        p50: round(pct(50)), p90: round(pct(90)), p95: round(pct(95)),
      };
    };

    const data = {
      nodeId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      sampleCount: rows.length,
      pm25:     summarize(rows.map((r) => r.pm25_corrected)),
      co2:      summarize(rows.map((r) => r.co2_filtered)),
      voc:      summarize(rows.map((r) => r.voc_filtered)),
      temp:     summarize(rows.map((r) => r.temp_filtered)),
      rh:       summarize(rows.map((r) => r.rh_filtered)),
      cpis:     summarize(rows.map((r) => r.cpis)),
      deps_aqi: summarize(rows.map((r) => r.deps_aqi)),
      celi_score:       summarize(rows.map((r) => r.deps_aqi)),
      cognitive_burden: summarize(rows.map((r) => r.cognitive_burden ?? 0)),
      total_burden:     summarize(rows.map((r) => r.total_burden ?? 0)),
    };

    return res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'GET /data/stats failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/data/spatial/:nodeId */
router.get('/spatial/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const latest = await prisma.processedData.findFirst({
      where: { nodeId },
      orderBy: { timestamp: 'desc' },
    });
    const node = await prisma.node.findUnique({ where: { nodeId } });

    if (!latest || !node) {
      return res.status(404).json({ success: false, message: 'Node not found' });
    }

    const zones = processLayer7({
      pm25:     latest.pm25_corrected,
      co2:      latest.co2_filtered,
      voc:      latest.voc_filtered,
      deps_aqi: latest.deps_aqi,
      nodeX:    node.posX ?? 0.5,
      nodeY:    node.posY ?? 0.5,
    });

    return res.json({ success: true, data: zones });
  } catch (err) {
    logger.error({ err }, 'GET /data/spatial failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
