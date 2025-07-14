import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';

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

  useEffect(() => {
    if (!socket) return;

    const handleLog = (data: unknown) => {
      // Validate log data
      if (!data || typeof data !== 'object' || !('message' in data)) {
        return; // Skip malformed log data
      }
      
      const logData = data as Record<string, unknown>;
      const logEntry: LogEntry = {
        stage: typeof logData.stage === 'string' ? logData.stage : 'general',
        level: (logData.level === 'info' || logData.level === 'warn' || logData.level === 'error' || logData.level === 'success') 
          ? logData.level : 'info',
        message: String(logData.message),
        details: typeof logData.details === 'object' ? logData.details as Record<string, unknown> : undefined,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: logData.timestamp ? new Date(String(logData.timestamp)) : new Date(),
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