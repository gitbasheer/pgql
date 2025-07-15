import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import Dashboard from '../src/components/Dashboard';

// Mock socket service
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
};

vi.mock('../src/services/socket', () => ({
  socketService: {
    connect: () => mockSocket,
    disconnect: vi.fn(),
    getSocket: () => mockSocket,
  },
}));

// Mock toast
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('Dashboard Edge Cases', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    global.fetch = vi.fn();
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );
  };

  it('should handle form submission with empty repository path', async () => {
    const user = userEvent.setup();

    renderDashboard();

    // Fill required schema endpoint but leave repo path empty
    const schemaInput = screen.getByLabelText(/schema endpoint/i);
    await user.type(schemaInput, 'https://api.example.com/graphql');
    
    // The submit button should be disabled when required repo path is empty
    const submitButton = screen.getByRole('button', { name: /start pipeline/i });
    expect(submitButton).toBeDisabled();
    
    // Even if clicked, no API call should be made
    await user.click(submitButton);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should handle network timeout during pipeline start', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockRejectedValueOnce(new Error('Network timeout'));

    renderDashboard();

    const repoInput = screen.getByLabelText(/repository path/i);
    await user.type(repoInput, '/test/repo');
    
    const schemaInput = screen.getByLabelText(/schema endpoint/i);
    await user.type(schemaInput, 'https://api.example.com/graphql');

    const submitButton = screen.getByRole('button', { name: /start pipeline/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to start extraction: Network timeout');
    });
  });

  it('should handle server error during vnext sample testing', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal server error during extraction' }),
    });

    renderDashboard();

    const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
    await user.click(vnextButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('vnext testing failed: Internal server error during extraction');
    });
  });

  it('should handle authentication failure during vnext testing', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ 
        message: 'Authentication failed',
        details: 'Invalid auth cookies provided',
        suggestion: 'Check REACT_APP_AUTH_IDP environment variable'
      }),
    });

    renderDashboard();

    const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
    await user.click(vnextButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('vnext testing failed: Authentication failed');
    });
  });

  it('should handle rate limiting during API calls', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ 
        message: 'Rate limit exceeded',
        retryAfter: 60
      }),
    });

    renderDashboard();

    const repoInput = screen.getByLabelText(/repository path/i);
    await user.type(repoInput, '/test/repo');
    
    const schemaInput = screen.getByLabelText(/schema endpoint/i);
    await user.type(schemaInput, 'https://api.example.com/graphql');

    const submitButton = screen.getByRole('button', { name: /start pipeline/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to start extraction: Rate limit exceeded');
    });
  });

  it('should handle malformed API responses', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        // Missing required pipelineId field
        status: 'started',
        timestamp: Date.now()
      }),
    });

    renderDashboard();

    const repoInput = screen.getByLabelText(/repository path/i);
    await user.type(repoInput, '/test/repo');
    
    const schemaInput = screen.getByLabelText(/schema endpoint/i);
    await user.type(schemaInput, 'https://api.example.com/graphql');

    const submitButton = screen.getByRole('button', { name: /start pipeline/i });
    await user.click(submitButton);

    // Should still show success toast even with malformed response
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('GraphQL extraction pipeline started successfully!');
    });
  });

  it('should handle very long repository paths', async () => {
    const user = userEvent.setup();
    
    const longPath = '/'.repeat(1000) + 'very/long/repository/path/that/exceeds/normal/limits';
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Repository path too long' }),
    });

    renderDashboard();

    const repoInput = screen.getByLabelText(/repository path/i);
    await user.type(repoInput, longPath);
    
    const schemaInput = screen.getByLabelText(/schema endpoint/i);
    await user.type(schemaInput, 'https://api.example.com/graphql');

    const submitButton = screen.getByRole('button', { name: /start pipeline/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to start extraction: Repository path too long');
    });
  });

  it('should handle special characters in repository path', async () => {
    const user = userEvent.setup();
    
    const specialPath = '/test/repo with spaces & special chars!@#$%^&*()';
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pipelineId: 'test-123' }),
    });

    renderDashboard();

    const repoInput = screen.getByLabelText(/repository path/i);
    await user.type(repoInput, specialPath);
    
    const schemaInput = screen.getByLabelText(/schema endpoint/i);
    await user.type(schemaInput, 'https://api.example.com/graphql');

    const submitButton = screen.getByRole('button', { name: /start pipeline/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: specialPath,
          schemaEndpoint: 'https://api.example.com/graphql',
          testApiUrl: '',
          testAccountId: '',
          strategies: ['hybrid'],
          preserveSourceAST: true,
          enableVariantDetection: true,
        }),
      });
    });
  });

  it('should handle rapid successive form submissions', async () => {
    const user = userEvent.setup();
    
    // Mock slow response
    (global.fetch as any).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ pipelineId: 'test-123' }),
      }), 100))
    );

    renderDashboard();

    const repoInput = screen.getByLabelText(/repository path/i);
    await user.type(repoInput, '/test/repo');
    
    const schemaInput = screen.getByLabelText(/schema endpoint/i);
    await user.type(schemaInput, 'https://api.example.com/graphql');

    const submitButton = screen.getByRole('button', { name: /start pipeline/i });
    
    // Submit multiple times rapidly
    await user.click(submitButton);
    await user.click(submitButton);
    await user.click(submitButton);

    // Should only make one API call due to button being disabled
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle environment variable edge cases', () => {
    const originalEnv = process.env;
    
    // Test with undefined environment variables
    process.env = {};
    
    renderDashboard();
    
    // Should still render without errors
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
    
    // Restore environment
    process.env = originalEnv;
  });

  it('should handle socket connection failures gracefully', () => {
    // Mock socket connection failure
    vi.mocked(mockSocket.connect).mockImplementation(() => {
      throw new Error('Socket connection failed');
    });

    // Should still render dashboard without crashing
    expect(() => renderDashboard()).not.toThrow();
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
  });

  it('should handle form validation edge cases', async () => {
    const user = userEvent.setup();
    
    renderDashboard();

    const repoInput = screen.getByLabelText(/repository path/i);
    
    // Test with only whitespace
    await user.type(repoInput, '   ');
    await user.clear(repoInput);
    
    // Test with null characters
    await user.type(repoInput, 'test\0repo');
    await user.clear(repoInput);
    
    // Test with unicode characters
    await user.type(repoInput, '/test/repo/测试/🧪');
    
    expect(repoInput).toHaveValue('/test/repo/测试/🧪');
  });
});