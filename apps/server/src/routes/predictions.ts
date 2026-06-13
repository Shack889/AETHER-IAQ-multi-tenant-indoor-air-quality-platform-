import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { userOwnsNode } from '../utils/ownership';
import { runBacktest } from '../algorithms/backtest';

const router = Router();

/** POST /api/predictions/backtest/:nodeId — walk-forward evaluation of the
 *  30-min forecasters over stored readings. Body: { from?, to? } ISO strings.
 *  Persists MAE/RMSE/skill rows to ForecastMetric and returns the summary. */
router.post('/predictions/backtest/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { from, to } = req.body as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if ((fromDate && isNaN(fromDate.getTime())) || (toDate && isNaN(toDate.getTime()))) {
      return res.status(400).json({ success: false, message: 'invalid from/to' });
    }
    const summary = await runBacktest(nodeId, fromDate, toDate);
    return res.json({ success: true, data: summary });
  } catch (err) {
    logger.error({ err }, 'POST /predictions/backtest failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/predictions/metrics/:nodeId — the most recent backtest's metric
 *  rows (latest windowEnd batch), for the Predictions page table. */
router.get('/predictions/metrics/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const latest = await prisma.forecastMetric.findFirst({
      where: { nodeId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!latest) return res.json({ success: true, data: [] });
    const metrics = await prisma.forecastMetric.findMany({
      where: {
        nodeId,
        // Rows persisted by the same backtest run share a createdAt to within a second.
        createdAt: { gte: new Date(latest.createdAt.getTime() - 2000) },
      },
      orderBy: [{ pollutant: 'asc' }, { profile: 'asc' }, { method: 'asc' }],
    });
    return res.json({ success: true, data: metrics });
  } catch (err) {
    logger.error({ err }, 'GET /predictions/metrics failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
