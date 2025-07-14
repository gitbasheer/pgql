import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import RealApiTesting from '../../src/components/RealApiTesting';

// Mock toast
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock API functions
vi.mock('../../src/services/api', () => ({
  getRealApiTestResults: vi.fn(),
  triggerRealApiTests: vi.fn(),
  getBaselineComparisons: vi.fn(),
}));

import { getRealApiTestResults, triggerRealApiTests } from '../../src/services/api';

describe('Real API Testing Integration', () => {
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
        <RealApiTesting pipelineId={pipelineId} isActive={isActive} />
      </QueryClientProvider>
    );
  };

  it('should display empty state when pipeline is not active', () => {
    renderComponent('test-pipeline', false);
    
    expect(screen.getByText('Real API Testing')).toBeInTheDocument();
    expect(screen.getByText('Real API testing will be available after pipeline starts')).toBeInTheDocument();
  });

  it('should show trigger button when no tests have been run', async () => {
    (getRealApiTestResults as any).mockResolvedValue({
      total: 5,
      tested: 0,
      passed: 0,
      failed: 0,
      results: []
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Test Against Real API')).toBeInTheDocument();
    });
  });

  it('should display test results when available', async () => {
    (getRealApiTestResults as any).mockResolvedValue({
      total: 3,
      tested: 2,
      passed: 1,
      failed: 1,
      results: [
        {
          queryName: 'GetVentures',
          status: 'passed',
          baselineExists: true,
          comparisonResult: {
            matches: true,
            differences: []
          }
        },
        {
          queryName: 'GetProjects',
          status: 'failed',
          baselineExists: true,
          comparisonResult: {
            matches: false,
            differences: [
              { path: 'data.projects[0].name', description: 'Field value changed' }
            ]
          }
        }
      ]
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Total Queries')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // tested
      expect(screen.getAllByText('1')).toHaveLength(2); // passed and failed both show 1
      expect(screen.getByText('GetVentures')).toBeInTheDocument();
      expect(screen.getByText('GetProjects')).toBeInTheDocument();
    });

    // Check for status badges
    expect(screen.getByText('passed')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('✓ Matches baseline')).toBeInTheDocument();
    expect(screen.getByText('⚠ 1 differences found')).toBeInTheDocument();
  });

  it('should trigger real API tests with authentication', async () => {
    const user = userEvent.setup();
    
    (getRealApiTestResults as any).mockResolvedValue({
      total: 0,
      tested: 0,
      passed: 0,
      failed: 0,
      results: []
    });

    (triggerRealApiTests as any).mockResolvedValue(undefined);

    renderComponent();

    // Click trigger button
    await waitFor(() => {
      expect(screen.getByText('Test Against Real API')).toBeInTheDocument();
    });
    
    await user.click(screen.getByText('Test Against Real API'));

    // Fill in authentication form
    await user.type(screen.getByPlaceholderText('Cookies (session data)'), 'test-cookies');
    await user.type(screen.getByPlaceholderText('App Key'), 'test-app-key');

    // Submit form
    await user.click(screen.getByText('Start Tests'));

    await waitFor(() => {
      expect(triggerRealApiTests).toHaveBeenCalledWith('test-pipeline', {
        cookies: 'test-cookies',
        appKey: 'test-app-key'
      });
      expect(toast.success).toHaveBeenCalledWith('Real API tests triggered successfully!');
    });
  });

  it('should show validation error for missing auth fields', async () => {
    const user = userEvent.setup();
    
    (getRealApiTestResults as any).mockResolvedValue({
      total: 0,
      tested: 0,
      passed: 0,
      failed: 0,
      results: []
    });

    renderComponent();

    // Click trigger button
    await waitFor(() => {
      expect(screen.getByText('Test Against Real API')).toBeInTheDocument();
    });
    
    await user.click(screen.getByText('Test Against Real API'));

    // Remove required attributes to allow testing our validation
    const cookiesInput = screen.getByPlaceholderText('Cookies (session data)') as HTMLInputElement;
    const appKeyInput = screen.getByPlaceholderText('App Key') as HTMLInputElement;
    cookiesInput.removeAttribute('required');
    appKeyInput.removeAttribute('required');

    // Fill only one field
    await user.type(cookiesInput, 'test-cookies');

    // Try to submit with only partial data
    await user.click(screen.getByText('Start Tests'));

    await waitFor(() => {
      // Should trigger validation error
      expect(toast.error).toHaveBeenCalledWith('Both cookies and app key are required');
      expect(triggerRealApiTests).not.toHaveBeenCalled();
    });
  });

  it('should handle API errors gracefully', async () => {
    const user = userEvent.setup();
    
    (getRealApiTestResults as any).mockResolvedValue({
      total: 0,
      tested: 0,
      passed: 0,
      failed: 0,
      results: []
    });

    (triggerRealApiTests as any).mockRejectedValue(new Error('API connection failed'));

    renderComponent();

    // Click trigger button and fill form
    await waitFor(() => {
      expect(screen.getByText('Test Against Real API')).toBeInTheDocument();
    });
    
    await user.click(screen.getByText('Test Against Real API'));
    await user.type(screen.getByPlaceholderText('Cookies (session data)'), 'test-cookies');
    await user.type(screen.getByPlaceholderText('App Key'), 'test-app-key');
    await user.click(screen.getByText('Start Tests'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to trigger tests: API connection failed');
    });
  });

  it('should expand differences details when clicked', async () => {
    const user = userEvent.setup();
    
    (getRealApiTestResults as any).mockResolvedValue({
      total: 1,
      tested: 1,
      passed: 0,
      failed: 1,
      results: [
        {
          queryName: 'GetProjects',
          status: 'failed',
          baselineExists: true,
          comparisonResult: {
            matches: false,
            differences: [
              { path: 'data.projects[0].name', description: 'Field value changed from "old" to "new"' },
              { path: 'data.projects[0].status', description: 'Field added' }
            ]
          }
        }
      ]
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('⚠ 2 differences found')).toBeInTheDocument();
    });

    // Click to expand differences
    await user.click(screen.getByText('⚠ 2 differences found'));

    await waitFor(() => {
      expect(screen.getByText('data.projects[0].name:')).toBeInTheDocument();
      expect(screen.getByText('Field value changed from "old" to "new"')).toBeInTheDocument();
      expect(screen.getByText('data.projects[0].status:')).toBeInTheDocument();
      expect(screen.getByText('Field added')).toBeInTheDocument();
    });
  });
});