import { Router, Request, Response } from 'express';
import { getLatestReal } from '../reports/dataAccess';
import { allGuidance, allWithinGuidelines, atRiskNote } from '../reports/guidance';
import { HEALTH_DISCLAIMER } from '../reports/constants';
import { userOwnsNode } from '../utils/ownership';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/health-guidance/:nodeId — realtime occupant guidance from the latest
 * REAL reading (simulated=false). Per-pollutant plain-language status + one basic
 * environmental action, a cited non-medical at-risk note, and the mandatory
 * disclaimer. Environmental information only — never medical advice. When there
 * is no real reading it returns hasData=false so the UI shows "waiting for live
 * readings" instead of guidance over simulated/empty data.
 */
router.get('/health-guidance/:nodeId', async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    if (!(await userOwnsNode(req.userId, nodeId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const latest = await getLatestReal([nodeId]);
    if (!latest) {
      return res.json({ success: true, data: { hasData: false, disclaimer: HEALTH_DISCLAIMER } });
    }
    const guidance = allGuidance({ pm25: latest.pm25, co2: latest.co2, voc: latest.voc });
    return res.json({
      success: true,
      data: {
        hasData: true,
        timestamp: latest.timestamp.toISOString(),
        freshnessMin: Math.round((Date.now() - latest.timestamp.getTime()) / 60000),
        guidance,
        allGood: allWithinGuidelines(guidance),
        atRisk: atRiskNote(guidance),
        disclaimer: HEALTH_DISCLAIMER,
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /health-guidance failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
