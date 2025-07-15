import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/App';
import Dashboard from '../src/components/Dashboard';

// Mock components to isolate environment testing
vi.mock('../src/services/socket', () => ({
  socketService: {
    connect: () => ({
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    }),
    disconnect: vi.fn(),
    getSocket: () => null,
  },
}));

describe('Environment Configuration Tests', () => {
  let queryClient: QueryClient;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const renderWithProviders = (component: React.ReactNode) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  it('should handle missing Apollo GraphQL endpoint environment variable', () => {
    // Remove the Apollo endpoint env var
    delete process.env.REACT_APP_APOLLO_PG_ENDPOINT;
    
    // Should still render without crashing
    expect(() => renderWithProviders(<App />)).not.toThrow();
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
  });

  it('should handle invalid Apollo GraphQL endpoint format', () => {
    // Set invalid endpoint
    process.env.REACT_APP_APOLLO_PG_ENDPOINT = 'not-a-valid-url';
    
    expect(() => renderWithProviders(<App />)).not.toThrow();
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
  });

  it('should handle missing authentication environment variables', async () => {
    const user = userEvent.setup();
    
    // Remove auth env vars
    delete process.env.REACT_APP_AUTH_IDP;
    delete process.env.REACT_APP_CUST_IDP;
    delete process.env.REACT_APP_SESSION_COOKIE;
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ 
        message: 'Authentication required',
        missingCredentials: ['REACT_APP_AUTH_IDP', 'REACT_APP_CUST_IDP']
      }),
    });

    renderWithProviders(<Dashboard />);

    const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
    await user.click(vnextButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/extract', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));
    });
  });

  it('should handle production environment variables', async () => {
    const user = userEvent.setup();
    
    // Set production env vars
    process.env.REACT_APP_APOLLO_PG_ENDPOINT = 'https://production-api.example.com/graphql';
    process.env.REACT_APP_AUTH_IDP = 'prod-auth-token-12345';
    process.env.REACT_APP_CUST_IDP = 'prod-customer-token-67890';
    process.env.REACT_APP_API_TOKEN = 'prod-bearer-token-abcdef';
    process.env.REACT_APP_TEST_ACCOUNT_ID = 'prod-account-123';

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pipelineId: 'prod-pipeline-456' }),
    });

    renderWithProviders(<Dashboard />);

    const repoInput = screen.getByLabelText(/repository path/i);
    await user.type(repoInput, '/production/repo');
    
    const schemaInput = screen.getByLabelText(/schema endpoint/i);
    await user.type(schemaInput, 'https://production-api.example.com/graphql');

    const submitButton = screen.getByRole('button', { name: /start pipeline/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: '/production/repo',
          schemaEndpoint: 'https://production-api.example.com/graphql',
          testApiUrl: '',
          testAccountId: '',
          strategies: ['hybrid'],
          preserveSourceAST: true,
          enableVariantDetection: true,
        }),
      });
    });
  });

  it('should handle empty environment variables', () => {
    // Set empty env vars
    process.env.REACT_APP_APOLLO_PG_ENDPOINT = '';
    process.env.REACT_APP_AUTH_IDP = '';
    process.env.REACT_APP_CUST_IDP = '';
    
    expect(() => renderWithProviders(<App />)).not.toThrow();
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
  });

  it('should handle environment variables with special characters', async () => {
    const user = userEvent.setup();
    
    // Set env vars with special characters
    process.env.REACT_APP_AUTH_IDP = 'auth-token-with-special-chars!@#$%^&*()';
    process.env.REACT_APP_CUST_IDP = 'customer-token+with=symbols&more';
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pipelineId: 'test-123' }),
    });

    renderWithProviders(<Dashboard />);

    const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
    await user.click(vnextButton);

    // Should handle special characters without errors
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('should handle very long environment variable values', () => {
    // Set very long env vars
    const longValue = 'a'.repeat(10000);
    process.env.REACT_APP_AUTH_IDP = longValue;
    process.env.REACT_APP_APOLLO_PG_ENDPOINT = `https://very-long-domain-name-${longValue}.example.com/graphql`;
    
    expect(() => renderWithProviders(<App />)).not.toThrow();
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
  });

  it('should handle unicode characters in environment variables', async () => {
    const user = userEvent.setup();
    
    // Set env vars with unicode
    process.env.REACT_APP_AUTH_IDP = 'auth-token-测试-🧪-émojis';
    process.env.REACT_APP_TEST_ACCOUNT_ID = 'account-测试-123';
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pipelineId: 'unicode-test' }),
    });

    renderWithProviders(<Dashboard />);

    const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
    await user.click(vnextButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('should handle null and undefined environment variables', () => {
    // Explicitly set to undefined
    process.env.REACT_APP_APOLLO_PG_ENDPOINT = undefined;
    process.env.REACT_APP_AUTH_IDP = undefined;
    
    expect(() => renderWithProviders(<App />)).not.toThrow();
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
  });

  it('should handle environment variable injection attacks', async () => {
    const user = userEvent.setup();
    
    // Try to inject malicious content
    process.env.REACT_APP_AUTH_IDP = 'token"; DROP TABLE users; --';
    process.env.REACT_APP_APOLLO_PG_ENDPOINT = 'https://evil-site.com/steal-data';
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pipelineId: 'injection-test' }),
    });

    renderWithProviders(<Dashboard />);

    const vnextButton = screen.getByRole('button', { name: /🧪 test vnext sample/i });
    await user.click(vnextButton);

    // Should sanitize and handle safely
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('should handle missing NODE_ENV', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    
    expect(() => renderWithProviders(<App />)).not.toThrow();
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
    
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should handle test environment configuration', () => {
    process.env.NODE_ENV = 'test';
    process.env.REACT_APP_APOLLO_PG_ENDPOINT = 'http://localhost:4000/graphql';
    process.env.REACT_APP_AUTH_IDP = 'test-auth-token';
    
    expect(() => renderWithProviders(<App />)).not.toThrow();
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
  });

  it('should handle development environment configuration', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_APOLLO_PG_ENDPOINT = 'http://localhost:3000/graphql';
    process.env.REACT_APP_AUTH_IDP = 'dev-auth-token';
    
    expect(() => renderWithProviders(<App />)).not.toThrow();
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
  });

  it('should handle case sensitivity in environment variable names', () => {
    // Test case variations (though React only recognizes REACT_APP_ prefix)
    process.env.react_app_apollo_pg_endpoint = 'lowercase-endpoint';
    process.env.REACT_app_AUTH_IDP = 'mixed-case-auth';
    
    // Should still work with proper REACT_APP_ variables
    process.env.REACT_APP_APOLLO_PG_ENDPOINT = 'correct-endpoint';
    
    expect(() => renderWithProviders(<App />)).not.toThrow();
    expect(screen.getByText('GraphQL Migration Dashboard')).toBeInTheDocument();
  });
});