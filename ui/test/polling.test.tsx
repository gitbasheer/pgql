import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  let mockFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock environment variables
    process.env.REACT_APP_AUTH_IDP = 'test-auth-idp';
    process.env.REACT_APP_CUST_IDP = 'test-cust-idp';
    process.env.REACT_APP_INFO_CUST_IDP = 'test-info-cust-idp';
    process.env.REACT_APP_INFO_IDP = 'test-info-idp';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );
  };

  it('polls status every 1s when pipeline is active', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      if (url.includes('/api/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'extraction',
            status: 'running',
            logs: [
              {
                timestamp: new Date().toISOString(),
                level: 'info',
                message: 'Extraction in progress'
              }
            ]
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('GraphQL extraction pipeline started successfully!');
    });

    // Clear initial fetch calls
    mockFetch.mockClear();

    // Advance time by 1 second
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Should have called status endpoint
    expect(mockFetch).toHaveBeenCalledWith('/api/status', expect.objectContaining({
      headers: expect.objectContaining({
        'x-app-key': 'vnext-dashboard',
        'Cookie': 'auth_idp=test-auth-idp; cust_idp=test-cust-idp; info_cust_idp=test-info-cust-idp; info_idp=test-info-idp'
      })
    }));

    // Advance another second
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Should have called status endpoint again
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('stops polling when pipeline completes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      if (url.includes('/api/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'completed',
            status: 'completed',
            logs: [
              {
                timestamp: new Date().toISOString(),
                level: 'success',
                message: 'Pipeline completed successfully'
              }
            ]
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    mockFetch.mockClear();

    // Advance time by 1 second - should poll and detect completion
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance another second - should NOT poll anymore
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1); // No additional calls
  });

  it('constructs auth cookies correctly from environment', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      if (url.includes('/api/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'extraction',
            status: 'running',
            logs: []
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    mockFetch.mockClear();

    // Trigger polling
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Verify the constructed cookie string
    expect(mockFetch).toHaveBeenCalledWith('/api/status', expect.objectContaining({
      headers: expect.objectContaining({
        'Cookie': 'auth_idp=test-auth-idp; cust_idp=test-cust-idp; info_cust_idp=test-info-cust-idp; info_idp=test-info-idp'
      })
    }));
  });

  it('handles polling errors gracefully', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      if (url.includes('/api/status')) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    mockFetch.mockClear();

    // Trigger polling error
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Should log error but continue polling
    expect(consoleSpy).toHaveBeenCalledWith('Failed to poll pipeline status:', expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('updates logs from polling response', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const mockLogs = [
      {
        timestamp: new Date().toISOString(),
        level: 'info' as const,
        message: 'Pipeline started'
      },
      {
        timestamp: new Date().toISOString(),
        level: 'success' as const,
        message: 'Extraction completed'
      }
    ];

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      if (url.includes('/api/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'extraction',
            status: 'running',
            logs: mockLogs
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    // Trigger polling to get logs
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Wait for logs to appear in the UI
    await waitFor(() => {
      expect(screen.getByText('Pipeline started')).toBeInTheDocument();
      expect(screen.getByText('Extraction completed')).toBeInTheDocument();
    });
  });

  it('shows correct status indicator during polling', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      if (url.includes('/api/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'transformation',
            status: 'running',
            logs: []
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      });
    });

    renderDashboard();

    // Initially should show "Ready"
    expect(screen.getByText('Ready')).toBeInTheDocument();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    // Should show polling status
    expect(screen.getByText(/Polling Status/)).toBeInTheDocument();

    // Trigger polling to update stage
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Should show the current stage
    await waitFor(() => {
      expect(screen.getByText('Polling Status (transformation)')).toBeInTheDocument();
    });
  });

  it('clears interval on component unmount', async () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      if (url.includes('/api/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'extraction',
            status: 'running',
            logs: []
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      });
    });

    const { unmount } = renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    // Unmount component
    unmount();

    // Should have called clearInterval
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  it('handles status response with missing data gracefully', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      if (url.includes('/api/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({}), // Empty response
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    // Trigger polling with empty response
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Should not crash and continue polling
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not poll when pipeline is not active', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({
      ok: true,
      json: async () => ([]),
    }));

    renderDashboard();

    mockFetch.mockClear();

    // Advance time without starting pipeline
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Should not have made any status calls
    expect(mockFetch).not.toHaveBeenCalledWith('/api/status', expect.anything());
  });

  it('restarts polling when new pipeline starts', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-456' }),
        });
      }
      if (url.includes('/api/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'extraction',
            status: 'running',
            logs: []
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      });
    });

    renderDashboard();

    // Start first pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo1');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api1.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    mockFetch.mockClear();

    // Start second pipeline
    await user.clear(screen.getByLabelText(/repository path/i));
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo2');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(2);
    });

    mockFetch.mockClear();

    // Should continue polling for new pipeline
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/status', expect.anything());
  });
});