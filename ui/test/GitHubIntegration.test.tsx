import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import GitHubIntegration from '../src/components/GitHubIntegration';

// Mock react-dom createPortal
vi.mock('react-dom', () => ({
  createPortal: (children: any) => children,
}));

// Mock toast
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('GitHubIntegration', () => {
  const mockOnRepoCloned = vi.fn();
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <GitHubIntegration onRepoCloned={mockOnRepoCloned} />
      </QueryClientProvider>
    );
  };

  it('should render clone button', () => {
    renderComponent();
    
    const button = screen.getByRole('button', { name: /Clone from GitHub/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('should open clone dialog when button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /Clone from GitHub/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Clone GitHub Repository')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://github.com/owner/repo')).toBeInTheDocument();
  });

  it('should close dialog when overlay is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /Clone from GitHub/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const overlay = screen.getByRole('dialog').parentElement;
    await user.click(overlay!);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should close dialog when cancel button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /Clone from GitHub/i }));
    await user.click(screen.getByText('Cancel'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should successfully clone repository', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        localPath: '/tmp/cloned-repo',
        message: 'Repository cloned successfully',
      }),
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: /Clone from GitHub/i }));
    
    const input = screen.getByPlaceholderText('https://github.com/owner/repo');
    await user.type(input, 'https://github.com/test/repo');
    
    await user.click(screen.getByRole('button', { name: 'Clone' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/github/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: 'https://github.com/test/repo' }),
      });
      expect(toast.success).toHaveBeenCalledWith('Repository cloned successfully!');
      expect(mockOnRepoCloned).toHaveBeenCalledWith('/tmp/cloned-repo');
    });

    // Dialog should be closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should handle clone error', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Repository not found' }),
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: /Clone from GitHub/i }));
    await user.type(screen.getByPlaceholderText('https://github.com/owner/repo'), 'https://github.com/invalid/repo');
    await user.click(screen.getByRole('button', { name: 'Clone' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to clone repository: Repository not found');
      expect(mockOnRepoCloned).not.toHaveBeenCalled();
    });

    // Dialog should remain open on error
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should disable clone button while cloning', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ localPath: '/tmp/repo', message: 'Success' }),
      }), 100))
    );

    renderComponent();

    await user.click(screen.getByRole('button', { name: /Clone from GitHub/i }));
    await user.type(screen.getByPlaceholderText('https://github.com/owner/repo'), 'https://github.com/test/repo');
    
    const cloneButton = screen.getByRole('button', { name: 'Clone' });
    await user.click(cloneButton);

    expect(cloneButton).toBeDisabled();
    expect(cloneButton).toHaveTextContent('Cloning...');

    await waitFor(() => {
      expect(mockOnRepoCloned).toHaveBeenCalled();
    });
  });

  it('should validate GitHub URL format', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /Clone from GitHub/i }));
    
    const input = screen.getByPlaceholderText('https://github.com/owner/repo');
    const cloneButton = screen.getByRole('button', { name: 'Clone' });

    // Empty URL
    await user.click(cloneButton);
    expect(global.fetch).not.toHaveBeenCalled();

    // Invalid URL
    await user.clear(input);
    await user.type(input, 'not-a-url');
    await user.click(cloneButton);
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Please enter a valid GitHub repository URL');
    });
  });

  it('should handle network errors', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    renderComponent();

    await user.click(screen.getByRole('button', { name: /Clone from GitHub/i }));
    await user.type(screen.getByPlaceholderText('https://github.com/owner/repo'), 'https://github.com/test/repo');
    await user.click(screen.getByRole('button', { name: 'Clone' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to clone repository: Network error');
    });
  });

  it('should clear input after successful clone', async () => {
    const user = userEvent.setup();
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ localPath: '/tmp/repo', message: 'Success' }),
    });

    renderComponent();

    await user.click(screen.getByRole('button', { name: /Clone from GitHub/i }));
    
    const input = screen.getByPlaceholderText('https://github.com/owner/repo') as HTMLInputElement;
    await user.type(input, 'https://github.com/test/repo');
    expect(input.value).toBe('https://github.com/test/repo');
    
    await user.click(screen.getByRole('button', { name: 'Clone' }));

    await waitFor(() => {
      expect(mockOnRepoCloned).toHaveBeenCalled();
    });

    // Re-open dialog to check input is cleared
    await user.click(screen.getByRole('button', { name: /Clone from GitHub/i }));
    const newInput = screen.getByPlaceholderText('https://github.com/owner/repo') as HTMLInputElement;
    expect(newInput.value).toBe('');
  });
});