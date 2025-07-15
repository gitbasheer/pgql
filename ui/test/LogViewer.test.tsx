import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LogViewer from '../src/components/LogViewer';

describe('LogViewer', () => {
  it('shows empty state when no logs', () => {
    render(<LogViewer logs={[]} />);
    
    expect(screen.getByText('Waiting for logs...')).toBeInTheDocument();
  });

  it('displays log entries', () => {
    const logs = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        level: 'info' as const,
        message: 'Started extraction process',
      },
      {
        timestamp: '2024-01-01T10:00:01Z',
        level: 'success' as const,
        message: 'Found 10 queries',
      },
    ];

    render(<LogViewer logs={logs} />);
    
    expect(screen.getByText('Started extraction process')).toBeInTheDocument();
    expect(screen.getByText('Found 10 queries')).toBeInTheDocument();
  });

  it('applies correct styling for different log levels', () => {
    const logs = [
      {
        timestamp: new Date().toISOString(),
        level: 'info' as const,
        message: 'Info message',
      },
      {
        timestamp: new Date().toISOString(),
        level: 'warn' as const,
        message: 'Warning message',
      },
      {
        timestamp: new Date().toISOString(),
        level: 'error' as const,
        message: 'Error message',
      },
      {
        timestamp: new Date().toISOString(),
        level: 'success' as const,
        message: 'Success message',
      },
    ];

    const { container } = render(<LogViewer logs={logs} />);
    
    expect(container.querySelector('.log-info')).toBeInTheDocument();
    expect(container.querySelector('.log-warn')).toBeInTheDocument();
    expect(container.querySelector('.log-error')).toBeInTheDocument();
    expect(container.querySelector('.log-success')).toBeInTheDocument();
  });

  it('displays log details when provided', () => {
    const logs: LogEntry[] = [
      {
        id: '1',
        timestamp: new Date(),
        stage: 'test',
        level: 'info',
        message: 'Test message',
        details: { query: 'test query', file: 'test.ts' },
      },
    ];

    render(<LogViewer logs={logs} />);
    
    expect(screen.getByText('"query": "test query"', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('"file": "test.ts"', { exact: false })).toBeInTheDocument();
  });
});