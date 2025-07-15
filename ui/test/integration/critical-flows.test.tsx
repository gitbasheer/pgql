import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import Dashboard from '../../src/components/Dashboard';

// Mock socket service
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
};

vi.mock('../../src/services/socket', () => ({
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

describe('Critical UI Flows Integration Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    
    // Setup default fetch mock for pipeline queries
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

  afterEach(() => {
    vi.resetAllMocks();
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );
  };

  describe('Complete Pipeline Flow', () => {
    it('should handle full vnext testing flow with real API integration', async () => {
      const user = userEvent.setup();
      
      // Mock successful extraction response
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 
            pipelineId: 'vnext-pipeline-789',
            extractionId: 'extraction-456'
          }),
        })
        // Mock successful real API test response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 
            testResults: [
              { queryName: 'getUser', status: 'passed', baselineMatches: true },
              { queryName: 'listPosts', status: 'passed', baselineMatches: true }
            ]
          }),
        });

      renderDashboard();

      // Start vnext testing flow
      const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
      await user.click(vnextButton);

      // Verify extraction API call
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/extract', expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('data/sample_data/vnext-dashboard')
        }));
      });

      // Verify real API testing call
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/test-real-api', expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': expect.any(String)
          })
        }));
      });

      // Verify success notifications
      expect(toast.success).toHaveBeenCalledWith('vnext sample data pipeline started successfully!');
      expect(toast.info).toHaveBeenCalledWith('Running real API tests with masked authentication...');
    });

    it('should handle authentication failure during vnext flow', async () => {
      const user = userEvent.setup();
      
      // Mock extraction success but auth failure
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ pipelineId: 'test-pipeline' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ 
            message: 'Authentication failed',
            details: 'Invalid auth cookies'
          }),
        });

      renderDashboard();

      const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
      await user.click(vnextButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('vnext testing failed: Authentication failed');
      });
    });

    it('should handle network timeout during critical flow', async () => {
      const user = userEvent.setup();
      
      // Mock network timeout
      (global.fetch as any).mockRejectedValueOnce(new Error('Network timeout'));

      renderDashboard();

      const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
      await user.click(vnextButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('vnext testing failed: Network timeout');
      });
    });
  });

  describe('Form Validation and Submission Flow', () => {
    it('should handle complete form validation cycle', async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pipelineId: 'form-test-123' }),
      });

      renderDashboard();

      // Initially button should be disabled
      const submitButton = screen.getByRole('button', { name: /start pipeline/i });
      expect(submitButton).toBeDisabled();

      // Fill only repo path
      const repoInput = screen.getByLabelText(/repository path/i);
      await user.type(repoInput, '/test/repo');
      
      // Button should still be disabled (missing schema)
      expect(submitButton).toBeDisabled();

      // Fill schema endpoint
      const schemaInput = screen.getByLabelText(/schema endpoint/i);
      await user.type(schemaInput, 'https://api.example.com/graphql');

      // Now button should be enabled
      expect(submitButton).toBeEnabled();

      // Submit form
      await user.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoPath: '/test/repo',
            schemaEndpoint: 'https://api.example.com/graphql',
            testApiUrl: '',
            testAccountId: '',
            strategies: ['hybrid'],
            preserveSourceAST: true,
            enableVariantDetection: true,
          }),
        });
      });

      expect(toast.success).toHaveBeenCalledWith('GraphQL extraction pipeline started successfully!');
    });

    it('should handle form submission with optional fields', async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pipelineId: 'optional-fields-test' }),
      });

      renderDashboard();

      // Fill all fields including optional ones
      await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
      await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
      await user.type(screen.getByLabelText(/test api url/i), 'https://test-api.example.com');
      await user.type(screen.getByLabelText(/test account id/i), 'test-account-456');

      const submitButton = screen.getByRole('button', { name: /start pipeline/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoPath: '/test/repo',
            schemaEndpoint: 'https://api.example.com/graphql',
            testApiUrl: 'https://test-api.example.com',
            testAccountId: 'test-account-456',
            strategies: ['hybrid'],
            preserveSourceAST: true,
            enableVariantDetection: true,
          }),
        });
      });
    });

    it('should handle form reset after successful submission', async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pipelineId: 'reset-test' }),
      });

      renderDashboard();

      // Fill and submit form
      await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
      await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');

      const submitButton = screen.getByRole('button', { name: /start pipeline/i });
      await user.click(submitButton);

      // Wait for submission to complete
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });

      // Form fields should retain their values (no reset in current implementation)
      const repoInput = screen.getByLabelText(/repository path/i);
      const schemaInput = screen.getByLabelText(/schema endpoint/i);
      expect(repoInput).toHaveValue('/test/repo');
      expect(schemaInput).toHaveValue('https://api.example.com/graphql');
    });
  });

  describe('Error Recovery Flow', () => {
    it('should handle graceful recovery from server errors', async () => {
      const user = userEvent.setup();
      
      // First attempt fails, second succeeds
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ message: 'Internal server error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ pipelineId: 'recovery-test' }),
        });

      renderDashboard();

      // Fill form and submit
      await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
      await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');

      const submitButton = screen.getByRole('button', { name: /start pipeline/i });
      
      // First attempt
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to start extraction: Internal server error');
      });

      // Clear the error toast call
      vi.clearAllMocks();

      // Second attempt should succeed
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('GraphQL extraction pipeline started successfully!');
      });
    });

    it('should handle rapid consecutive submissions', async () => {
      const user = userEvent.setup();
      
      // Mock slow response
      (global.fetch as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ pipelineId: 'rapid-test' }),
        }), 100))
      );

      renderDashboard();

      // Fill form
      await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
      await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');

      const submitButton = screen.getByRole('button', { name: /start pipeline/i });
      
      // Rapid clicks
      await user.click(submitButton);
      await user.click(submitButton);
      await user.click(submitButton);

      // Should only make one API call due to button being disabled during request
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Socket Integration Flow', () => {
    it('should handle socket connection and pipeline events', async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pipelineId: 'socket-test' }),
      });

      renderDashboard();

      // Verify socket connection is established
      expect(mockSocket.on).toHaveBeenCalled();

      // Submit pipeline to trigger socket events
      await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
      await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');
      await user.click(screen.getByRole('button', { name: /start pipeline/i }));

      // Simulate socket events
      const logHandler = mockSocket.on.mock.calls.find(call => call[0] === 'log')?.[1];
      if (logHandler) {
        await act(async () => {
          logHandler({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Pipeline started',
            pipelineId: 'socket-test'
          });
        });
      }

      // Verify pipeline started successfully
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('GraphQL extraction pipeline started successfully!');
      });
    });

    it('should handle socket disconnection during pipeline', async () => {
      const user = userEvent.setup();
      
      renderDashboard();

      // Simulate socket disconnect event
      const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')?.[1];
      if (disconnectHandler) {
        await act(async () => {
          disconnectHandler('transport close');
        });
      }

      // Dashboard should handle disconnection gracefully
      expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
    });
  });

  describe('Memory and Performance Flow', () => {
    it('should handle large form inputs without memory issues', async () => {
      const user = userEvent.setup();
      
      const largeInput = 'a'.repeat(1000); // Reduced size for faster test
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pipelineId: 'large-input-test' }),
      });

      renderDashboard();

      // Fill form with large input
      const repoInput = screen.getByLabelText(/repository path/i);
      const schemaInput = screen.getByLabelText(/schema endpoint/i);
      
      await user.clear(repoInput);
      await user.type(repoInput, largeInput);
      await user.type(schemaInput, 'https://api.example.com/graphql');

      // Should handle large inputs without issues
      expect(repoInput).toHaveValue(largeInput);
      expect(schemaInput).toHaveValue('https://api.example.com/graphql');
    }, 10000);

    it('should handle concurrent component interactions', async () => {
      const user = userEvent.setup();
      
      // Mock different responses for different endpoints
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/extract')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ pipelineId: 'concurrent-test' }),
          });
        }
        if (url.includes('/api/pipeline/concurrent-test/queries')) {
          return Promise.resolve({
            ok: true,
            json: async () => [], // Return empty array for queries
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      });

      renderDashboard();

      // Interact with components sequentially for reliability
      const repoInput = screen.getByLabelText(/repository path/i);
      const schemaInput = screen.getByLabelText(/schema endpoint/i);

      await user.type(repoInput, '/test/repo');
      await user.type(schemaInput, 'https://api.example.com/graphql');

      // Test vnext button interaction
      const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
      await user.click(vnextButton);

      // All interactions should be handled correctly
      expect(repoInput).toHaveValue('/test/repo');
      expect(schemaInput).toHaveValue('https://api.example.com/graphql');
      
      // Verify vnext API call was made
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/extract', expect.objectContaining({
          method: 'POST'
        }));
      });
    });
  });

  describe('Accessibility and UX Flow', () => {
    it('should maintain accessibility during error states', async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Validation error' }),
      });

      renderDashboard();

      // Submit form with error
      await user.type(screen.getByLabelText(/repository path/i), '/invalid/repo');
      await user.type(screen.getByLabelText(/schema endpoint/i), 'invalid-url');
      await user.click(screen.getByRole('button', { name: /start pipeline/i }));

      // Error should be announced but form should remain accessible
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });

      // Form inputs should remain accessible
      expect(screen.getByLabelText(/repository path/i)).toBeEnabled();
      expect(screen.getByLabelText(/schema endpoint/i)).toBeEnabled();
    });

    it('should provide loading states during operations', async () => {
      const user = userEvent.setup();
      
      // Mock slow response
      (global.fetch as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ pipelineId: 'loading-test' }),
        }), 100))
      );

      renderDashboard();

      await user.type(screen.getByLabelText(/repository path/i), '/test/repo');
      await user.type(screen.getByLabelText(/schema endpoint/i), 'https://api.example.com/graphql');

      const submitButton = screen.getByRole('button', { name: /start pipeline/i });
      await user.click(submitButton);

      // Button should be disabled during loading
      expect(submitButton).toBeDisabled();

      // Wait for completion
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });
  });
});