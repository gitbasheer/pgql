import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApolloClient, InMemoryCache, ApolloProvider } from '@apollo/client';
import Dashboard from '../../src/components/Dashboard';

// This test requires the mock server to be running
// Run: pnpm mock-server in a separate terminal

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

describe('Pipeline Real-time Logs Integration', () => {
  const originalFetch = global.fetch;
  
  beforeAll(() => {
    // Use real fetch for integration tests
    global.fetch = originalFetch;
  });

  afterAll(() => {
    // Restore mock
    global.fetch = vi.fn();
  });

  it('should display real-time logs during extraction phase', async () => {
    const user = userEvent.setup();
    renderDashboard();
    
    // Fill in the form
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/test/repo');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://api.test.com/graphql');
    
    // Start the pipeline
    const submitButton = screen.getByRole('button', { name: 'Start Pipeline' });
    await user.click(submitButton);
    
    // Wait for pipeline to start
    await waitFor(() => {
      expect(screen.getByText('Pipeline started successfully!')).toBeInTheDocument();
    });
    
    // Wait for extraction logs
    await waitFor(() => {
      expect(screen.getByText('Starting extraction from repository...')).toBeInTheDocument();
    }, { timeout: 5000 });
    
    await waitFor(() => {
      expect(screen.getByText('Scanning for GraphQL queries...')).toBeInTheDocument();
    }, { timeout: 5000 });
    
    await waitFor(() => {
      expect(screen.getByText('Found 2 queries in 2 files')).toBeInTheDocument();
    }, { timeout: 5000 });
  }, 20000);

  it('should update pipeline progress stages in real-time', async () => {
    const user = userEvent.setup();
    renderDashboard();
    
    // Fill in the form
    await user.type(screen.getByLabelText('Repository Path/URL *'), '/test/repo2');
    await user.type(screen.getByLabelText('Schema Endpoint *'), 'https://api.test.com/graphql');
    
    // Start the pipeline
    await user.click(screen.getByRole('button', { name: 'Start Pipeline' }));
    
    // Check that extraction stage becomes active
    await waitFor(() => {
      const extractionStage = screen.getByText('Extraction').closest('.pipeline-stage');
      expect(extractionStage).toHaveClass('in_progress');
    }, { timeout: 5000 });
    
    // Wait for extraction to complete
    await waitFor(() => {
      const extractionStage = screen.getByText('Extraction').closest('.pipeline-stage');
      expect(extractionStage).toHaveClass('completed');
    }, { timeout: 10000 });
    
    // Check that classification stage becomes active
    await waitFor(() => {
      const classificationStage = screen.getByText('Classification').closest('.pipeline-stage');
      expect(classificationStage).toHaveClass('in_progress');
    }, { timeout: 5000 });
  }, 30000);
});