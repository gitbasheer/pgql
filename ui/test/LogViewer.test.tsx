import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LogViewer from '../src/components/LogViewer';
import type { LogEntry } from '../src/hooks/usePipelineLogs';

describe('LogViewer', () => {
  it('shows empty state when no logs', () => {
    render(<LogViewer logs={[]} />);
    
    expect(screen.getByText('Waiting for logs...')).toBeInTheDocument();
  });

  it('displays log entries', () => {
    const logs: LogEntry[] = [
      {
        id: '1',
        timestamp: new Date('2024-01-01T10:00:00'),
        stage: 'extraction',
        level: 'info',
        message: 'Started extraction process',
      },
      {
        id: '2',
        timestamp: new Date('2024-01-01T10:00:01'),
        stage: 'extraction',
        level: 'success',
        message: 'Found 10 queries',
      },
    ];

    render(<LogViewer logs={logs} />);
    
    expect(screen.getAllByText('[extraction]')).toHaveLength(2);
    expect(screen.getByText('Started extraction process')).toBeInTheDocument();
    expect(screen.getByText('Found 10 queries')).toBeInTheDocument();
  });

  it('applies correct styling for different log levels', () => {
    const logs: LogEntry[] = [
      {
        id: '1',
        timestamp: new Date(),
        stage: 'test',
        level: 'info',
        message: 'Info message',
      },
      {
        id: '2',
        timestamp: new Date(),
        stage: 'test',
        level: 'warn',
        message: 'Warning message',
      },
      {
        id: '3',
        timestamp: new Date(),
        stage: 'test',
        level: 'error',
        message: 'Error message',
      },
      {
        id: '4',
        timestamp: new Date(),
        stage: 'test',
        level: 'success',
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