import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';

export interface LogEntry {
  id: string;
  timestamp: Date;
  stage: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: any;
}

export function usePipelineLogs(socket: Socket | null) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleLog = (data: any) => {
      // Validate log data
      if (!data || typeof data !== 'object' || !data.message) {
        return; // Skip malformed log data
      }
      
      const logEntry: LogEntry = {
        stage: data.stage || 'general',
        level: data.level || 'info',
        message: data.message,
        details: data.details,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      };
      setLogs((prev) => [...prev, logEntry]);
    };

    socket.on('log', handleLog);
    socket.on('pipeline:log', handleLog);

    return () => {
      socket.off('log', handleLog);
      socket.off('pipeline:log', handleLog);
    };
  }, [socket]);

  const clearLogs = () => setLogs([]);

  return { logs, clearLogs };
}