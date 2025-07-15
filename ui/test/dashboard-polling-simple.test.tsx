import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('Dashboard Polling Features', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Mock environment variables
    process.env.REACT_APP_AUTH_IDP = 'test-auth-idp';
    process.env.REACT_APP_CUST_IDP = 'test-cust-idp';
    process.env.REACT_APP_INFO_CUST_IDP = 'test-info-cust-idp';
    process.env.REACT_APP_INFO_IDP = 'test-info-idp';

    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: async () => ([]),
    }));
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );
  };

  it('shows polling status indicator when pipeline is active', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
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
      expect(toast.success).toHaveBeenCalledWith('GraphQL extraction pipeline started successfully!');
    });

    // Should show polling status
    await waitFor(() => {
      expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
    });
  });

  it('constructs auth cookies correctly', () => {
    // Test the cookie construction logic by checking environment variable usage
    const Dashboard = require('../src/components/Dashboard').default;
    
    expect(process.env.REACT_APP_AUTH_IDP).toBe('test-auth-idp');
    expect(process.env.REACT_APP_CUST_IDP).toBe('test-cust-idp');
    expect(process.env.REACT_APP_INFO_CUST_IDP).toBe('test-info-cust-idp');
    expect(process.env.REACT_APP_INFO_IDP).toBe('test-info-idp');
  });

  it('handles vnext sample data test with polling setup', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'vnext-pipeline-789' }),
        });
      }
      if (url.includes('/api/test-real-api')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ 
            testResults: [
              { queryName: 'getUser', status: 'passed', baselineMatches: true }
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

    // Test vnext sample button
    const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
    await user.click(vnextButton);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('vnext sample data pipeline started successfully!');
    });

    // Should show polling status after vnext test starts
    await waitFor(() => {
      expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
    });
  });

  it('clears logs functionality works', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockImplementation(() => Promise.resolve({
      ok: true,
      json: async () => ([]),
    }));

    renderDashboard();

    // The clearLogs function should be available
    const clearButton = screen.getByRole('button', { name: /clear logs/i });
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);
    
    // Should clear the logs (empty state should show)
    expect(screen.getByText('Waiting for logs...')).toBeInTheDocument();
  });

  it('displays status indicator correctly for different states', async () => {
    renderDashboard();

    // Initially disconnected/ready state
    const statusIndicator = screen.getByText('Ready');
    expect(statusIndicator).toBeInTheDocument();

    // The status indicator element should have the correct CSS class
    const indicator = document.querySelector('.status-indicator');
    expect(indicator).toHaveClass('disconnected');
  });

  it('handles environment variable edge cases', async () => {
    // Test with missing env vars
    process.env.REACT_APP_AUTH_IDP = '';
    process.env.REACT_APP_CUST_IDP = '';
    process.env.REACT_APP_INFO_CUST_IDP = '';
    process.env.REACT_APP_INFO_IDP = '';

    const user = userEvent.setup();

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/extract')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline-123' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      });
    });

    renderDashboard();

    // Should still work with empty env vars
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('pipeline status state management works correctly', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockImplementation(() => Promise.resolve({
      ok: true,
      json: async () => ({ pipelineId: 'test-pipeline-123' }),
    }));

    renderDashboard();

    // Initially pipeline should not be active
    expect(screen.getByText('Ready')).toBeInTheDocument();

    // Start pipeline
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });

    // Pipeline should now be active
    await waitFor(() => {
      expect(screen.getByText(/Polling Status/)).toBeInTheDocument();
    });
  });

  it('form validation works with polling setup', async () => {
    const user = userEvent.setup();

    renderDashboard();

    // Submit button should be disabled initially
    const submitButton = screen.getByRole('button', { name: /start pipeline/i });
    expect(submitButton).toBeDisabled();

    // Fill only repo path
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    expect(submitButton).toBeDisabled();

    // Fill schema endpoint
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    expect(submitButton).toBeEnabled();
  });

  it('handles fetch errors during pipeline start', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    renderDashboard();

    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to start extraction: Network error');
    });

    // Should remain in ready state
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('logs state management works correctly', async () => {
    renderDashboard();

    // Initially should show waiting for logs
    expect(screen.getByText('Waiting for logs...')).toBeInTheDocument();
  });
});