import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import Dashboard from '../../src/components/Dashboard';

// Mock dependencies
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../src/hooks/useSocket', () => ({
  useSocket: () => ({
    socket: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
    isConnected: true,
  }),
}));

vi.mock('../../src/hooks/usePipelineLogs', () => ({
  usePipelineLogs: () => ({
    logs: [],
    clearLogs: vi.fn(),
  }),
}));

describe('Dashboard Additional Coverage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    global.fetch = vi.fn();
    process.env.REACT_APP_APOLLO_PG_ENDPOINT =
      'https://test-pg.example.com/graphql';
    process.env.REACT_APP_TEST_API_URL = 'https://test-api.example.com';
    process.env.REACT_APP_AUTH_IDP = 'test-auth-token';
    process.env.REACT_APP_CUST_IDP = 'test-customer-token';
    process.env.REACT_APP_SESSION_COOKIE = 'session=test123';
    process.env.REACT_APP_API_TOKEN = 'bearer-test-token';
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );
  };

  it('should handle vnext test extraction failure', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        message: 'Repository not found: data/sample_data/vnext-dashboard',
      }),
    });

    renderDashboard();

    const vnextButton = screen.getByRole('button', {
      name: /Test vnext Sample/i,
    });
    await user.click(vnextButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'vnext testing failed: Repository not found: data/sample_data/vnext-dashboard'
      );
    });
  });

  it('should handle vnext test real API failure', async () => {
    const user = userEvent.setup();

    // Mock successful extraction but failed real API test
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pipelineId: 'vnext-test-456',
          extractionId: 'extract-789',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: 'Real API authentication failed',
          details: 'Invalid auth cookies for vnext testing',
        }),
      });

    renderDashboard();

    const vnextButton = screen.getByRole('button', {
      name: /Test vnext Sample/i,
    });
    await user.click(vnextButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'vnext testing failed: Real API authentication failed'
      );
    });
  });

  it('should handle environment variable authentication setup', async () => {
    const user = userEvent.setup();

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pipelineId: 'vnext-auth-test' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ testsStarted: 5, message: 'Auth successful' }),
      });

    renderDashboard();

    const vnextButton = screen.getByRole('button', {
      name: /Test vnext Sample/i,
    });
    await user.click(vnextButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/test-real-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer bearer-test-token',
        },
        body: JSON.stringify({
          pipelineId: 'vnext-auth-test',
          endpoint: 'https://test-api.example.com',
          auth: {
            cookies: 'test-auth-token; test-customer-token; session=test123',
            accountId: 'test-vnext-123',
          },
          maskSensitiveData: true,
        }),
      });
    });
  });

  it('should handle form submission with optional fields', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pipelineId: 'optional-fields-test' }),
    });

    renderDashboard();

    // Fill required fields
    await user.type(
      screen.getByLabelText(/Repository Path/),
      '/test/custom/repo'
    );
    await user.type(
      screen.getByLabelText(/Schema Endpoint/),
      'https://custom.api.com/graphql'
    );

    // Fill optional fields
    await user.type(
      screen.getByLabelText(/Test API URL/),
      'https://custom-test.api.com'
    );
    await user.type(
      screen.getByLabelText(/Test Account ID/),
      'custom-account-789'
    );

    const submitButton = screen.getByRole('button', {
      name: /Start Pipeline/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: '/test/custom/repo',
          schemaEndpoint: 'https://custom.api.com/graphql',
          testApiUrl: 'https://custom-test.api.com',
          testAccountId: 'custom-account-789',
          strategies: ['hybrid'],
          preserveSourceAST: true,
          enableVariantDetection: true,
        }),
      });
    });
  });

  it('should handle GitHub repo cloning integration', async () => {
    renderDashboard();

    // Verify GitHub integration is rendered
    const cloneButton = screen.getByRole('button', {
      name: /Clone from GitHub/i,
    });
    expect(cloneButton).toBeInTheDocument();

    // The component should be able to receive cloned repo path
    const repoInput = screen.getByLabelText(/Repository Path/);
    expect(repoInput).toHaveAttribute(
      'placeholder',
      'Enter local path or GitHub URL'
    );
  });
});
