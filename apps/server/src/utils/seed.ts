import { prisma } from '../config/database';
import { logger } from './logger';

const DEMO_USER_ID = 'demo-user-001';
const DEMO_USER_EMAIL = 'demo@aether-iaq.local';
const MOCK_NODE_ID = 'AETHER-N01';

/**
 * Seeds the demo user, default room, and binds the mock node to that room.
 * Idempotent — safe to call on every startup.
 */
export async function seedDemoEnvironment(): Promise<void> {
  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    create: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      name: 'AETHER Demo User',
    },
    update: {},
  });

  const existingRoom = await prisma.room.findFirst({ where: { userId: DEMO_USER_ID } });
  const room = existingRoom ?? (await prisma.room.create({
    data: {
      name: 'Demo Office',
      width_ft: 22,
      height_ft: 22,
      ceiling_ft: 10,
      profile: 'OFFICE_OPEN',
      userId: DEMO_USER_ID,
    },
  }));

  const mockNode = await prisma.node.findUnique({ where: { nodeId: MOCK_NODE_ID } });
  if (mockNode) {
    const updates: { roomId?: string; dataSource?: string } = {};
    if (!mockNode.roomId) updates.roomId = room.id;
    if (mockNode.dataSource !== 'mock') updates.dataSource = 'mock';
    if (Object.keys(updates).length > 0) {
      await prisma.node.update({ where: { nodeId: MOCK_NODE_ID }, data: updates });
      logger.info({ nodeId: MOCK_NODE_ID, ...updates }, 'mock node updated');
    }
  }
}
