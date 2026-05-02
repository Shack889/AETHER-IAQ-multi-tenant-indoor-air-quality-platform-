'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_URL } from '@/lib/constants';
import { useAetherStore } from '@/lib/store';
import { ProcessedSnapshot, RawReading, AlertRecord } from '@aether/shared';

interface SensorUpdatePayload {
  nodeId: string;
  timestamp: string;
  raw: RawReading;
  processed: ProcessedSnapshot & { timestamp: string };
}

interface AlertPayload {
  nodeId: string;
  level: number;
  message: string;
  parameter: string;
  value: number;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { setLatestData, addAlert, activeNodeId } = useAetherStore();

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('🔌 WebSocket connected');
    });

    socket.on('sensor:update', (payload: SensorUpdatePayload) => {
      if (payload.nodeId !== activeNodeId) return;
      const processed: ProcessedSnapshot = {
        ...payload.processed,
        timestamp: new Date(payload.processed.timestamp),
      };
      setLatestData(payload.raw, processed);
    });

    socket.on('alert:new', (payload: AlertPayload & { id?: string }) => {
      const alert: AlertRecord = {
        id: payload.id ?? crypto.randomUUID(),
        nodeId: payload.nodeId,
        level: payload.level as AlertRecord['level'],
        message: payload.message,
        parameter: payload.parameter,
        value: payload.value,
        threshold: 0,
        acknowledged: false,
        createdAt: new Date(),
      };
      addAlert(alert);
    });

    socket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected');
    });

    socketRef.current = socket;
  }, [activeNodeId, setLatestData, addAlert]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
    };
  }, [connect]);

  return socketRef.current;
}
