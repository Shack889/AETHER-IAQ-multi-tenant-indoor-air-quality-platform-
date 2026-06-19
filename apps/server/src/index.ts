// JSON.stringify can't serialize BigInt by default (Reading.id, ProcessedData.id).
// Coerce BigInt → string so API responses don't crash.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import { env } from './config/env';
import { prisma } from './config/database';
import { setSocketServer } from './websocket/emitter';
import { startMqttSubscriber } from './mqtt/subscriber';
import { startMockDataGenerator } from './mqtt/mockGenerator';
import { loadAllStates } from './algorithms/state';
import { startRetentionJob } from './jobs/retention';
import { logger } from './utils/logger';
import { getRuntimeStats } from './utils/runtimeStats';
import { seedDemoEnvironment } from './utils/seed';
import { userScope } from './middleware/auth';
import dataRoutes from './routes/data';
import configRoutes from './routes/config';
import simulationRoutes from './routes/simulation';
import exportImportRoutes from './routes/exportImport';
import predictionsRoutes from './routes/predictions';
import occupancyRoutes from './routes/occupancy';

const app = express();
const httpServer = createServer(app);

// Always permit localhost dev origin; production origin(s) come from
// CORS_ORIGIN (comma-separated).
const corsOrigins = [
  'http://localhost:3000',
  ...env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
];

const io = new SocketServer(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

setSocketServer(io);

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-user-id'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', userScope);

app.get('/api/health', async (_req, res) => {
  let dbConnected = false;
  let nodesOnline = 0;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
    nodesOnline = await prisma.node.count({ where: { isOnline: true } });
  } catch {
    dbConnected = false;
  }
  const stats = getRuntimeStats();
  res.json({
    status: dbConnected ? 'ok' : 'degraded',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    dbConnected,
    mqttConnected: stats.mqttConnected,
    mockMode: env.MOCK_DATA,
    nodesOnline,
    lastReading: stats.lastReadingAt?.toISOString() ?? null,
    readingsProcessed: stats.readingsProcessed,
    readingsRejected: stats.readingsRejected,
    memoryUsage: process.memoryUsage(),
  });
});

app.use('/api/data', dataRoutes);
app.use('/api/data', exportImportRoutes);
app.use('/api/simulation', simulationRoutes);
app.use('/api', predictionsRoutes);
app.use('/api', occupancyRoutes);
app.use('/api', configRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

httpServer.listen(env.PORT, '0.0.0.0', () => {
  logger.info(
    { port: env.PORT, cors: env.CORS_ORIGIN, mockMode: env.MOCK_DATA },
    'AETHER-IAQ server listening',
  );

  void loadAllStates().then((restored) => {
    if (restored > 0) logger.info({ restored }, 'restored algorithm state for nodes');
  });

  startRetentionJob();

  const startup = async () => {
    if (env.MOCK_DATA) {
      startMockDataGenerator();
      // Let the mock generator create its node row first so the seed only binds
      // the room rather than racing to create the node.
      await new Promise((r) => setTimeout(r, 1000));
    } else {
      startMqttSubscriber();
    }
    // Seed in both modes — after a DB reset the default user/room/node must
    // exist regardless of MOCK_DATA, or real hardware readings are rejected.
    try {
      await seedDemoEnvironment();
    } catch (err) {
      logger.warn({ err }, 'demo seeding failed (non-fatal)');
    }
  };
  void startup();
});

// Last-resort guards for the unattended collection campaign: log loudly and
// keep serving rather than dying on a stray rejection from a bad payload.
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception — continuing');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully');
  httpServer.close(() => process.exit(0));
});
