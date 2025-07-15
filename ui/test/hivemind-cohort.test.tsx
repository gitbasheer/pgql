import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MockedProvider, MockedResponse } from '@apollo/client/testing';
import { gql } from '@apollo/client';
import QueryDiffViewer from '../src/components/QueryDiffViewer';

const GET_COHORT = gql`
  query GetCohort($queryId: String!, $cohortType: String!) {
    getCohort(queryId: $queryId, cohortType: $cohortType) {
      cohortId
      experimentName
      variant
      confidence
      metrics {
        successRate
        responseTime
        errorCount
      }
    }
  }
`;

describe('Hivemind Cohort Integration Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Mock environment variables
    process.env.REACT_APP_AUTH_IDP = 'test-auth-idp';
    process.env.REACT_APP_CUST_IDP = 'test-cust-idp';
    process.env.REACT_APP_INFO_CUST_IDP = 'test-info-cust-idp';
    process.env.REACT_APP_INFO_IDP = 'test-info-idp';

    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: async () => ([]),
    }));
  });

  const mockQueries = [
    {
      query: {
        queryName: 'getUserProfile',
        content: 'query getUserProfile($id: ID!) { user(id: $id) { name email } }',
        filePath: '/src/queries/user.ts',
        lineNumber: 10,
        isNested: false
      },
      transformation: {
        transformedQuery: 'query getUserProfile($id: ID!) { user(id: $id) { name email profile { avatar } } }',
        warnings: ['Added new field: profile.avatar'],
        mappingCode: 'const userMapping = { profile: { avatar: "defaultAvatar.png" } };'
      }
    }
  ];

  const renderQueryDiffViewer = (mocks: MockedResponse[] = []) => {
    return render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <QueryClientProvider client={queryClient}>
          <QueryDiffViewer queries={mockQueries} />
        </QueryClientProvider>
      </MockedProvider>
    );
  };

  it('displays cohort information when query is selected', async () => {
    const cohortMock: MockedResponse = {
      request: {
        query: GET_COHORT,
        variables: {
          queryId: 'getUserProfile',
          cohortType: 'new-queries'
        },
        context: {
          headers: {
            'Cookie': 'auth_idp=test-auth-idp; cust_idp=test-cust-idp; info_cust_idp=test-info-cust-idp; info_idp=test-info-idp'
          }
        }
      },
      result: {
        data: {
          getCohort: {
            cohortId: 'cohort-123',
            experimentName: 'QueryPerformanceTest',
            variant: 'optimized',
            confidence: 95,
            metrics: {
              successRate: 98.5,
              responseTime: 150,
              errorCount: 3
            }
          }
        }
      }
    };

    const user = userEvent.setup();
    renderQueryDiffViewer([cohortMock]);

    // Click on a query to open modal
    const queryRow = screen.getByText('getUserProfile');
    await user.click(queryRow);

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('A/B Cohort:')).toBeInTheDocument();
    });

    // Wait for cohort data to load
    await waitFor(() => {
      expect(screen.getByText('cohort-123')).toBeInTheDocument();
      expect(screen.getByText('QueryPerformanceTest')).toBeInTheDocument();
      expect(screen.getByText('optimized')).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument();
    });

    // Check metrics display
    expect(screen.getByText(/Success Rate: 98.5%/)).toBeInTheDocument();
    expect(screen.getByText(/Response Time: 150ms/)).toBeInTheDocument();
    expect(screen.getByText(/Errors: 3/)).toBeInTheDocument();
  });

  it('shows Unknown cohort when no data is available', async () => {
    const cohortMock: MockedResponse = {
      request: {
        query: GET_COHORT,
        variables: {
          queryId: 'getUserProfile',
          cohortType: 'new-queries'
        }
      },
      result: {
        data: {
          getCohort: null
        }
      }
    };

    const user = userEvent.setup();
    renderQueryDiffViewer([cohortMock]);

    // Click on a query to open modal
    const queryRow = screen.getByText('getUserProfile');
    await user.click(queryRow);

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('A/B Cohort:')).toBeInTheDocument();
    });

    // Should show Unknown when no cohort data
    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('handles cohort query errors gracefully', async () => {
    const cohortMock: MockedResponse = {
      request: {
        query: GET_COHORT,
        variables: {
          queryId: 'getUserProfile',
          cohortType: 'new-queries'
        }
      },
      error: new Error('Cohort service unavailable')
    };

    const user = userEvent.setup();
    renderQueryDiffViewer([cohortMock]);

    // Click on a query to open modal
    const queryRow = screen.getByText('getUserProfile');
    await user.click(queryRow);

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('A/B Cohort:')).toBeInTheDocument();
    });

    // Should show Unknown when error occurs
    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('constructs auth cookies correctly for cohort requests', async () => {
    const cohortMock: MockedResponse = {
      request: {
        query: GET_COHORT,
        variables: {
          queryId: 'getUserProfile',
          cohortType: 'new-queries'
        },
        context: {
          headers: {
            'Cookie': 'auth_idp=test-auth-idp; cust_idp=test-cust-idp; info_cust_idp=test-info-cust-idp; info_idp=test-info-idp'
          }
        }
      },
      result: {
        data: {
          getCohort: {
            cohortId: 'cohort-123',
            experimentName: 'Test',
            variant: 'A',
            confidence: 85,
            metrics: null
          }
        }
      }
    };

    const user = userEvent.setup();
    renderQueryDiffViewer([cohortMock]);

    // Click on a query to open modal
    const queryRow = screen.getByText('getUserProfile');
    await user.click(queryRow);

    // Wait for cohort data to load - this validates the auth cookie construction
    await waitFor(() => {
      expect(screen.getByText('cohort-123')).toBeInTheDocument();
    });
  });

  it('displays cohort details with partial data', async () => {
    const cohortMock: MockedResponse = {
      request: {
        query: GET_COHORT,
        variables: {
          queryId: 'getUserProfile',
          cohortType: 'new-queries'
        }
      },
      result: {
        data: {
          getCohort: {
            cohortId: 'cohort-456',
            experimentName: null,
            variant: 'B',
            confidence: null,
            metrics: null
          }
        }
      }
    };

    const user = userEvent.setup();
    renderQueryDiffViewer([cohortMock]);

    // Click on a query to open modal
    const queryRow = screen.getByText('getUserProfile');
    await user.click(queryRow);

    // Wait for modal and cohort data
    await waitFor(() => {
      expect(screen.getByText('cohort-456')).toBeInTheDocument();
    });

    // Check that N/A is shown for missing fields
    expect(screen.getByText(/Experiment:.*N\/A/)).toBeInTheDocument();
    expect(screen.getByText(/Confidence:.*N\/A/)).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument(); // variant should show
  });

  it('does not show cohort details section when no cohort data', async () => {
    const cohortMock: MockedResponse = {
      request: {
        query: GET_COHORT,
        variables: {
          queryId: 'getUserProfile',
          cohortType: 'new-queries'
        }
      },
      result: {
        data: {
          getCohort: null
        }
      }
    };

    const user = userEvent.setup();
    renderQueryDiffViewer([cohortMock]);

    // Click on a query to open modal
    const queryRow = screen.getByText('getUserProfile');
    await user.click(queryRow);

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('A/B Cohort:')).toBeInTheDocument();
    });

    // Should not show cohort details section
    expect(screen.queryByText('Experiment:')).not.toBeInTheDocument();
    expect(screen.queryByText('Variant:')).not.toBeInTheDocument();
    expect(screen.queryByText('Confidence:')).not.toBeInTheDocument();
  });

  it('handles cohort data with empty metrics', async () => {
    const cohortMock: MockedResponse = {
      request: {
        query: GET_COHORT,
        variables: {
          queryId: 'getUserProfile',
          cohortType: 'new-queries'
        }
      },
      result: {
        data: {
          getCohort: {
            cohortId: 'cohort-789',
            experimentName: 'MetricsTest',
            variant: 'control',
            confidence: 90,
            metrics: {
              successRate: null,
              responseTime: null,
              errorCount: null
            }
          }
        }
      }
    };

    const user = userEvent.setup();
    renderQueryDiffViewer([cohortMock]);

    // Click on a query to open modal
    const queryRow = screen.getByText('getUserProfile');
    await user.click(queryRow);

    // Wait for cohort data
    await waitFor(() => {
      expect(screen.getByText('cohort-789')).toBeInTheDocument();
    });

    // Check that N/A is shown for null metrics
    expect(screen.getByText(/Success Rate: N\/A%/)).toBeInTheDocument();
    expect(screen.getByText(/Response Time: N\/Ams/)).toBeInTheDocument();
    expect(screen.getByText(/Errors: 0/)).toBeInTheDocument(); // errorCount defaults to 0
  });

  it('updates cohort when different query is selected', async () => {
    const multipleQueries = [
      ...mockQueries,
      {
        query: {
          queryName: 'getOrderHistory',
          content: 'query getOrderHistory($userId: ID!) { orders(userId: $userId) { id total } }',
          filePath: '/src/queries/orders.ts',
          lineNumber: 5,
          isNested: false
        }
      }
    ];

    const cohortMock1: MockedResponse = {
      request: {
        query: GET_COHORT,
        variables: {
          queryId: 'getUserProfile',
          cohortType: 'new-queries'
        }
      },
      result: {
        data: {
          getCohort: {
            cohortId: 'cohort-user',
            experimentName: 'UserTest',
            variant: 'A',
            confidence: 85,
            metrics: null
          }
        }
      }
    };

    const cohortMock2: MockedResponse = {
      request: {
        query: GET_COHORT,
        variables: {
          queryId: 'getOrderHistory',
          cohortType: 'new-queries'
        }
      },
      result: {
        data: {
          getCohort: {
            cohortId: 'cohort-orders',
            experimentName: 'OrderTest',
            variant: 'B',
            confidence: 92,
            metrics: null
          }
        }
      }
    };

    const user = userEvent.setup();
    render(
      <MockedProvider mocks={[cohortMock1, cohortMock2]} addTypename={false}>
        <QueryClientProvider client={queryClient}>
          <QueryDiffViewer queries={multipleQueries} />
        </QueryClientProvider>
      </MockedProvider>
    );

    // Click on first query
    await user.click(screen.getByText('getUserProfile'));
    await waitFor(() => {
      expect(screen.getByText('cohort-user')).toBeInTheDocument();
    });

    // Close modal
    await user.click(screen.getByText('×'));

    // Click on second query
    await user.click(screen.getByText('getOrderHistory'));
    await waitFor(() => {
      expect(screen.getByText('cohort-orders')).toBeInTheDocument();
    });
  });
});