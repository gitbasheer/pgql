import { io, Socket } from 'socket.io-client';
import { toast } from 'react-toastify';

class SocketService {
  private socket: Socket | null = null;

  connect(): Socket {
    if (!this.socket) {
      this.socket = io('http://localhost:3001', {
        path: '/socket.io',
        transports: ['websocket'],
        // Step 5: Enhanced WebSocket reconnection for stability
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        forceNew: false,
        autoConnect: true,
      });

      this.socket.on('connect', () => {
        toast.success('Connected to pipeline server');
      });

      this.socket.on('disconnect', (reason) => {
        console.warn('Socket disconnected:', reason);
        if (reason === 'io server disconnect') {
          toast.error('Server disconnected. Please refresh the page.');
        } else {
          toast.warning(
            'Disconnected from pipeline server. Attempting to reconnect...'
          );
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        toast.error(
          'Failed to connect to pipeline server. Please check server status.'
        );
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log('Socket reconnected after', attemptNumber, 'attempts');
        toast.success('Successfully reconnected to pipeline server');
      });

      this.socket.on('reconnect_error', (error) => {
        console.error('Socket reconnection error:', error);
        toast.error(
          'Failed to reconnect. Please refresh the page if issues persist.'
        );
      });

      this.socket.on('reconnect_failed', () => {
        console.error('Socket reconnection failed after maximum attempts');
        toast.error('Could not reconnect to server. Please refresh the page.');
      });

      // Backend pipeline event handlers from Y's services
      this.socket.on('pipeline:started', (data) => {
        console.log('Pipeline started:', data);
        toast.info(`Pipeline ${data.pipelineId} started`);
      });

      this.socket.on('pipeline:stage', (data) => {
        console.log('Pipeline stage update:', data);
        // Stage updates handled by components listening to this event
      });

      this.socket.on('pipeline:log', (data) => {
        console.log('Pipeline log:', data);
        // Log events handled by usePipelineLogs hook
      });

      this.socket.on('log', (data) => {
        console.log('General log event:', data);
        // Handle both 'log' and 'pipeline:log' events for compatibility
      });

      this.socket.on('pipeline:error', (data) => {
        console.error('Pipeline error:', data);
        toast.error(`Pipeline error: ${data.message || 'Unknown error'}`);
      });

      this.socket.on('pipeline:completed', (data) => {
        console.log('Pipeline completed:', data);
        toast.success(`Pipeline ${data.pipelineId} completed successfully`);
      });

      this.socket.on('pipeline:complete', (data) => {
        console.log('Pipeline complete (legacy):', data);
        toast.success(`Pipeline ${data.pipelineId} completed successfully`);
      });

      // Real API testing events from testOnRealApi
      this.socket.on('realapi:test:started', (data) => {
        toast.info(`Testing ${data.queryName} on real API`);
      });

      this.socket.on('realapi:test:completed', (data) => {
        toast.success(`Real API test for ${data.queryName} completed`);
      });

      this.socket.on('realapi:baseline:saved', (data) => {
        toast.info(`Baseline saved for ${data.queryName}`);
      });
    }

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();
