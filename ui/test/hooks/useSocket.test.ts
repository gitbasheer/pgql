import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSocket } from '../../src/hooks/useSocket';
import { socketService } from '../../src/services/socket';

// Mock socket service
vi.mock('../../src/services/socket', () => ({
  socketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getSocket: vi.fn(),
  },
}));

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('useSocket', () => {
  const mockSocket = {
    connected: true,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (socketService.connect as any).mockReturnValue(mockSocket);
    (socketService.getSocket as any).mockReturnValue(mockSocket);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize socket connection on mount', () => {
    renderHook(() => useSocket());

    expect(socketService.connect).toHaveBeenCalled();
  });

  it('should return socket and connection status', () => {
    const { result } = renderHook(() => useSocket());

    expect(result.current.socket).toBe(mockSocket);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should handle socket disconnection', () => {
    const { result } = renderHook(() => useSocket());

    // Simulate disconnect event
    act(() => {
      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
      if (disconnectHandler) {
        disconnectHandler('transport close');
      }
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('should handle socket connection errors', () => {
    const { result } = renderHook(() => useSocket());

    // Simulate connection error
    act(() => {
      const errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];
      if (errorHandler) {
        errorHandler(new Error('Connection failed'));
      }
    });

    expect(result.current.error).toBe('Connection failed');
  });

  it('should clean up socket listeners on unmount', () => {
    const { unmount } = renderHook(() => useSocket());

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('connect_error', expect.any(Function));
  });

  it('should handle socket reconnection', () => {
    const { result } = renderHook(() => useSocket());

    // Simulate disconnect then reconnect
    act(() => {
      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
      if (disconnectHandler) {
        disconnectHandler('transport close');
      }
    });

    expect(result.current.isConnected).toBe(false);

    act(() => {
      const connectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];
      if (connectHandler) {
        connectHandler();
      }
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should handle null socket gracefully', () => {
    (socketService.connect as any).mockReturnValue(null);

    const { result } = renderHook(() => useSocket());

    expect(result.current.socket).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('should update connection status when socket state changes', () => {
    const { result } = renderHook(() => useSocket());

    expect(result.current.isConnected).toBe(true);

    // Simulate disconnect event to change connection status
    act(() => {
      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
      if (disconnectHandler) {
        disconnectHandler('transport close');
      }
    });

    expect(result.current.isConnected).toBe(false);
  });
});