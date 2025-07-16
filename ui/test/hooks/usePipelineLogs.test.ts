import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePipelineLogs } from '../../src/hooks/usePipelineLogs';

describe('usePipelineLogs', () => {
  const mockSocket = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty logs', () => {
    const { result } = renderHook(() => usePipelineLogs(mockSocket as any));

    expect(result.current.logs).toEqual([]);
  });

  it('should set up socket listeners when socket is provided', () => {
    renderHook(() => usePipelineLogs(mockSocket as any));

    expect(mockSocket.on).toHaveBeenCalledWith('log', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(
      'pipeline:log',
      expect.any(Function)
    );
  });

  it('should not set up listeners when socket is null', () => {
    renderHook(() => usePipelineLogs(null));

    expect(mockSocket.on).not.toHaveBeenCalled();
  });

  it('should add log entries when receiving log events', () => {
    const { result } = renderHook(() => usePipelineLogs(mockSocket as any));

    // Get the log handler
    const logHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'log'
    )?.[1];

    expect(logHandler).toBeDefined();

    // Simulate receiving a log
    act(() => {
      logHandler?.({
        level: 'info',
        message: 'Test log message',
        timestamp: '2024-01-01T00:00:00Z',
      });
    });

    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0]).toMatchObject({
      level: 'info',
      message: 'Test log message',
    });
    expect(result.current.logs[0].timestamp).toBeDefined();
  });

  it('should add pipeline log entries', () => {
    const { result } = renderHook(() => usePipelineLogs(mockSocket as any));

    // Get the pipeline log handler
    const pipelineLogHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'pipeline:log'
    )?.[1];

    expect(pipelineLogHandler).toBeDefined();

    // Simulate receiving a pipeline log
    act(() => {
      pipelineLogHandler?.({
        level: 'success',
        message: 'Pipeline started successfully',
        timestamp: '2024-01-01T00:00:00Z',
        stage: 'extraction',
      });
    });

    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0]).toMatchObject({
      level: 'success',
      message: 'Pipeline started successfully',
      stage: 'extraction',
    });
  });

  it('should clear logs when clearLogs is called', () => {
    const { result } = renderHook(() => usePipelineLogs(mockSocket as any));

    // Add some logs first
    const logHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'log'
    )?.[1];

    act(() => {
      logHandler?.({ level: 'info', message: 'Log 1' });
      logHandler?.({ level: 'warn', message: 'Log 2' });
    });

    expect(result.current.logs).toHaveLength(2);

    // Clear logs
    act(() => {
      result.current.clearLogs();
    });

    expect(result.current.logs).toHaveLength(0);
  });

  it('should clean up socket listeners on unmount', () => {
    const { unmount } = renderHook(() => usePipelineLogs(mockSocket as any));

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('log', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith(
      'pipeline:log',
      expect.any(Function)
    );
  });

  it('should handle socket change gracefully', () => {
    const { result, rerender } = renderHook(
      ({ socket }) => usePipelineLogs(socket),
      { initialProps: { socket: mockSocket as any } }
    );

    expect(result.current.logs).toEqual([]);

    // Change to null socket
    rerender({ socket: null });

    // Should still work without errors
    expect(result.current.logs).toEqual([]);
    expect(result.current.clearLogs).toBeDefined();
  });

  it('should preserve log order', () => {
    const { result } = renderHook(() => usePipelineLogs(mockSocket as any));

    const logHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'log'
    )?.[1];

    // Add logs in sequence
    act(() => {
      logHandler?.({
        level: 'info',
        message: 'First log',
        timestamp: '2024-01-01T00:00:00Z',
      });
      logHandler?.({
        level: 'warn',
        message: 'Second log',
        timestamp: '2024-01-01T00:01:00Z',
      });
      logHandler?.({
        level: 'error',
        message: 'Third log',
        timestamp: '2024-01-01T00:02:00Z',
      });
    });

    expect(result.current.logs).toHaveLength(3);
    expect(result.current.logs[0].message).toBe('First log');
    expect(result.current.logs[1].message).toBe('Second log');
    expect(result.current.logs[2].message).toBe('Third log');
  });

  it('should handle malformed log data gracefully', () => {
    const { result } = renderHook(() => usePipelineLogs(mockSocket as any));

    // Clear any existing logs first
    act(() => {
      result.current.clearLogs();
    });

    const logHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === 'log'
    )?.[1];

    // Send malformed log data
    act(() => {
      logHandler?.(null);
      logHandler?.(undefined);
      logHandler?.('string');
      logHandler?.({ message: 'Valid log' });
    });

    // Should only add the valid log
    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0].message).toBe('Valid log');
  });
});
