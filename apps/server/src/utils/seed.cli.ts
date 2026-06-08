/**
 * Standalone seed runner — `npm run db:seed`.
 *
 * Recreates the demo user, default room, and the AETHER-N01 node against the
 * database pointed to by DATABASE_URL. Use after a database reset; on Railway
 * run it as `railway run npm run db:seed` so it targets the production DB.
 */
import { prisma } from '../config/database';
import { seedDemoEnvironment } from './seed';
import { logger } from './logger';

async function main(): Promise<void> {
  await seedDemoEnvironment();
  logger.info('seed complete');
}

main()
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
