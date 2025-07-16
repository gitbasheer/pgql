import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApolloClient, InMemoryCache, ApolloProvider } from '@apollo/client';
import { toast } from 'react-toastify';
import Dashboard from '../src/components/Dashboard';

// Mock toast
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('Polling Functionality Tests', () => {
  let queryClient: QueryClient;
  let apolloClient: ApolloClient<any>;

  beforeEach(() => {
    vi.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    apolloClient = new ApolloClient({
      uri: '/api/graphql',
      cache: new InMemoryCache(),
    });

    // Mock environment variables - need to mock before importing components
    Object.defineProperty(import.meta, 'env', {
      value: {
        REACT_APP_AUTH_IDP: 'test-auth',
        REACT_APP_CUST_IDP: 'test-cust',
        REACT_APP_INFO_CUST_IDP: 'test-info-cust',
        REACT_APP_INFO_IDP: 'test-info',
      },
      writable: true,
    });

    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
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

  it('starts polling when pipeline becomes active', async () => {
    const user = userEvent.setup();
    let statusCallCount = 0;

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-123' }),
        });
      }
      if (url === '/api/status') {
        statusCallCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'extraction',
            status: 'running',
            logs: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(
      screen.getByLabelText(/schema endpoint/i),
      'https://api.example.com/graphql'
    );
    await user.click(
      screen.getAllByRole('button', { name: /start pipeline/i })[0]
    );

    // Wait for initial status call
    await waitFor(() => {
      expect(statusCallCount).toBeGreaterThan(0);
    });

    // Verify polling status is shown
    expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
  });

  it('verifies polling status updates are working', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-789' }),
        });
      }
      if (url === '/api/status') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'extraction',
            status: 'running',
            logs: [
              {
                timestamp: new Date().toISOString(),
                level: 'info',
                message: 'Pipeline running',
              },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(
      screen.getByLabelText(/schema endpoint/i),
      'https://api.example.com/graphql'
    );
    await user.click(
      screen.getAllByRole('button', { name: /start pipeline/i })[0]
    );

    // Verify polling indicator appears
    await waitFor(() => {
      expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
    });
  });
});
