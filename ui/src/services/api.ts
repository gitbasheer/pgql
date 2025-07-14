/**
 * API service for Dashboard UI - integrates with Y's GraphQLClient
 */

import type { TestingAccount, ApiResponse, DifferenceDetail } from '../types/api.types';

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
  response: ApiResponse;
  comparison?: {
    matches: boolean;
    differences: DifferenceDetail[];
  };
}

/**
 * Test query against real API using GraphQLClient with baseline saving
 */
export async function testOnRealApi(params: TestParams): Promise<BaselineResult> {
  const response = await fetch('/api/pipeline/testOnRealApi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to test on real API');
  }
  
  return response.json();
}

/**
 * Get baseline comparisons for a query
 */
export async function getBaselineComparisons(queryName: string): Promise<BaselineResult[]> {
  const response = await fetch(`/api/pipeline/baselines/${encodeURIComponent(queryName)}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch baseline comparisons');
  }
  
  return response.json();
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
  const response = await fetch(`/api/pipeline/${pipelineId}/real-api-tests`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch real API test results');
  }
  
  return response.json();
}

/**
 * Trigger real API testing for all queries in pipeline
 */
export async function triggerRealApiTests(pipelineId: string, auth: TestParams['auth']): Promise<void> {
  const response = await fetch(`/api/pipeline/${pipelineId}/trigger-real-api-tests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to trigger real API tests');
  }
}