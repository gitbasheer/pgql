import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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

describe('Critical Polling Functionality Tests', () => {
  let queryClient: QueryClient;
  let mockIntervals: number[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockIntervals = [];
    
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Mock environment variables for auth
    vi.stubGlobal('import', {
      meta: {
        env: {
          REACT_APP_AUTH_IDP: 'test-auth-token',
          REACT_APP_CUST_IDP: 'test-cust-token',
          REACT_APP_INFO_CUST_IDP: 'test-info-cust',
          REACT_APP_INFO_IDP: 'test-info',
          REACT_APP_APOLLO_PG_ENDPOINT: 'https://test.api.com/graphql',
          REACT_APP_TEST_API_URL: 'https://test.api.com',
          REACT_APP_TEST_ACCOUNT_ID: 'test-account-123',
        }
      }
    });

    // Mock setInterval to track polling
    const originalSetInterval = global.setInterval;
    vi.spyOn(global, 'setInterval').mockImplementation((callback, delay) => {
      const id = originalSetInterval(callback, delay);
      mockIntervals.push(id as unknown as number);
      return id;
    });

    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clear all intervals
    mockIntervals.forEach(id => clearInterval(id));
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );
  };

  it('polls /api/status every 1000ms when pipeline is active', async () => {
    const user = userEvent.setup({ delay: null });
    
    // Mock successful pipeline start
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-123' }),
        });
      }
      if (url === '/api/status') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'extraction',
            status: 'running',
            logs: [
              { timestamp: new Date().toISOString(), level: 'info', message: 'Extracting queries...' }
            ]
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('GraphQL extraction pipeline started successfully!');
    });

    // Verify initial call
    expect(global.fetch).toHaveBeenCalledWith('/api/status', {
      headers: {
        'x-app-key': 'vnext-dashboard',
        'Cookie': 'auth_idp=test-auth-token; cust_idp=test-cust-token; info_cust_idp=test-info-cust; info_idp=test-info',
      },
    });

    // Clear previous calls
    vi.clearAllMocks();

    // Advance timer by 1000ms and verify polling
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/status', {
        headers: {
          'x-app-key': 'vnext-dashboard',
          'Cookie': 'auth_idp=test-auth-token; cust_idp=test-cust-token; info_cust_idp=test-info-cust; info_idp=test-info',
        },
      });
    });

    // Advance again and verify continuous polling
    vi.clearAllMocks();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/status', expect.any(Object));
    });
  });

  it('stops polling when pipeline completes', async () => {
    const user = userEvent.setup({ delay: null });
    let callCount = 0;
    
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-456' }),
        });
      }
      if (url === '/api/status') {
        callCount++;
        // Return completed status after 3 calls
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: callCount < 3 ? 'extraction' : 'completed',
            status: callCount < 3 ? 'running' : 'completed',
            logs: []
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
    });

    // Advance through polling cycles
    for (let i = 0; i < 4; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    }

    // Verify status changed to Ready after completion
    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    // Clear calls and advance timer - should not poll anymore
    vi.clearAllMocks();
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Should not have made any more calls
    expect(global.fetch).not.toHaveBeenCalledWith('/api/status', expect.any(Object));
  });

  it('handles polling errors with reconnection logic', async () => {
    const user = userEvent.setup({ delay: null });
    let errorCount = 0;
    
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-789' }),
        });
      }
      if (url === '/api/status') {
        errorCount++;
        // Fail first 2 attempts, succeed on 3rd
        if (errorCount <= 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'validation',
            status: 'running',
            logs: []
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
    });

    // First polling attempt - error
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should continue polling despite error
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Third attempt should succeed
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(errorCount).toBe(3);
    });

    // Verify polling continues after recovery
    expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
  });

  it('includes correct auth headers in every polling request', async () => {
    const user = userEvent.setup({ delay: null });
    
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'auth-test-123' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          stage: 'running',
          status: 'running',
          logs: []
        }),
      });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
    });

    // Check multiple polling cycles
    for (let i = 0; i < 3; i++) {
      vi.clearAllMocks();
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/status', {
          headers: {
            'x-app-key': 'vnext-dashboard',
            'Cookie': 'auth_idp=test-auth-token; cust_idp=test-cust-token; info_cust_idp=test-info-cust; info_idp=test-info',
          },
        });
      });
    }
  });

  it('updates UI with real-time log data from polling', async () => {
    const user = userEvent.setup({ delay: null });
    let pollCount = 0;
    
    const logSequences = [
      [{ timestamp: '2024-01-15T10:00:00Z', level: 'info' as const, message: 'Starting extraction...' }],
      [
        { timestamp: '2024-01-15T10:00:00Z', level: 'info' as const, message: 'Starting extraction...' },
        { timestamp: '2024-01-15T10:00:01Z', level: 'success' as const, message: 'Found 5 queries' }
      ],
      [
        { timestamp: '2024-01-15T10:00:00Z', level: 'info' as const, message: 'Starting extraction...' },
        { timestamp: '2024-01-15T10:00:01Z', level: 'success' as const, message: 'Found 5 queries' },
        { timestamp: '2024-01-15T10:00:02Z', level: 'warn' as const, message: 'Complex query detected' }
      ]
    ];

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'log-test-123' }),
        });
      }
      if (url === '/api/status') {
        const logs = logSequences[Math.min(pollCount, logSequences.length - 1)];
        pollCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'extraction',
            status: 'running',
            logs
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    // Initial state
    await waitFor(() => {
      expect(screen.getByText('Starting extraction...')).toBeInTheDocument();
    });

    // First poll - new log added
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.getByText('Found 5 queries')).toBeInTheDocument();
    });

    // Second poll - warning log added
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.getByText('Complex query detected')).toBeInTheDocument();
    });

    // Verify all logs are displayed
    expect(screen.getByText('Starting extraction...')).toBeInTheDocument();
    expect(screen.getByText('Found 5 queries')).toBeInTheDocument();
    expect(screen.getByText('Complex query detected')).toBeInTheDocument();
  });

  it('handles pipeline stage updates through polling', async () => {
    const user = userEvent.setup({ delay: null });
    let pollCount = 0;
    
    const stages = ['extraction', 'classification', 'validation', 'testing', 'transformation', 'pr-generation'];
    
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'stage-test-123' }),
        });
      }
      if (url === '/api/status') {
        const currentStage = stages[Math.min(pollCount, stages.length - 1)];
        pollCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: currentStage,
            status: 'running',
            logs: []
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    // Verify initial stage
    await waitFor(() => {
      expect(screen.getByText(/Polling Status \(extraction\)/)).toBeInTheDocument();
    });

    // Progress through stages
    for (let i = 1; i < stages.length; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(screen.getByText(new RegExp(`Polling Status \\(${stages[i]}\\)`))).toBeInTheDocument();
      });
    }
  });

  it('cleans up polling interval on unmount', async () => {
    const user = userEvent.setup({ delay: null });
    
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'cleanup-test-123' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          stage: 'running',
          status: 'running',
          logs: []
        }),
      });
    });

    const { unmount } = renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
    });

    // Verify polling is active
    const initialCalls = (global.fetch as any).mock.calls.length;
    
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect((global.fetch as any).mock.calls.length).toBeGreaterThan(initialCalls);
    });

    // Unmount component
    unmount();

    // Clear previous calls and advance timer
    vi.clearAllMocks();
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Should not make any more polling calls after unmount
    expect(global.fetch).not.toHaveBeenCalledWith('/api/status', expect.any(Object));
  });

  it('maintains polling through transient network failures', async () => {
    const user = userEvent.setup({ delay: null });
    let callCount = 0;
    
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'resilient-test-123' }),
        });
      }
      if (url === '/api/status') {
        callCount++;
        // Simulate intermittent failures
        if (callCount % 3 === 0) {
          return Promise.reject(new Error('Temporary network failure'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            stage: 'testing',
            status: 'running',
            logs: [{ 
              timestamp: new Date().toISOString(), 
              level: 'info' as const, 
              message: `Poll successful #${callCount}` 
            }]
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderDashboard();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
    });

    // Run through multiple polling cycles with failures
    for (let i = 0; i < 6; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    // Despite failures, polling should continue
    await waitFor(() => {
      expect(callCount).toBeGreaterThanOrEqual(6);
    });

    // Verify successful polls updated the UI
    const successfulPolls = screen.getAllByText(/Poll successful #\d+/);
    expect(successfulPolls.length).toBeGreaterThan(0);
  });
});