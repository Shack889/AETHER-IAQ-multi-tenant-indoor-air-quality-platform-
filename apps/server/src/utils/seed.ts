import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from './logger';

const DEMO_USER_ID = 'demo-user-001';
const DEMO_USER_EMAIL = 'demo@aether-iaq.local';
const DEFAULT_NODE_ID = 'AETHER-N01';

/**
 * Seeds the demo user, default room, and the default AETHER-N01 node bound to
 * that room. Idempotent — safe to call on every startup and after a DB reset.
 *
 * Source flags follow the deployment mode so the node works without any manual
 * setup: mock generator when MOCK_DATA=true, real ESP32 hardware otherwise.
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

  const mockMode = env.MOCK_DATA;
  const existingNode = await prisma.node.findUnique({ where: { nodeId: DEFAULT_NODE_ID } });

  if (!existingNode) {
    // Fresh node — provision it for whichever side is active in this deployment.
    await prisma.node.create({
      data: {
        nodeId: DEFAULT_NODE_ID,
        name: mockMode ? 'Mock Sensor Node' : 'AETHER Node 01',
        roomId: room.id,
        isOnline: false,
        firmware: mockMode ? '1.0.0-mock' : null,
        connectivity: 'wifi',
        dataSource: mockMode ? 'mock' : 'live',
        mockEnabled: mockMode,
        hardwareEnabled: !mockMode,
      },
    });
    logger.info({ nodeId: DEFAULT_NODE_ID, mockMode }, 'default node created');
  } else if (!existingNode.roomId) {
    // Node already exists (e.g. created by the mock generator or a status
    // message) — only bind it to the room, never clobber the user's source choices.
    await prisma.node.update({ where: { nodeId: DEFAULT_NODE_ID }, data: { roomId: room.id } });
    logger.info({ nodeId: DEFAULT_NODE_ID }, 'default node bound to demo room');
  }
}
