/**
 * API service for Dashboard UI - integrates with Y's GraphQLClient
 */

import type {
  TestingAccount,
  ApiResponse,
  DifferenceDetail,
} from '../types/api.types';

async function fetchWithRetry(url: string, options: RequestInit = {}, retries: number = 2): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      // Always return the response, whether ok or not, so error handling can check response.ok
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i === retries) {
        throw lastError;
      }
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  
  // This should never be reached, but for TypeScript
  throw lastError || new Error('Max retries exceeded');
}

export interface TestParams {
  query: {
    name: string;
    fullExpandedQuery: string;
    endpoint: string;
  };
  auth: {
    cookies: string;
    appKey: string;
  };
  testingAccount?: TestingAccount;
}

export interface BaselineResult {
  baseline: string;
  response: ApiResponse<unknown>;
  comparison?: {
    matches: boolean;
    differences: DifferenceDetail[];
  };
}

/**
 * Test query against real API using GraphQLClient with baseline saving
 */
export async function testOnRealApi(params: TestParams): Promise<BaselineResult> {
  try {
    const response = await fetchWithRetry('/api/pipeline/testOnRealApi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.message || 'Failed to test on real API');
      } catch (jsonError) {
        // If response.json() fails, throw the JSON parsing error
        throw jsonError;
      }
    }

    return response.json();
  } catch (error) {
    // Handle network errors (fetch rejection) - re-throw immediately
    throw error;
  }
}

/**
 * Get baseline comparisons for a query
 */
export async function getBaselineComparisons(queryName: string): Promise<BaselineResult[]> {
  try {
    const response = await fetchWithRetry(`/api/pipeline/baselines/${encodeURIComponent(queryName)}`, {});
    
    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch baseline comparisons');
      } catch (jsonError) {
        // If response.json() fails, throw the JSON parsing error
        throw jsonError;
      }
    }

    return response.json();
  } catch (error) {
    // Handle network errors (fetch rejection) - re-throw immediately
    throw error;
  }
}

/**
 * Get real API test results for dashboard
 */
export async function getRealApiTestResults(pipelineId: string): Promise<{
  total: number;
  tested: number;
  passed: number;
  failed: number;
  results: Array<{
    queryName: string;
    status: 'passed' | 'failed' | 'pending';
    baselineExists: boolean;
    comparisonResult?: {
      matches: boolean;
      differences: DifferenceDetail[];
    };
  }>;
}> {
  try {
    const response = await fetchWithRetry(`/api/pipeline/${pipelineId}/real-api-tests`, {});
    
    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch real API test results');
      } catch (jsonError) {
        // If response.json() fails, throw the JSON parsing error
        throw jsonError;
      }
    }

    return response.json();
  } catch (error) {
    // Handle network errors (fetch rejection) - re-throw immediately
    throw error;
  }
}

/**
 * Trigger real API testing for all queries in pipeline
 */
export async function triggerRealApiTests(pipelineId: string, auth: TestParams['auth']): Promise<void> {
  try {
    const response = await fetchWithRetry(`/api/pipeline/${pipelineId}/trigger-real-api-tests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth }),
    });
    
    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.message || 'Failed to trigger real API tests');
      } catch (jsonError) {
        // If response.json() fails, throw the JSON parsing error
        throw jsonError;
      }
    }
  } catch (error) {
    // Handle network errors (fetch rejection) - re-throw immediately
    throw error;
  }
}
