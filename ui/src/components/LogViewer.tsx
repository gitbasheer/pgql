import { useRef, useEffect, memo, useCallback, useState } from 'react';
import { LogDetail } from '../types/api.types';
import '../styles/log-viewer.css';

interface LogViewerProps {
  logs: LogDetail[];
}

const LogViewer = memo(function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      
      // On initial mount or when logs first appear, scroll to bottom
      if (isInitialMount.current && logs.length > 0) {
        container.scrollTop = container.scrollHeight;
        isInitialMount.current = false;
        return;
      }
      
      // Only auto-scroll if user is not actively scrolling
      if (!isUserScrolling) {
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
        
        // If we're already near the bottom, keep following
        if (isAtBottom) {
          container.scrollTop = container.scrollHeight;
        }
      }
    }
  }, [logs, isUserScrolling]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    
    // User is scrolling
    setIsUserScrolling(true);
    
    // Clear existing timeout
    if (scrollTimeoutRef.current !== null) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    
    // If user scrolls to bottom, re-enable auto-scroll after a delay
    if (isAtBottom) {
      scrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolling(false);
      }, 1000);
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const formatTimestamp = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  }, []);

  const getLogLevelClass = useCallback((level: LogDetail['level']) => {
    return `log-entry log-${level}`;
  }, []);

  return (
    <div 
      className="log-viewer" 
      ref={containerRef}
      onScroll={handleScroll}
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
        <>
          {logs.map((log, index) => (
            <div key={`${log.timestamp}-${index}`} className={getLogLevelClass(log.level)}>
              <span className="log-timestamp">[{formatTimestamp(log.timestamp)}]</span>
              <span className="log-message">{log.message}</span>
              {log.details && (
                <pre className="log-details">{JSON.stringify(log.details, null, 2)}</pre>
              )}
            </div>
          ))}
          {isUserScrolling && (
            <div className="scroll-indicator">
              <span>Auto-scroll paused - Scroll to bottom to resume</span>
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default LogViewer;