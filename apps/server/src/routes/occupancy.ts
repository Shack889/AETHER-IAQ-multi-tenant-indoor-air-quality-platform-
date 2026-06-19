import { Router, Request, Response } from 'express';
import { ALLOWED_EVENT_TAGS } from '@aether/shared';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { userOwnsNode, userOwnsRoom } from '../utils/ownership';

const router = Router();

const EVENT_TAGS = new Set<string>(ALLOWED_EVENT_TAGS);

interface OccupancyBody {
  nodeId?: string;
  roomId?: string;
  timestamp?: string;
  count?: number | null;
  activity?: string | null;
  eventTag?: string | null;
  note?: string | null;
}

/** Validate the shared body shape. Returns an error message, or null if valid.
 *  `requireTarget` is false for PUT (the target node/room can't be moved on an
 *  edit, so we only re-validate the fields actually present). */
function validateBody(body: OccupancyBody, requireTarget: boolean): string | null {
  if (requireTarget && !body.nodeId && !body.roomId) {
    return 'at least one of nodeId or roomId is required';
  }
  if (body.timestamp !== undefined) {
    if (typeof body.timestamp !== 'string' || isNaN(new Date(body.timestamp).getTime())) {
      return 'timestamp must be a parseable date';
    }
  } else if (requireTarget) {
    return 'timestamp is required';
  }
  if (body.count !== undefined && body.count !== null) {
    if (typeof body.count !== 'number' || !Number.isFinite(body.count) || body.count < 0) {
      return 'count must be a number >= 0';
    }
  }
  if (body.eventTag !== undefined && body.eventTag !== null && !EVENT_TAGS.has(body.eventTag)) {
    return `eventTag must be one of: ${ALLOWED_EVENT_TAGS.join(', ')}`;
  }
  return null;
}

/** Ownership over a log's target. Empty target is allowed (loose relations). */
async function ownsTarget(userId: string, nodeId?: string | null, roomId?: string | null): Promise<boolean> {
  if (nodeId && !(await userOwnsNode(userId, nodeId))) return false;
  if (roomId && !(await userOwnsRoom(userId, roomId))) return false;
  return true;
}

/** POST /api/occupancy — record a manual occupancy / context observation. */
router.post('/occupancy', async (req: Request, res: Response) => {
  try {
    const body = req.body as OccupancyBody;
    const err = validateBody(body, true);
    if (err) return res.status(400).json({ success: false, message: err });
    if (!(await ownsTarget(req.userId, body.nodeId, body.roomId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const entry = await prisma.occupancyLog.create({
      data: {
        nodeId:    body.nodeId ?? null,
        roomId:    body.roomId ?? null,
        userId:    req.userId,
        timestamp: new Date(body.timestamp as string),
        count:     body.count ?? null,
        activity:  body.activity?.trim() || null,
        eventTag:  body.eventTag ?? null,
        note:      body.note?.trim() || null,
        // source is intentionally not taken from the client — manual entries are
        // always 'manual', leaving room for 'estimated'/sensor sources later.
        source:    'manual',
      },
    });
    return res.status(201).json({ success: true, data: entry });
  } catch (e) {
    logger.error({ err: e }, 'POST /occupancy failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** GET /api/occupancy?nodeId=&roomId=&from=&to= — list entries in range. */
router.get('/occupancy', async (req: Request, res: Response) => {
  try {
    const { nodeId, roomId, from, to } = req.query as Record<string, string | undefined>;
    if (!(await ownsTarget(req.userId, nodeId, roomId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const fromDate = from ? new Date(from) : undefined;
    const toDate   = to   ? new Date(to)   : undefined;
    if ((fromDate && isNaN(fromDate.getTime())) || (toDate && isNaN(toDate.getTime()))) {
      return res.status(400).json({ success: false, message: 'invalid from/to' });
    }

    const entries = await prisma.occupancyLog.findMany({
      where: {
        ...(nodeId ? { nodeId } : {}),
        ...(roomId ? { roomId } : {}),
        ...(fromDate || toDate
          ? { timestamp: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
          : {}),
      },
      orderBy: { timestamp: 'asc' },
      take: 1000,
    });
    return res.json({ success: true, data: entries });
  } catch (e) {
    logger.error({ err: e }, 'GET /occupancy failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** PUT /api/occupancy/:id — correct a mistaken entry. */
router.put('/occupancy/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.occupancyLog.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Entry not found' });
    if (!(await ownsTarget(req.userId, existing.nodeId, existing.roomId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const body = req.body as OccupancyBody;
    const err = validateBody(body, false);
    if (err) return res.status(400).json({ success: false, message: err });

    const entry = await prisma.occupancyLog.update({
      where: { id },
      data: {
        ...(body.timestamp !== undefined ? { timestamp: new Date(body.timestamp) } : {}),
        ...(body.count    !== undefined ? { count: body.count ?? null } : {}),
        ...(body.activity !== undefined ? { activity: body.activity?.trim() || null } : {}),
        ...(body.eventTag !== undefined ? { eventTag: body.eventTag ?? null } : {}),
        ...(body.note     !== undefined ? { note: body.note?.trim() || null } : {}),
      },
    });
    return res.json({ success: true, data: entry });
  } catch (e) {
    logger.error({ err: e }, 'PUT /occupancy/:id failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/** DELETE /api/occupancy/:id — remove a mistaken entry. Manual-log correction,
 *  not research-data deletion, so no force guard is needed here. */
router.delete('/occupancy/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.occupancyLog.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Entry not found' });
    if (!(await ownsTarget(req.userId, existing.nodeId, existing.roomId))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await prisma.occupancyLog.delete({ where: { id } });
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, 'DELETE /occupancy/:id failed');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
