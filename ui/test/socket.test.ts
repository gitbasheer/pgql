import { describe, it, expect, vi, beforeEach } from 'vitest';
import { io as mockIo } from 'socket.io-client';
import { socketService } from '../src/services/socket';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  })),
}));

describe('Socket Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the socket instance
    socketService.disconnect();
  });

  it('should create a socket connection', () => {
    const socket = socketService.connect();
    
    expect(mockIo).toHaveBeenCalledWith('http://localhost:3001', {
      path: '/socket.io',
      transports: ['websocket'],
    });
    
    expect(socket).toBeDefined();
    expect(socket.on).toBeDefined();
    expect(socket.emit).toBeDefined();
  });

  it('should return the same socket instance on subsequent calls', () => {
    const socket1 = socketService.connect();
    const socket2 = socketService.connect();
    
    expect(socket1).toBe(socket2);
    expect(mockIo).toHaveBeenCalledTimes(1);
  });

  it('should get existing socket instance', () => {
    const createdSocket = socketService.connect();
    const retrievedSocket = socketService.getSocket();
    
    expect(retrievedSocket).toBe(createdSocket);
  });

  it('should return null when no socket exists', () => {
    const socket = socketService.getSocket();
    expect(socket).toBeNull();
  });

  it('should disconnect socket and clear instance', () => {
    const socket = socketService.connect();
    
    socketService.disconnect();
    
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socketService.getSocket()).toBeNull();
  });

  it('should handle disconnect when no socket exists', () => {
    expect(() => socketService.disconnect()).not.toThrow();
  });

  it('should set up connect and disconnect handlers', () => {
    const socket = socketService.connect();
    
    expect(socket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });
});