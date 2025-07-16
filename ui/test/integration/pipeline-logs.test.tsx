import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
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
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pipelineId: 'test-pipeline-123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
  });

  it('should display real-time logs during extraction phase', async () => {
    const user = userEvent.setup();

    // Set up polling mock
    let pollCount = 0;
    const logs = [
      [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Starting extraction from repository...',
        },
      ],
      [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Starting extraction from repository...',
        },
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Scanning for GraphQL queries...',
        },
      ],
      [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Starting extraction from repository...',
        },
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Scanning for GraphQL queries...',
        },
        {
          timestamp: new Date().toISOString(),
          level: 'success',
          message: 'Found 2 queries in 2 files',
        },
      ],
    ];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      if (url === '/api/status') {
        const currentLogs = logs[Math.min(pollCount, logs.length - 1)];
        pollCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'extraction',
            status: 'running',
            logs: currentLogs,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderDashboard();

    // Wait for ready status
    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    // Fill in the form
    await user.type(
      screen.getByLabelText('Repository Path/URL *'),
      '/test/repo'
    );
    await user.type(
      screen.getByLabelText('Schema Endpoint *'),
      'https://api.test.com/graphql'
    );

    // Start the pipeline
    const submitButton = screen.getByRole('button', { name: 'Start Pipeline' });
    await user.click(submitButton);

    // Wait for pipeline logs to appear
    await waitFor(
      () => {
        expect(
          screen.getByText('Starting extraction from repository...')
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await waitFor(
      () => {
        expect(
          screen.getByText('Scanning for GraphQL queries...')
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await waitFor(
      () => {
        expect(
          screen.getByText('Found 2 queries in 2 files')
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('should update pipeline progress stages in real-time', async () => {
    const user = userEvent.setup();

    // Set up polling mock with stage progression
    let pollCount = 0;
    const stageProgression = [
      { stage: 'extraction', status: 'running', progress: 50 },
      { stage: 'extraction', status: 'completed', progress: 100 },
      { stage: 'classification', status: 'running', progress: 30 },
    ];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      if (url === '/api/status') {
        const currentStage =
          stageProgression[Math.min(pollCount, stageProgression.length - 1)];
        pollCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...currentStage,
            logs: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderDashboard();

    // Wait for ready status
    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    // Fill in the form
    await user.type(
      screen.getByLabelText('Repository Path/URL *'),
      '/test/repo2'
    );
    await user.type(
      screen.getByLabelText('Schema Endpoint *'),
      'https://api.test.com/graphql'
    );

    // Start the pipeline
    await user.click(screen.getByRole('button', { name: 'Start Pipeline' }));

    // Wait for polling to show status
    await waitFor(() => {
      expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
    });

    // Verify that pipeline is running
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();

    // Pipeline progress component should be visible
    const pipelineProgress = screen.getByRole('progressbar', {
      name: /pipeline progress/i,
    });
    expect(pipelineProgress).toBeInTheDocument();
  });
});
