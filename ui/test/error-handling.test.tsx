import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApolloClient, InMemoryCache, ApolloProvider } from '@apollo/client';
import { toast } from 'react-toastify';
import Dashboard from '../src/components/Dashboard';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

// Mock react-toastify to capture toast calls
vi.mock('react-toastify', async () => {
  const actual = await vi.importActual('react-toastify');
  return {
    ...actual,
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
});

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

describe('Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should show error toast when invalid repo path is provided', async () => {
    const user = userEvent.setup();
    
    // Mock API to return error for invalid path
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ 
        message: 'Invalid repository path: Path does not exist or is not accessible' 
      }),
    });
    
    renderDashboard();
    
    // Fill in form with invalid path
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/invalid/path');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://api.test.com/graphql');
    
    // Submit form
    await user.click(screen.getByRole('button', { name: 'Start Pipeline' }));
    
    // Wait for error toast
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to start pipeline: Invalid repository path: Path does not exist or is not accessible'
      );
    });
    
    // Ensure no silent failures - button should be re-enabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start Pipeline' })).toBeEnabled();
    });
  });

  it('should show error toast when schema endpoint is unreachable', async () => {
    const user = userEvent.setup();
    
    // Mock API to return schema error
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ 
        message: 'Failed to connect to schema endpoint: ECONNREFUSED' 
      }),
    });
    
    renderDashboard();
    
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/valid/path');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://unreachable.test.com/graphql');
    
    await user.click(screen.getByRole('button', { name: 'Start Pipeline' }));
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to start pipeline: Failed to connect to schema endpoint: ECONNREFUSED'
      );
    });
  });

  it('should show error toast when network request fails', async () => {
    const user = userEvent.setup();
    
    // Mock network failure
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
    
    renderDashboard();
    
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/test/path');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://api.test.com/graphql');
    
    await user.click(screen.getByRole('button', { name: 'Start Pipeline' }));
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('should handle GitHub clone errors gracefully', async () => {
    const user = userEvent.setup();
    
    // Mock for GitHub clone error
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ 
        message: 'Authentication failed: Invalid GitHub token' 
      }),
    });
    
    renderDashboard();
    
    // Click GitHub clone button
    await user.click(screen.getByText('Clone from GitHub'));
    
    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    
    // Enter repo URL in modal
    const input = screen.getByPlaceholderText('https://github.com/owner/repo');
    await user.type(input, 'https://github.com/test/repo');
    
    // Click clone button
    const cloneButton = screen.getAllByRole('button').find(btn => btn.textContent === 'Clone');
    await user.click(cloneButton!);
    
    // Verify error toast was called
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('should display error state in QueryResults when fetch fails', async () => {
    const user = userEvent.setup();
    
    // Mock successful pipeline start
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pipelineId: 'test-123' }),
    });
    
    // Mock failed queries fetch
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Failed to fetch queries' }),
    });
    
    renderDashboard();
    
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/test/path');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://api.test.com/graphql');
    await user.click(screen.getByRole('button', { name: 'Start Pipeline' }));
    
    // Wait for error message in QueryResults
    await waitFor(() => {
      expect(screen.getByText('Error loading queries:', { exact: false })).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('should not proceed with PR generation if transformation is incomplete', async () => {
    const user = userEvent.setup();
    
    // Reset mock and set up the sequence of responses
    (global.fetch as any).mockReset();
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pipelineId: 'test-123' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ 
          message: 'Pipeline must complete transformation before generating PR' 
        }),
      });
    
    renderDashboard();
    
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/test/path');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://api.test.com/graphql');
    await user.click(screen.getByRole('button', { name: 'Start Pipeline' }));
    
    // Wait for PR button to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate Pull Request' })).toBeInTheDocument();
    });
    
    // Try to generate PR
    await user.click(screen.getByRole('button', { name: 'Generate Pull Request' }));
    
    // Verify error toast
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to generate PR: Pipeline must complete transformation before generating PR'
      );
    });
  });
});