import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { socketService } from '../../src/services/socket';

// Mock Socket.io
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
  id: 'test-socket-id'
};

vi.mock('socket.io-client', () => ({
  io: () => mockSocket
}));

describe('SocketService Additional Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    socketService.disconnect();
  });

  it('should handle connection errors gracefully', () => {
    const socket = socketService.connect();
    
    // Simulate error event
    const errorHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect_error')?.[1];
    errorHandler?.({ message: 'Connection failed' });
    
    expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
  });

  it('should handle reconnection attempts', () => {
    const socket = socketService.connect();
    
    // Simulate reconnect event
    const reconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'reconnect')?.[1];
    reconnectHandler?.(3); // attempt number
    
    expect(mockSocket.on).toHaveBeenCalledWith('reconnect', expect.any(Function));
  });

  it('should handle manual disconnect', () => {
    const socket = socketService.connect();
    socketService.disconnect();
    
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('should handle pipeline events with authentication', () => {
    const socket = socketService.connect();
    
    // Simulate authenticated pipeline event
    const stageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'pipeline:stage')?.[1];
    stageHandler?.({ 
      stage: 'testing', 
      status: 'in_progress',
      authenticated: true,
      realApiEndpoint: 'https://api.example.com'
    });
    
    expect(mockSocket.on).toHaveBeenCalledWith('pipeline:stage', expect.any(Function));
  });

  it('should handle real API testing events', () => {
    const socket = socketService.connect();
    
    // Simulate real API test event
    const realApiHandler = mockSocket.on.mock.calls.find(call => call[0] === 'realapi:test:started')?.[1];
    realApiHandler?.({
      queryName: 'GetUser',
      endpoint: 'https://api.example.com',
      pipelineId: 'vnext-test-123'
    });
    
    expect(mockSocket.on).toHaveBeenCalledWith('realapi:test:started', expect.any(Function));
  });

  it('should handle pipeline completion events', () => {
    const socket = socketService.connect();
    
    // Simulate pipeline completion
    const completedHandler = mockSocket.on.mock.calls.find(call => call[0] === 'pipeline:completed')?.[1];
    completedHandler?.({
      pipelineId: 'test-123',
      status: 'success',
      duration: 120000
    });
    
    expect(mockSocket.on).toHaveBeenCalledWith('pipeline:completed', expect.any(Function));
  });

  it('should handle pipeline error events', () => {
    const socket = socketService.connect();
    
    // Simulate pipeline error
    const errorHandler = mockSocket.on.mock.calls.find(call => call[0] === 'pipeline:error')?.[1];
    errorHandler?.({
      message: 'Authentication failed for real API',
      code: 'AUTH_ERROR',
      pipelineId: 'test-123'
    });
    
    expect(mockSocket.on).toHaveBeenCalledWith('pipeline:error', expect.any(Function));
  });

  it('should handle real API baseline save events', () => {
    const socket = socketService.connect();
    
    // Simulate baseline saved event
    const baselineHandler = mockSocket.on.mock.calls.find(call => call[0] === 'realapi:baseline:saved')?.[1];
    baselineHandler?.({
      queryName: 'GetUser',
      baselineId: 'baseline-123',
      timestamp: Date.now()
    });
    
    expect(mockSocket.on).toHaveBeenCalledWith('realapi:baseline:saved', expect.any(Function));
  });

  it('should handle real API test completed events', () => {
    const socket = socketService.connect();
    
    // Simulate real API test completion
    const completedHandler = mockSocket.on.mock.calls.find(call => call[0] === 'realapi:test:completed')?.[1];
    completedHandler?.({
      queryName: 'GetUser',
      success: true,
      responseTime: 234,
      pipelineId: 'test-123'
    });
    
    expect(mockSocket.on).toHaveBeenCalledWith('realapi:test:completed', expect.any(Function));
  });

  it('should handle reconnection errors', () => {
    const socket = socketService.connect();
    
    // Simulate reconnection error
    const reconnectErrorHandler = mockSocket.on.mock.calls.find(call => call[0] === 'reconnect_error')?.[1];
    reconnectErrorHandler?.({
      message: 'Max reconnection attempts reached',
      type: 'TransportError'
    });
    
    expect(mockSocket.on).toHaveBeenCalledWith('reconnect_error', expect.any(Function));
  });

  it('should return null when getting socket before connection', () => {
    // Ensure socket is disconnected
    socketService.disconnect();
    
    const socket = socketService.getSocket();
    expect(socket).toBeNull();
  });

  it('should return existing socket when already connected', () => {
    const socket1 = socketService.connect();
    const socket2 = socketService.connect();
    
    // Should return the same socket instance
    expect(socket1).toBe(socket2);
    expect(socket2).toBe(mockSocket);
  });

  it('should handle disconnect when no socket exists', () => {
    // Ensure socket is null
    socketService.disconnect();
    
    // This should not throw an error
    expect(() => socketService.disconnect()).not.toThrow();
  });
});