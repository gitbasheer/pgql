import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  testOnRealApi,
  getBaselineComparisons,
  getRealApiTestResults,
  triggerRealApiTests,
  type TestParams,
  type BaselineResult
} from '../../src/services/api';

describe('API Service - Comprehensive Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('testOnRealApi', () => {
    const mockTestParams: TestParams = {
      query: {
        name: 'getUser',
        fullExpandedQuery: 'query getUser($id: ID!) { user(id: $id) { name email } }',
        endpoint: 'https://api.example.com/graphql'
      },
      auth: {
        cookies: 'auth_token=abc123; session_id=xyz789',
        appKey: 'app-key-123'
      },
      testingAccount: {
        id: 'test-account-456',
        name: 'Test Account',
        type: 'development'
      }
    };

    it('should handle successful real API test with baseline comparison', async () => {
      const mockResponse: BaselineResult = {
        baseline: 'baseline-id-123',
        response: {
          data: { user: { name: 'John Doe', email: 'john@example.com' } },
          status: 200,
          headers: { 'content-type': 'application/json' }
        },
        comparison: {
          matches: true,
          differences: []
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await testOnRealApi(mockTestParams);

      expect(global.fetch).toHaveBeenCalledWith('/api/pipeline/testOnRealApi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockTestParams),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle real API test with baseline differences', async () => {
      const mockResponse: BaselineResult = {
        baseline: 'baseline-id-456',
        response: {
          data: { user: { name: 'Jane Doe', email: 'jane@example.com' } },
          status: 200,
          headers: { 'content-type': 'application/json' }
        },
        comparison: {
          matches: false,
          differences: [
            {
              path: 'user.name',
              expected: 'John Doe',
              actual: 'Jane Doe',
              type: 'value_difference'
            },
            {
              path: 'user.email',
              expected: 'john@example.com',
              actual: 'jane@example.com', 
              type: 'value_difference'
            }
          ]
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await testOnRealApi(mockTestParams);

      expect(result.comparison?.matches).toBe(false);
      expect(result.comparison?.differences).toHaveLength(2);
    });

    it('should handle authentication failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Authentication failed' }),
      });

      await expect(testOnRealApi(mockTestParams)).rejects.toThrow('Authentication failed');
    });

    it('should handle invalid query syntax error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'GraphQL syntax error: Unexpected token' }),
      });

      await expect(testOnRealApi(mockTestParams)).rejects.toThrow('GraphQL syntax error: Unexpected token');
    });

    it('should handle network timeout', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network timeout'));

      await expect(testOnRealApi(mockTestParams)).rejects.toThrow('Network timeout');
    });

    it('should handle malformed JSON response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(testOnRealApi(mockTestParams)).rejects.toThrow('Invalid JSON');
    });

    it('should handle missing error message in response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      await expect(testOnRealApi(mockTestParams)).rejects.toThrow('Failed to test on real API');
    });

    it('should handle large query payloads', async () => {
      const largeQuery = 'query largeQuery { ' + 'field '.repeat(1000) + ' }';
      const largeTestParams: TestParams = {
        ...mockTestParams,
        query: {
          ...mockTestParams.query,
          fullExpandedQuery: largeQuery
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ baseline: 'test', response: { data: {} } }),
      });

      await expect(testOnRealApi(largeTestParams)).resolves.toBeDefined();
    });
  });

  describe('getBaselineComparisons', () => {
    it('should handle successful baseline retrieval', async () => {
      const mockBaselines: BaselineResult[] = [
        {
          baseline: 'baseline-1',
          response: { data: { user: { name: 'Test 1' } }, status: 200, headers: {} },
          comparison: { matches: true, differences: [] }
        },
        {
          baseline: 'baseline-2', 
          response: { data: { user: { name: 'Test 2' } }, status: 200, headers: {} },
          comparison: { matches: false, differences: [{ path: 'user.name', expected: 'Test 1', actual: 'Test 2', type: 'value_difference' }] }
        }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBaselines,
      });

      const result = await getBaselineComparisons('getUser');

      expect(global.fetch).toHaveBeenCalledWith('/api/pipeline/baselines/getUser');
      expect(result).toEqual(mockBaselines);
    });

    it('should handle query name with special characters', async () => {
      const queryName = 'get User@#$%^&*()';
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await getBaselineComparisons(queryName);

      expect(global.fetch).toHaveBeenCalledWith(`/api/pipeline/baselines/${encodeURIComponent(queryName)}`);
    });

    it('should handle baseline not found', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'No baselines found for query' }),
      });

      await expect(getBaselineComparisons('nonExistentQuery')).rejects.toThrow('No baselines found for query');
    });

    it('should handle server error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal server error' }),
      });

      await expect(getBaselineComparisons('getUser')).rejects.toThrow('Internal server error');
    });

    it('should handle empty baseline response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await getBaselineComparisons('emptyQuery');
      expect(result).toEqual([]);
    });
  });

  describe('getRealApiTestResults', () => {
    const mockTestResults = {
      total: 5,
      tested: 3,
      passed: 2,
      failed: 1,
      results: [
        {
          queryName: 'getUser',
          status: 'passed' as const,
          baselineExists: true,
          comparisonResult: {
            matches: true,
            differences: []
          }
        },
        {
          queryName: 'listPosts',
          status: 'failed' as const,
          baselineExists: true,
          comparisonResult: {
            matches: false,
            differences: [
              { path: 'posts[0].title', expected: 'Old Title', actual: 'New Title', type: 'value_difference' as const }
            ]
          }
        },
        {
          queryName: 'getProfile',
          status: 'pending' as const,
          baselineExists: false
        }
      ]
    };

    it('should handle successful test results retrieval', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTestResults,
      });

      const result = await getRealApiTestResults('pipeline-123');

      expect(global.fetch).toHaveBeenCalledWith('/api/pipeline/pipeline-123/real-api-tests');
      expect(result).toEqual(mockTestResults);
    });

    it('should handle pipeline not found', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Pipeline not found' }),
      });

      await expect(getRealApiTestResults('invalid-pipeline')).rejects.toThrow('Pipeline not found');
    });

    it('should handle incomplete pipeline results', async () => {
      const incompleteResults = {
        total: 10,
        tested: 3,
        passed: 2,
        failed: 1,
        results: []
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => incompleteResults,
      });

      const result = await getRealApiTestResults('incomplete-pipeline');
      expect(result.results).toEqual([]);
      expect(result.total).toBe(10);
    });

    it('should handle malformed pipeline ID', async () => {
      const malformedIds = ['', null, undefined, 'pipeline with spaces'];
      
      for (const id of malformedIds) {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => mockTestResults,
        });

        await expect(getRealApiTestResults(id as string)).resolves.toBeDefined();
      }
    });
  });

  describe('triggerRealApiTests', () => {
    const mockAuth = {
      cookies: 'auth_token=abc123',
      appKey: 'app-key-456'
    };

    it('should handle successful test trigger', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(triggerRealApiTests('pipeline-123', mockAuth)).resolves.toBeUndefined();

      expect(global.fetch).toHaveBeenCalledWith('/api/pipeline/pipeline-123/trigger-real-api-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth: mockAuth }),
      });
    });

    it('should handle authentication failure during trigger', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid authentication credentials' }),
      });

      await expect(triggerRealApiTests('pipeline-123', mockAuth)).rejects.toThrow('Invalid authentication credentials');
    });

    it('should handle pipeline already running', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ message: 'Pipeline tests already in progress' }),
      });

      await expect(triggerRealApiTests('pipeline-123', mockAuth)).rejects.toThrow('Pipeline tests already in progress');
    });

    it('should handle invalid auth format', async () => {
      const invalidAuth = {
        cookies: '',
        appKey: ''
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid authentication format' }),
      });

      await expect(triggerRealApiTests('pipeline-123', invalidAuth)).rejects.toThrow('Invalid authentication format');
    });

    it('should handle rate limiting', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ message: 'Rate limit exceeded' }),
      });

      await expect(triggerRealApiTests('pipeline-123', mockAuth)).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle server maintenance', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ message: 'Service temporarily unavailable' }),
      });

      await expect(triggerRealApiTests('pipeline-123', mockAuth)).rejects.toThrow('Service temporarily unavailable');
    });

    it('should handle network connectivity issues', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(triggerRealApiTests('pipeline-123', mockAuth)).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle empty response body', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      await expect(triggerRealApiTests('pipeline-123', mockAuth)).rejects.toThrow('Failed to trigger real API tests');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent API calls', async () => {
      const mockResponse = { baseline: 'test', response: { data: {}, status: 200, headers: {} } };
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const promises = [
        testOnRealApi({
          query: { name: 'query1', fullExpandedQuery: 'query1', endpoint: 'test' },
          auth: { cookies: 'test', appKey: 'test' }
        }),
        testOnRealApi({
          query: { name: 'query2', fullExpandedQuery: 'query2', endpoint: 'test' },
          auth: { cookies: 'test', appKey: 'test' }
        }),
        testOnRealApi({
          query: { name: 'query3', fullExpandedQuery: 'query3', endpoint: 'test' },
          auth: { cookies: 'test', appKey: 'test' }
        })
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should handle response timeout scenarios', async () => {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 100)
      );

      (global.fetch as any).mockImplementationOnce(() => timeoutPromise);

      await expect(testOnRealApi({
        query: { name: 'timeoutQuery', fullExpandedQuery: 'query', endpoint: 'test' },
        auth: { cookies: 'test', appKey: 'test' }
      })).rejects.toThrow('Request timeout');
    });

    it('should handle memory pressure with large responses', async () => {
      const largeResponse = {
        baseline: 'large-baseline',
        response: {
          data: { items: new Array(10000).fill({ id: 1, name: 'test' }) },
          status: 200,
          headers: {}
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => largeResponse,
      });

      const result = await testOnRealApi({
        query: { name: 'largeQuery', fullExpandedQuery: 'query', endpoint: 'test' },
        auth: { cookies: 'test', appKey: 'test' }
      });

      expect(result.response.data.items).toHaveLength(10000);
    });
  });
});