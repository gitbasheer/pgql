import { useRef, useEffect, memo, useCallback } from 'react';
import { LogEntry } from '../hooks/usePipelineLogs';
import '../styles/log-viewer.css';

interface LogViewerProps {
  logs: LogEntry[];
}

const LogViewer = memo(function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const formatTimestamp = useCallback((date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  }, []);

  const getLogLevelClass = useCallback((level: LogEntry['level']) => {
    return `log-entry log-${level}`;
  }, []);

  return (
    <div 
      className="log-viewer" 
      ref={containerRef}
      role="log"
      aria-label="Pipeline execution logs"
      aria-live="polite"
      aria-relevant="additions"
    >
      {logs.length === 0 ? (
        <div className="log-empty">
          Waiting for logs...
        </div>
      ) : (
        logs.map((log) => (
          <div key={log.id} className={getLogLevelClass(log.level)}>
            <span className="log-timestamp">[{formatTimestamp(log.timestamp)}]</span>
            <span className="log-stage">[{log.stage}]</span>
            <span className="log-message">{log.message}</span>
            {log.details && (
              <pre className="log-details">{JSON.stringify(log.details, null, 2)}</pre>
            )}
          </div>
        ))
      )}
    </div>
  );
});

export default LogViewer;