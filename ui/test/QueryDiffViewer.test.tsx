import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QueryDiffViewer from '../src/components/QueryDiffViewer';
import type { ExtractedQuery, TransformationResult } from '@types/pgql.types';

// Mock react-modal
vi.mock('react-modal', () => {
  const Modal = ({ isOpen, children, onRequestClose }: any) => 
    isOpen ? (
      <div role="dialog" onClick={onRequestClose}>
        <div onClick={(e) => e.stopPropagation()}>{children}</div>
      </div>
    ) : null;
  Modal.setAppElement = vi.fn();
  return { default: Modal };
});

// Mock API
vi.mock('../src/services/api', () => ({
  getBaselineComparisons: vi.fn(),
}));

import { getBaselineComparisons } from '../src/services/api';

describe('QueryDiffViewer', () => {
  let queryClient: QueryClient;

  const mockQueries = [
    {
      query: {
        queryName: 'GetUser',
        content: 'query GetUser { user { id name } }',
        filePath: '/src/queries/user.ts',
        lineNumber: 10,
        operation: 'query',
        isNested: false,
        hasVariables: false,
      } as ExtractedQuery,
      transformation: {
        transformedQuery: 'query GetUser { userV2 { id fullName } }',
        warnings: ['Field renamed: name -> fullName'],
        mappingCode: '// Mapping code here',
      } as TransformationResult,
    },
    {
      query: {
        queryName: 'GetPosts',
        content: 'query GetPosts { posts { id } }',
        filePath: '/src/queries/posts.ts',
        lineNumber: 20,
        operation: 'query',
        isNested: false,
        hasVariables: false,
      } as ExtractedQuery,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const renderComponent = (queries = mockQueries) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <QueryDiffViewer queries={queries} />
      </QueryClientProvider>
    );
  };

  it('should render query table with all queries', () => {
    renderComponent();

    expect(screen.getByText('GetUser')).toBeInTheDocument();
    expect(screen.getByText('GetPosts')).toBeInTheDocument();
    expect(screen.getByText('/src/queries/user.ts:10')).toBeInTheDocument();
    expect(screen.getByText('/src/queries/posts.ts:20')).toBeInTheDocument();
  });

  it('should show status badges for queries', () => {
    renderComponent();

    const badges = screen.getAllByText('simple');
    expect(badges).toHaveLength(2);
  });

  it('should disable View Diff button for queries without transformation', () => {
    renderComponent();

    const buttons = screen.getAllByRole('button', { name: /View Diff|Processing/ });
    expect(buttons[0]).toBeEnabled(); // First query has transformation
    expect(buttons[1]).toBeDisabled(); // Second query doesn't
    expect(buttons[1]).toHaveTextContent('Processing...');
  });

  it('should open modal with transformation diff when View Diff is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const viewDiffButton = screen.getAllByRole('button', { name: 'View Diff' })[0];
    await user.click(viewDiffButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Query Analysis')).toBeInTheDocument();
    expect(screen.getByText('Transformation')).toBeInTheDocument();
    expect(screen.getByText('Baseline Comparison')).toBeInTheDocument();
  });

  it('should display query info in modal', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getAllByRole('button', { name: 'View Diff' })[0]);

    expect(screen.getByText('Query:')).toBeInTheDocument();
    expect(screen.getAllByText('GetUser')).toHaveLength(2); // In table and modal
    expect(screen.getByText('File:')).toBeInTheDocument();
    expect(screen.getAllByText('/src/queries/user.ts:10')).toHaveLength(2); // In table and modal
  });

  it('should display transformation warnings', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getAllByRole('button', { name: 'View Diff' })[0]);

    expect(screen.getByText('Warnings:')).toBeInTheDocument();
    expect(screen.getByText('Field renamed: name -> fullName')).toBeInTheDocument();
  });

  it('should switch to baseline comparison tab', async () => {
    const user = userEvent.setup();
    
    (getBaselineComparisons as any).mockResolvedValue([
      {
        baseline: { user: { id: '1', name: 'John' } },
        response: { user: { id: '1', name: 'John' } },
        comparison: {
          matches: true,
          differences: [],
        },
      },
    ]);

    renderComponent();

    await user.click(screen.getAllByRole('button', { name: 'View Diff' })[0]);
    await user.click(screen.getByRole('button', { name: 'Baseline Comparison' }));

    await waitFor(() => {
      expect(getBaselineComparisons).toHaveBeenCalledWith('GetUser');
      expect(screen.getByText('Baseline 1')).toBeInTheDocument();
      expect(screen.getByText('✓ Matches baseline')).toBeInTheDocument();
    });
  });

  it('should show differences when baseline does not match', async () => {
    const user = userEvent.setup();
    
    (getBaselineComparisons as any).mockResolvedValue([
      {
        baseline: { user: { id: '1', name: 'John' } },
        response: { user: { id: '1', name: 'Jane' } },
        comparison: {
          matches: false,
          differences: [
            { path: 'user.name', description: 'Value changed from "John" to "Jane"' },
          ],
        },
      },
    ]);

    renderComponent();

    await user.click(screen.getAllByRole('button', { name: 'View Diff' })[0]);
    await user.click(screen.getByRole('button', { name: 'Baseline Comparison' }));

    await waitFor(() => {
      expect(screen.getByText('⚠ Differences found')).toBeInTheDocument();
    });
  });

  it('should show message when no baselines available', async () => {
    const user = userEvent.setup();
    
    (getBaselineComparisons as any).mockResolvedValue([]);

    renderComponent();

    await user.click(screen.getAllByRole('button', { name: 'View Diff' })[0]);
    await user.click(screen.getByRole('button', { name: 'Baseline Comparison' }));

    await waitFor(() => {
      expect(screen.getByText('No baseline comparisons available for this query.')).toBeInTheDocument();
      expect(screen.getByText('Run real API tests to generate baselines.')).toBeInTheDocument();
    });
  });

  it('should close modal when close button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getAllByRole('button', { name: 'View Diff' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '×' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should handle complex query status badges', () => {
    const complexQueries = [
      {
        query: {
          ...mockQueries[0].query,
          isNested: true,
        },
        transformation: mockQueries[0].transformation,
      },
      {
        query: {
          ...mockQueries[1].query,
          isNested: true,
          fragments: ['UserFragment'],
        },
      },
      {
        query: {
          ...mockQueries[0].query,
          queryName: 'ComplexQuery',
          hasVariables: true,
          isNested: true,
        },
      },
    ];

    renderComponent(complexQueries);

    expect(screen.getByText('complex')).toBeInTheDocument();
    expect(screen.getByText('fragments')).toBeInTheDocument();
    expect(screen.getByText('variables')).toBeInTheDocument();
  });

  it('should display mapping code when available', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getAllByRole('button', { name: 'View Diff' })[0]);

    expect(screen.getByText('Response Mapping Utility')).toBeInTheDocument();
    expect(screen.getByText('// Mapping code here')).toBeInTheDocument();
  });

  it('should reset active tab when modal is closed', async () => {
    const user = userEvent.setup();
    
    (getBaselineComparisons as any).mockResolvedValue([]);

    renderComponent();

    // Open modal and switch to baseline tab
    await user.click(screen.getAllByRole('button', { name: 'View Diff' })[0]);
    await user.click(screen.getByRole('button', { name: 'Baseline Comparison' }));

    // Close and reopen modal
    await user.click(screen.getByRole('button', { name: '×' }));
    await user.click(screen.getAllByRole('button', { name: 'View Diff' })[0]);

    // Should be back on transformation tab
    expect(screen.getByRole('button', { name: 'Transformation' })).toHaveClass('active');
  });
});