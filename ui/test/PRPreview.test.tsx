import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import PRPreview from '../src/components/PRPreview';

// Mock toast
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PRPreview', () => {
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

  const renderComponent = (pipelineId = 'test-pipeline', isActive = true) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <PRPreview pipelineId={pipelineId} isActive={isActive} />
      </QueryClientProvider>
    );
  };

  it('should render empty state when pipeline is not active', () => {
    renderComponent(undefined, false);
    
    expect(screen.getByText('Pull Request Preview')).toBeInTheDocument();
    expect(screen.getByText('Pull request will be available after pipeline completes')).toBeInTheDocument();
  });

  it('should show generate PR button when pipeline is active', () => {
    renderComponent();
    
    expect(screen.getByText('Pull Request Preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Pull Request' })).toBeInTheDocument();
  });

  it('should generate PR successfully', async () => {
    const user = userEvent.setup();
    
    const mockPR = {
      prUrl: 'https://github.com/test/repo/pull/123',
      diff: 'diff --git a/src/queries/user.ts...\n+query UserV2 { ... }',
      title: 'GraphQL Migration: Update queries',
      body: 'Auto-generated PR for GraphQL migration',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPR,
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: 'Generate Pull Request' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipeline/test-pipeline/generate-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(toast.success).toHaveBeenCalledWith('Pull request generated successfully!');
    });

    // Verify PR details are displayed
    expect(screen.getByText('View on GitHub →')).toBeInTheDocument();
    expect(screen.getByText('View on GitHub →')).toHaveAttribute('href', 'https://github.com/test/repo/pull/123');
    
    // Check that diff content is displayed
    await waitFor(() => {
      const diffWrapper = document.querySelector('.diff-wrapper');
      expect(diffWrapper).toBeInTheDocument();
    });
  });

  it('should handle PR generation error', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Pipeline not ready for PR generation' }),
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: 'Generate Pull Request' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to generate PR: Pipeline not ready for PR generation');
    });
  });

  it('should disable button while generating PR', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ prUrl: 'test', diff: 'test' }),
      }), 100))
    );

    renderComponent();

    const button = screen.getByRole('button', { name: 'Generate Pull Request' });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Generating PR...');

    await waitFor(() => {
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent('Generate Pull Request');
    });
  });

  it('should show empty diff state', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prUrl: 'https://github.com/test/repo/pull/123', diff: '' }),
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: 'Generate Pull Request' }));

    await waitFor(() => {
      // Verify PR link is shown but no diff content
      expect(screen.getByText('View on GitHub →')).toBeInTheDocument();
      const diffWrapper = document.querySelector('.diff-wrapper');
      expect(diffWrapper).not.toBeInTheDocument();
    });
  });

  it('should handle network error gracefully', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    renderComponent();

    await user.click(screen.getByRole('button', { name: 'Generate Pull Request' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to generate PR: Network error');
    });
  });

  it('should show empty state when pipelineId is missing', () => {
    renderComponent(undefined, false);
    
    expect(screen.getByText('Pull Request Preview')).toBeInTheDocument();
    expect(screen.getByText('Pull request will be available after pipeline completes')).toBeInTheDocument();
    // When not active, should show empty state (no button)
    expect(screen.queryByRole('button', { name: 'Generate Pull Request' })).not.toBeInTheDocument();
  });

  it('should format diff with syntax highlighting', async () => {
    const user = userEvent.setup();
    
    const mockPR = {
      prUrl: 'https://github.com/test/repo/pull/123',
      diff: `diff --git a/src/queries/user.ts b/src/queries/user.ts
index abc123..def456 100644
--- a/src/queries/user.ts
+++ b/src/queries/user.ts
@@ -1,3 +1,3 @@
-query GetUser { user { name } }
+query GetUser { userV2 { fullName } }`,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPR,
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: 'Generate Pull Request' }));

    await waitFor(() => {
      // Verify diff content is rendered
      const diffWrapper = document.querySelector('.diff-wrapper');
      expect(diffWrapper).toBeInTheDocument();
    });
  });
});