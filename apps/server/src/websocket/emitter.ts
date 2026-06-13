import { Server as SocketServer } from 'socket.io';
import { ProcessedSnapshot, RawReading, AlertNewEvent, EventDetectedEvent, NodeStatusEvent, DataSourceChangedEvent } from '@aether/shared';
import { logger } from '../utils/logger';

let io: SocketServer | null = null;

export function setSocketServer(server: SocketServer): void {
  io = server;

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'socket connected');

    socket.on('room:join', ({ roomId }: { roomId: string }) => {
      void socket.join(`room:${roomId}`);
      logger.debug({ socketId: socket.id, roomId }, 'socket joined room');
    });

    socket.on('room:leave', ({ roomId }: { roomId: string }) => {
      void socket.leave(`room:${roomId}`);
    });

    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, 'socket disconnected');
    });
  });
}

/** Drop null/undefined fields — sensor:update fires every ~2s and the snapshot
 *  carries dozens of legacy nullable columns; clients all read with `??`. */
function compact<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export function emitSensorUpdate(
  nodeId: string,
  raw: RawReading,
  processed: ProcessedSnapshot,
  simulated: boolean,
): void {
  if (!io) return;
  io.emit('sensor:update', {
    nodeId,
    timestamp: processed.timestamp.toISOString(),
    raw: compact(raw),
    processed: compact(processed),
    simulated,
  });
}

export function emitAlert(event: AlertNewEvent & { id?: string }): void {
  if (!io) return;
  io.emit('alert:new', event);
}

export function emitEventDetected(event: EventDetectedEvent): void {
  if (!io) return;
  io.emit('event:detected', event);
}

export function emitNodeStatus(event: NodeStatusEvent): void {
  if (!io) return;
  io.emit('node:status', event);
}

export function emitDataSourceChanged(event: DataSourceChangedEvent): void {
  if (!io) return;
  io.emit('node:dataSourceChanged', event);
  logger.info({ event }, 'emitted node:dataSourceChanged');
}
