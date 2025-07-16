import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { socketService } from '../services/socket';
import { toast } from 'react-toastify';

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socketInstance = socketService.connect();
    setSocket(socketInstance);

    if (!socketInstance) {
      setIsConnected(false);
      return;
    }

    const handleConnect = () => {
      setIsConnected(true);
      setError(null);
      toast.success('Connected to server');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      toast.warning('Disconnected from server');
    };

    const handleConnectError = (err: Error) => {
      setError(err.message);
      setIsConnected(false);
      toast.error(`Connection failed: ${err.message}`);
    };

    socketInstance.on('connect', handleConnect);
    socketInstance.on('disconnect', handleDisconnect);
    socketInstance.on('connect_error', handleConnectError);

    // Set initial connection state
    setIsConnected(socketInstance.connected);

    return () => {
      socketInstance.off('connect', handleConnect);
      socketInstance.off('disconnect', handleDisconnect);
      socketInstance.off('connect_error', handleConnectError);
    };
  }, []);

  return { socket, isConnected, error };
}
