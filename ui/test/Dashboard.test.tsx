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

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock fetch
global.fetch = vi.fn();

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

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard header', () => {
    renderDashboard();
    
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Real-time monitoring for your GraphQL migration pipeline')).toBeInTheDocument();
  });

  it('displays connection status', () => {
    renderDashboard();
    
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('renders pipeline configuration form', () => {
    renderDashboard();
    
    expect(screen.getByLabelText('Repository Path/URL *')).toBeInTheDocument();
    expect(screen.getByLabelText('Schema Endpoint *')).toBeInTheDocument();
    expect(screen.getByLabelText('Test API URL (Optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Test Account ID (Optional)')).toBeInTheDocument();
  });

  it('enables submit button when required fields are filled', async () => {
    const user = userEvent.setup();
    renderDashboard();
    
    const submitButton = screen.getByRole('button', { name: 'Start Pipeline' });
    expect(submitButton).toBeDisabled();
    
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/path/to/repo');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://api.example.com/graphql');
    
    expect(submitButton).toBeEnabled();
  });

  it('submits pipeline configuration', async () => {
    const user = userEvent.setup();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pipelineId: 'test-123' }),
    });
    
    renderDashboard();
    
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/path/to/repo');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://api.example.com/graphql');
    
    const submitButton = screen.getByRole('button', { name: 'Start Pipeline' });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: '/path/to/repo',
          schemaEndpoint: 'https://api.example.com/graphql',
          testApiUrl: '',
          testAccountId: '',
          strategies: ['hybrid'],
          preserveSourceAST: true,
          enableVariantDetection: true,
        }),
      });
      expect(toast.success).toHaveBeenCalledWith('GraphQL extraction pipeline started successfully!');
    });
  });

  it('displays pipeline progress section', () => {
    renderDashboard();
    
    expect(screen.getByText('Pipeline Progress')).toBeInTheDocument();
    expect(screen.getByText('Pipeline will appear here once started...')).toBeInTheDocument();
  });

  it('displays real-time logs section', () => {
    renderDashboard();
    
    expect(screen.getByText('Real-time Logs')).toBeInTheDocument();
  });

  it('should handle vnext sample data test button', async () => {
    const user = userEvent.setup();
    
    // Mock successful vnext test responses
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pipelineId: 'vnext-test-123', extractionId: 'vnext-test-123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ testResults: 'success', baselinesSaved: 3 }),
      });

    renderDashboard();

    const vnextButton = screen.getByRole('button', { name: /Test vnext Sample/i });
    expect(vnextButton).toBeInTheDocument();
    expect(vnextButton).toBeEnabled();

    await user.click(vnextButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/extract', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('data/sample_data/vnext-dashboard'),
      }));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/test-real-api', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }));
    });
  });

  it('should disable vnext button during testing', async () => {
    const user = userEvent.setup();
    
    // Mock slow response
    (global.fetch as any).mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ pipelineId: 'test-123' }),
      }), 1000))
    );

    renderDashboard();

    const vnextButton = screen.getByRole('button', { name: /Test vnext Sample/i });
    await user.click(vnextButton);

    // Button should be disabled and show loading state
    expect(screen.getByRole('button', { name: /Testing vnext/i })).toBeDisabled();
  });
});