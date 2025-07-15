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

      this.socket.on('disconnect', (_reason) => {
        toast.warning('Disconnected from pipeline server');
      });

      this.socket.on('connect_error', (_error) => {
        toast.error('Failed to connect to pipeline server');
      });

      this.socket.on('reconnect', (_attemptNumber) => {
        toast.success('Reconnected to pipeline server');
      });

      this.socket.on('reconnect_error', (_error) => {
        toast.error('Failed to reconnect to pipeline server');
      });

      // Backend pipeline event handlers
      this.socket.on('pipeline:started', (data) => {
        toast.info(`Pipeline ${data.pipelineId} started`);
      });

      this.socket.on('pipeline:stage', (_data) => {
        // Stage updates handled by components listening to this event
      });

      this.socket.on('pipeline:log', (_data) => {
        // Log events handled by usePipelineLogs hook
      });

      this.socket.on('pipeline:error', (data) => {
        toast.error(`Pipeline error: ${data.message}`);
      });

      this.socket.on('pipeline:completed', (data) => {
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