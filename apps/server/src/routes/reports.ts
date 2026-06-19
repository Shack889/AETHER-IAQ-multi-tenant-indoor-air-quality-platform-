import { Router, Request, Response } from 'express';
import { ReportMode } from '../reports/constants';
import { applyModeWindow, getRoomsWithRealData, resolveRoomScope } from '../reports/dataAccess';
import { buildAirQualitySummaryDoc } from '../reports/airQualitySummary';
import { generatePdf, ReportDocument } from '../reports/reportEngine';
import { userOwnsRoom } from '../utils/ownership';
import { logger } from '../utils/logger';

const router = Router();

type Builder = (params: {
  scope: Awaited<ReturnType<typeof resolveRoomScope>>;
  from: Date; to: Date; mode: ReportMode;
}) => Promise<{ doc: ReportDocument; filename: string }>;

// One builder per consumer report type. Phase 1 ships the first; the rest land
// in later steps of the build order.
const BUILDERS: Record<string, Builder> = {
  'air-quality-summary': buildAirQualitySummaryDoc,
};

function parseMode(v: unknown): ReportMode {
  return v === 'research' ? 'research' : 'showcase';
}

/** GET /api/reports/availability — rooms with real data + their available spans.
 *  Drives the frontend pickers so they only offer real ranges/rooms. */
router.get('/reports/availability', async (_req: Request, res: Response) => {
  try {
    const rooms = await getRoomsWithRealData();
    return res.json({ success: true, data: rooms });
  } catch (err) {
    logger.error({ err }, 'GET /reports/availability failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** POST /api/reports/:type — body { roomId, from, to, mode } → streamed PDF. */
router.post('/reports/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const builder = BUILDERS[type];
    if (!builder) {
      return res.status(404).json({ success: false, message: `Unknown report type "${type}"` });
    }

    const { roomId, from, to, mode } = req.body as {
      roomId?: string; from?: string; to?: string; mode?: string;
    };
    if (!roomId) return res.status(400).json({ success: false, message: 'roomId is required' });

    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate >= toDate) {
      return res.status(400).json({ success: false, message: 'invalid from/to range' });
    }

    if (!(await userOwnsRoom(req.userId, roomId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const scope = await resolveRoomScope(roomId);
    if (!scope.room) return res.status(404).json({ success: false, message: 'Room not found' });

    const reportMode = parseMode(mode);
    const window = applyModeWindow(fromDate, toDate, reportMode);

    const { doc, filename } = await builder({ scope, from: window.from, to: window.to, mode: reportMode });

    let pdf: Buffer;
    try {
      pdf = await generatePdf(doc);
    } catch (err) {
      // Chromium failed to launch (e.g. missing system libs on a fresh deploy).
      // Surface a clear, actionable error rather than a generic 500.
      logger.error({ err }, 'report PDF render failed (Chromium)');
      return res.status(503).json({
        success: false,
        code: 'pdf_engine_unavailable',
        message: 'The PDF rendering engine (headless Chromium) could not start. On Railway this usually means the Chromium system libraries are missing from the deploy image.',
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    return res.end(pdf);
  } catch (err) {
    logger.error({ err }, 'POST /reports/:type failed');
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    return res.end();
  }
});

export default router;
