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
    raw,
    processed,
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
