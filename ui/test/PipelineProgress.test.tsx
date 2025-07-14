import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Socket } from 'socket.io-client';
import PipelineProgress from '../src/components/PipelineProgress';

// Create a mock socket
const createMockSocket = () => {
  const listeners: { [key: string]: Function[] } = {};
  
  return {
    on: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    off: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    }),
    emit: vi.fn((event: string, data: any) => {
      if (!listeners[event]) return;
      listeners[event].forEach(handler => handler(data));
    }),
    listeners,
  } as unknown as Socket;
};

describe('PipelineProgress', () => {
  let mockSocket: Socket;
  const defaultProps = {
    socket: null as Socket | null,
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = createMockSocket();
  });

  const renderComponent = (props = {}) => {
    return render(<PipelineProgress {...defaultProps} {...props} />);
  };

  it('should render all pipeline stages', () => {
    renderComponent();
    
    expect(screen.getByText('Extraction')).toBeInTheDocument();
    expect(screen.getByText('Classification')).toBeInTheDocument();
    expect(screen.getByText('Validation')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
    expect(screen.getByText('Transformation')).toBeInTheDocument();
    expect(screen.getByText('PR Generation')).toBeInTheDocument();
  });

  it('should show pending state for all stages initially', () => {
    renderComponent();
    
    const stages = document.querySelectorAll('.pipeline-stage');
    expect(stages).toHaveLength(6);
    stages.forEach(stage => {
      expect(stage).toHaveClass('pending');
    });
  });

  it('should update stage status when socket emits event', () => {
    const { rerender } = renderComponent({ socket: mockSocket });
    
    act(() => {
      // Emit stage update event
      const handler = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'pipeline:stage')[1];
      handler({
        stage: 'extraction',
        status: 'in_progress',
        message: 'Extracting queries...',
        progress: 50,
      });
    });
    
    expect(screen.getByText('Extracting queries...')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('should show stage icons based on status', () => {
    renderComponent({ socket: mockSocket });
    
    // Update different stages with different statuses
    act(() => {
      const handler = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'pipeline:stage')[1];
      
      handler({ stage: 'extraction', status: 'completed' });
      handler({ stage: 'classification', status: 'in_progress' });
      handler({ stage: 'validation', status: 'error' });
    });
    
    expect(screen.getByText('✓')).toBeInTheDocument(); // completed
    expect(screen.getByText('⊙')).toBeInTheDocument(); // in_progress
    expect(screen.getByText('✗')).toBeInTheDocument(); // error
    expect(screen.getAllByText('○')).toHaveLength(3); // pending
  });

  it('should reset stages when isActive becomes false', () => {
    const { rerender } = renderComponent({ socket: mockSocket });
    
    // First update a stage
    act(() => {
      const handler = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'pipeline:stage')[1];
      handler({ stage: 'extraction', status: 'completed' });
    });
    
    expect(screen.getByText('✓')).toBeInTheDocument();
    
    // Then set isActive to false
    rerender(<PipelineProgress socket={mockSocket} isActive={false} />);
    
    // All stages should be pending again
    const stages = document.querySelectorAll('.pipeline-stage');
    stages.forEach(stage => {
      expect(stage).toHaveClass('pending');
    });
  });

  it('should unsubscribe from socket events on unmount', () => {
    const { unmount } = renderComponent({ socket: mockSocket });
    
    expect(mockSocket.on).toHaveBeenCalledWith('pipeline:stage', expect.any(Function));
    
    unmount();
    
    expect(mockSocket.off).toHaveBeenCalledWith('pipeline:stage', expect.any(Function));
  });

  it('should handle progress bar rendering', () => {
    renderComponent({ socket: mockSocket });
    
    act(() => {
      const handler = (mockSocket.on as any).mock.calls.find((call: any) => call[0] === 'pipeline:stage')[1];
      handler({
        stage: 'testing',
        status: 'in_progress',
        progress: 75,
      });
    });
    
    const progressFill = document.querySelector('.progress-fill') as HTMLDivElement;
    expect(progressFill).toBeInTheDocument();
    expect(progressFill.style.width).toBe('75%');
  });

  it('should not attach listeners when socket is null', () => {
    renderComponent({ socket: null });
    
    expect(screen.getByText('Extraction')).toBeInTheDocument();
    // Should render but not try to attach listeners
    expect(mockSocket.on).not.toHaveBeenCalled();
  });
});