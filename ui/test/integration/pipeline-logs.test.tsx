import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApolloClient, InMemoryCache, ApolloProvider } from '@apollo/client';
import Dashboard from '../../src/components/Dashboard';

// Mock socket.io-client for integration tests
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const apolloClient = new ApolloClient({
  uri: '/api/graphql',
  cache: new InMemoryCache(),
});

const renderDashboard = () => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ApolloProvider client={apolloClient}>
        <Dashboard />
      </ApolloProvider>
    </QueryClientProvider>
  );
};

describe('Pipeline Real-time Logs Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up fetch mock for pipeline APIs
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pipelineId: 'test-pipeline-123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([]),
      });
  });

  it('should display real-time logs during extraction phase', async () => {
    const user = userEvent.setup();
    
    // Set up socket event handler simulation
    let connectHandler: () => void;
    let logHandler: (data: any) => void;
    
    mockSocket.on.mockImplementation((event: string, handler: any) => {
      if (event === 'connect') {
        connectHandler = handler;
        // Simulate immediate connection
        setTimeout(() => connectHandler(), 100);
      } else if (event === 'log') {
        logHandler = handler;
      }
    });
    
    renderDashboard();
    
    // Wait for connection
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
    
    // Fill in the form
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/test/repo');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://api.test.com/graphql');
    
    // Start the pipeline
    const submitButton = screen.getByRole('button', { name: 'Start Pipeline' });
    await user.click(submitButton);
    
    // Simulate receiving log events
    setTimeout(() => {
      logHandler({ stage: 'extraction', level: 'info', message: 'Starting extraction from repository...' });
    }, 200);
    
    setTimeout(() => {
      logHandler({ stage: 'extraction', level: 'info', message: 'Scanning for GraphQL queries...' });
    }, 400);
    
    setTimeout(() => {
      logHandler({ stage: 'extraction', level: 'success', message: 'Found 2 queries in 2 files' });
    }, 600);
    
    // Wait for pipeline logs to appear
    await waitFor(() => {
      expect(screen.getByText('Starting extraction from repository...')).toBeInTheDocument();
    }, { timeout: 3000 });
    
    await waitFor(() => {
      expect(screen.getByText('Scanning for GraphQL queries...')).toBeInTheDocument();
    }, { timeout: 3000 });
    
    await waitFor(() => {
      expect(screen.getByText('Found 2 queries in 2 files')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should update pipeline progress stages in real-time', async () => {
    const user = userEvent.setup();
    
    // Set up socket event handler simulation
    let connectHandler: () => void;
    let stageHandler: (data: any) => void;
    
    mockSocket.on.mockImplementation((event: string, handler: any) => {
      if (event === 'connect') {
        connectHandler = handler;
        setTimeout(() => connectHandler(), 100);
      } else if (event === 'pipeline:stage') {
        stageHandler = handler;
      }
    });
    
    renderDashboard();
    
    // Wait for connection
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
    
    // Fill in the form
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/test/repo2');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://api.test.com/graphql');
    
    // Start the pipeline
    await user.click(screen.getByRole('button', { name: 'Start Pipeline' }));
    
    // Simulate stage progression
    setTimeout(() => {
      stageHandler({ stage: 'extraction', status: 'in_progress', progress: 50 });
    }, 200);
    
    setTimeout(() => {
      stageHandler({ stage: 'extraction', status: 'completed', progress: 100 });
    }, 400);
    
    setTimeout(() => {
      stageHandler({ stage: 'classification', status: 'in_progress', progress: 30 });
    }, 600);
    
    // Check that extraction stage becomes active
    await waitFor(() => {
      const extractionStage = screen.getByText('Extraction').closest('.pipeline-stage');
      expect(extractionStage).toHaveClass('in_progress');
    }, { timeout: 3000 });
    
    // Wait for extraction to complete
    await waitFor(() => {
      const extractionStage = screen.getByText('Extraction').closest('.pipeline-stage');
      expect(extractionStage).toHaveClass('completed');
    }, { timeout: 3000 });
    
    // Check that classification stage becomes active
    await waitFor(() => {
      const classificationStage = screen.getByText('Classification').closest('.pipeline-stage');
      expect(classificationStage).toHaveClass('in_progress');
    }, { timeout: 3000 });
  });
});