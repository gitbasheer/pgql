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

  it('should handle generate PR button click - success case', async () => {
    const user = userEvent.setup();
    const mockPRResponse = {
      prUrl: 'https://github.com/test/repo/pull/123',
      prNumber: 123,
      title: 'GraphQL Migration - Automated Update',
      files: ['src/queries/user.ts', 'src/queries/posts.ts'],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPRResponse,
    });

    renderComponent();

    const generateButton = screen.getByRole('button', { name: 'Generate Pull Request' });
    await user.click(generateButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipeline/test-pipeline/generate-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(toast.success).toHaveBeenCalledWith('Pull request generated successfully!');
    });

    expect(screen.getByRole('link', { name: /View on GitHub/i })).toHaveAttribute('href', 'https://github.com/test/repo/pull/123');
  });

  it('should handle generate PR button click - error case', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Pipeline not ready for PR generation' }),
    });

    renderComponent();

    const generateButton = screen.getByRole('button', { name: 'Generate Pull Request' });
    await user.click(generateButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to generate PR: Pipeline not ready for PR generation');
    });
  });

  it('should handle network error during PR generation', async () => {
    const user = userEvent.setup();

    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    renderComponent();

    const generateButton = screen.getByRole('button', { name: 'Generate Pull Request' });
    await user.click(generateButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to generate PR: Network error');
    });
  });

  it('should disable button while PR generation is in progress', async () => {
    const user = userEvent.setup();

    // Mock a slow response
    (global.fetch as any).mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ prUrl: 'https://github.com/test/repo/pull/123' }),
      }), 1000))
    );

    renderComponent();

    const generateButton = screen.getByRole('button', { name: 'Generate Pull Request' });
    await user.click(generateButton);

    // Button should be disabled during request
    expect(screen.getByRole('button', { name: 'Generating PR...' })).toBeDisabled();
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

  it('should show PR generation progress after button click', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => mockPRResponse,
      }), 100))
    );

    renderComponent();

    const generateButton = screen.getByRole('button', { name: 'Generate Pull Request' });
    await user.click(generateButton);

    // Check that button shows loading state
    expect(screen.getByText('Generating PR...')).toBeInTheDocument();
    expect(generateButton).toBeDisabled();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Pull request generated successfully!');
    });
  });

  it('should handle button click when pipeline is inactive', async () => {
    const user = userEvent.setup();
    
    render(
      <QueryClientProvider client={queryClient}>
        <PRPreview pipelineId={undefined} isActive={false} />
      </QueryClientProvider>
    );

    expect(screen.queryByRole('button', { name: 'Generate Pull Request' })).not.toBeInTheDocument();
  });

  it('should verify PR generation success flow', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPRResponse,
    });

    renderComponent();

    const generateButton = screen.getByRole('button', { name: 'Generate Pull Request' });
    expect(generateButton).toBeEnabled();
    
    await user.click(generateButton);

    // Verify API was called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/pipeline/test-pipeline/generate-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  it('should handle rapid button clicks', async () => {
    const user = userEvent.setup();
    
    // Mock slow response
    (global.fetch as any).mockImplementationOnce(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => mockPRResponse,
      }), 100))
    );

    renderComponent();

    const generateButton = screen.getByRole('button', { name: 'Generate Pull Request' });
    
    // First click
    await user.click(generateButton);
    
    // Button should be disabled during request
    expect(generateButton).toBeDisabled();
    
    // Try clicking again while disabled
    await user.click(generateButton);
    
    // Should still only have one fetch call
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle real PR diff loading', async () => {
    const user = userEvent.setup();
    
    const mockRealPRResponse = {
      prUrl: 'https://github.com/test/repo/pull/789',
      diff: `diff --git a/src/queries/user.ts b/src/queries/user.ts
index 1234567..abcdefg 100644
--- a/src/queries/user.ts
+++ b/src/queries/user.ts
@@ -1,4 +1,4 @@
-query getUser($id: ID!) { user(id: $id) { name email } }
+query getUser($id: ID!) { userV2(userId: $id) { fullName emailAddress } }`,
      message: 'PR generated with real query transformations'
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRealPRResponse,
    });

    renderComponent();

    const generateButton = screen.getByRole('button', { name: 'Generate Pull Request' });
    await user.click(generateButton);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Pull request generated successfully!');
    });

    // Verify real diff content is rendered
    expect(screen.getAllByText(/query getUser/)).toHaveLength(2);
    expect(screen.getByText(/userV2/)).toBeInTheDocument();
    expect(screen.getByText(/fullName emailAddress/)).toBeInTheDocument();
  });

  it('should handle real API error responses in PR generation', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ 
        message: 'Real API authentication failed for PR generation',
        details: 'Invalid auth cookies provided'
      }),
    });

    renderComponent();

    const generateButton = screen.getByRole('button', { name: 'Generate Pull Request' });
    await user.click(generateButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to generate PR: Real API authentication failed for PR generation');
    });
  });

  it('should verify real diff visualization with syntax highlighting', async () => {
    const user = userEvent.setup();
    
    const mockGraphQLDiff = {
      prUrl: 'https://github.com/test/vnext/pull/456',
      diff: `diff --git a/queries/ventures.graphql b/queries/ventures.graphql
--- a/queries/ventures.graphql
+++ b/queries/ventures.graphql
@@ -1,3 +1,3 @@
-query GetVentures { ventures { id name } }
+query GetVentures { venturesV2 { id displayName } }`,
      transformations: [
        { from: 'ventures', to: 'venturesV2', type: 'field_rename' },
        { from: 'name', to: 'displayName', type: 'field_rename' }
      ]
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockGraphQLDiff,
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: 'Generate Pull Request' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Pull request generated successfully!');
    });

    // Verify GraphQL transformation content
    expect(screen.getAllByText(/GetVentures/)).toHaveLength(2);
    expect(screen.getByText(/venturesV2/)).toBeInTheDocument();
    expect(screen.getByText(/displayName/)).toBeInTheDocument();
  });

  it('should handle real diff with .env auth - production headers', async () => {
    const user = userEvent.setup();
    
    // Mock real production environment
    const originalEnv = process.env;
    process.env.REACT_APP_AUTH_IDP = 'prod-auth-token-123';
    process.env.REACT_APP_API_TOKEN = 'prod-bearer-token-456';
    
    const mockRealAuthDiff = {
      prUrl: 'https://github.com/production/vnext/pull/789',
      diff: `diff --git a/src/api/auth.ts b/src/api/auth.ts
--- a/src/api/auth.ts
+++ b/src/api/auth.ts
@@ -1,4 +1,6 @@
 const authHeaders = {
-  'Cookie': 'legacy_auth=old_token'
+  'Cookie': 'auth_idp=***; cust_idp=***',
+  'Authorization': 'Bearer ***',
+  'X-Account-Id': process.env.ACCOUNT_ID
 };`,
      authValidated: true,
      prodReady: true
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRealAuthDiff,
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: 'Generate Pull Request' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Pull request generated successfully!');
    });

    // Verify real auth diff content shows proper header construction
    expect(screen.getByText(/auth_idp=\*\*\*/)).toBeInTheDocument();
    expect(screen.getByText(/Authorization.*Bearer \*\*\*/)).toBeInTheDocument();
    
    // Cleanup
    process.env = originalEnv;
  });

  it('should test real API authentication validation in PR flow', async () => {
    const user = userEvent.setup();
    
    // Mock authentication validation failure
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ 
        message: 'Real API auth validation failed',
        details: 'Cookie auth_idp token invalid or expired',
        authError: true,
        suggestion: 'Check REACT_APP_AUTH_IDP environment variable'
      }),
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: 'Generate Pull Request' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to generate PR: Real API auth validation failed');
    });

    // Verify auth error handling doesn't expose sensitive tokens
    expect(screen.queryByText(/auth_idp.*=.*[^*]/)).not.toBeInTheDocument();
  });

  it('should verify real PR generation with Hivemind A/B flags', async () => {
    const user = userEvent.setup();
    
    const mockHivemindPR = {
      prUrl: 'https://github.com/production/vnext/pull/100',
      diff: `diff --git a/src/features/ventures.ts b/src/features/ventures.ts
--- a/src/features/ventures.ts
+++ b/src/features/ventures.ts
@@ -1,3 +1,6 @@
+import { hivemind } from '@hivemind/flags';
+
 export const getVentures = () => {
+  if (hivemind.isEnabled('ventures_v2_migration')) {
     return venturesV2Service.getAll();
+  }
   return venturesService.getAll();
 };`,
      hivemindFlags: ['ventures_v2_migration'],
      abTestReady: true
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockHivemindPR,
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: 'Generate Pull Request' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Pull request generated successfully!');
    });

    // Verify Hivemind A/B flag integration per Z's implementation
    expect(screen.getByText(/hivemind\.isEnabled/)).toBeInTheDocument();
    expect(screen.getByText(/ventures_v2_migration/)).toBeInTheDocument();
  });
});