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

/** GET /api/decay-events/:nodeId — naturally observed CO₂ washout events for a
 *  node, newest first, plus a summary (N, median ACH, IQR) so the collection
 *  campaign can verify λ_CO₂ is being grounded in real data. Read-only. */
router.get('/decay-events/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));

    const events = await prisma.decayEvent.findMany({
      where: { nodeId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    // Summary over ALL events for the node (not just the page), so the median
    // ACH and IQR are stable as the table is paged.
    const achAll = (
      await prisma.decayEvent.findMany({
        where: { nodeId },
        select: { ach_est: true },
        orderBy: { ach_est: 'asc' },
      })
    ).map((e) => e.ach_est);

    const quantile = (sorted: number[], q: number): number => {
      if (sorted.length === 0) return 0;
      const pos = (sorted.length - 1) * q;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      if (lo === hi) return sorted[lo];
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };

    const summary = {
      n: achAll.length,
      medianAch: achAll.length ? Math.round(quantile(achAll, 0.5) * 1000) / 1000 : null,
      iqrLo: achAll.length ? Math.round(quantile(achAll, 0.25) * 1000) / 1000 : null,
      iqrHi: achAll.length ? Math.round(quantile(achAll, 0.75) * 1000) / 1000 : null,
    };

    return res.json({ success: true, data: { events, summary } });
  } catch (err) {
    logger.error({ err }, 'GET /decay-events failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
