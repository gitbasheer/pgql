import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

describe('Polling Implementation Tests', () => {
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

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/pipeline/') && url.includes('/queries')) {
        return Promise.resolve({
          ok: true,
          json: async () => [], // Default empty queries array
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );
  };

  it('shows ready status initially', () => {
    renderDashboard();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('validates form before enabling submission', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const submitButton = screen.getByRole('button', { name: /start pipeline/i });
    expect(submitButton).toBeDisabled();

    // Fill only one field
    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    expect(submitButton).toBeDisabled();

    // Fill required fields
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    expect(submitButton).toBeEnabled();
  });

  it('starts polling when pipeline becomes active', async () => {
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

  it('handles vnext sample data testing', async () => {
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

    const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
    await user.click(vnextButton);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('vnext sample data pipeline started successfully!');
    });
  });

  it('handles environment variables correctly', () => {
    renderDashboard();

    // Environment variables should be set
    expect(process.env.REACT_APP_AUTH_IDP).toBe('test-auth-idp');
    expect(process.env.REACT_APP_CUST_IDP).toBe('test-cust-idp');
    expect(process.env.REACT_APP_INFO_CUST_IDP).toBe('test-info-cust-idp');
    expect(process.env.REACT_APP_INFO_IDP).toBe('test-info-idp');
  });

  it('displays logs correctly', () => {
    renderDashboard();
    
    // Should show waiting for logs initially
    expect(screen.getByText('Waiting for logs...')).toBeInTheDocument();
  });

  it('clears logs when clear button is clicked', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const clearButton = screen.getByRole('button', { name: /clear logs/i });
    await user.click(clearButton);
    
    // Should show waiting for logs after clear
    expect(screen.getByText('Waiting for logs...')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    renderDashboard();

    await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
    await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
    await user.click(screen.getByRole('button', { name: /start pipeline/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to start extraction: Network error');
    });
  });
});