import { useEffect, useState, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { LogDetail } from '../types/api.types';

export interface LogEntry {
  id: string;
  timestamp: Date;
  stage: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: Record<string, unknown>;
}

export function usePipelineLogs(socket: Socket | null) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedLogHandler = useCallback((data: LogDetail) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Validate log data
      if (!data || typeof data !== 'object' || !('message' in data)) {
        return; // Skip malformed log data
      }

      const logEntry: LogEntry = {
        stage: data.stage || 'general',
        level: data.level,
        message: data.message,
        details: data.details as Record<string, unknown> | undefined,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      };
      setLogs((prev) => [...prev, logEntry]);
    }, 50); // 50ms debounce
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('log', debouncedLogHandler);
    socket.on('pipeline:log', debouncedLogHandler);

    return () => {
      socket.off('log', debouncedLogHandler);
      socket.off('pipeline:log', debouncedLogHandler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [socket, debouncedLogHandler]);

  const clearLogs = () => setLogs([]);

  return { logs, clearLogs };
}
