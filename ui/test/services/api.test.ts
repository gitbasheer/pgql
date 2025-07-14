import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  testOnRealApi,
  getBaselineComparisons,
  getRealApiTestResults,
  triggerRealApiTests,
} from '../../src/services/api';

// Mock fetch globally
global.fetch = vi.fn();

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('testOnRealApi', () => {
    it('should make POST request with correct params', async () => {
      const mockResponse = {
        baseline: 'saved',
        response: { data: 'test' },
        comparison: { matches: true, differences: [] },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const params = {
        query: {
          name: 'TestQuery',
          fullExpandedQuery: 'query Test { test }',
          endpoint: 'productGraph',
        },
        auth: {
          cookies: 'test-cookies',
          appKey: 'test-key',
        },
        testingAccount: { id: 'test-123' },
      };

      const result = await testOnRealApi(params);

      expect(global.fetch).toHaveBeenCalledWith('/api/pipeline/testOnRealApi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error when API returns non-ok response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'API error' }),
      });

      const params = {
        query: {
          name: 'TestQuery',
          fullExpandedQuery: 'query Test { test }',
          endpoint: 'productGraph',
        },
        auth: {
          cookies: 'test-cookies',
          appKey: 'test-key',
        },
      };

      await expect(testOnRealApi(params)).rejects.toThrow('API error');
    });
  });

  describe('getBaselineComparisons', () => {
    it('should fetch baseline comparisons for a query', async () => {
      const mockBaselines = [
        {
          baseline: { test: 'baseline' },
          response: { test: 'response' },
          comparison: { matches: false },
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBaselines,
      });

      const result = await getBaselineComparisons('TestQuery');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/pipeline/baselines/TestQuery'
      );
      expect(result).toEqual(mockBaselines);
    });

    it('should encode query name in URL', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await getBaselineComparisons('Query With Spaces');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/pipeline/baselines/Query%20With%20Spaces'
      );
    });
  });

  describe('getRealApiTestResults', () => {
    it('should fetch test results for a pipeline', async () => {
      const mockResults = {
        total: 10,
        tested: 5,
        passed: 4,
        failed: 1,
        results: [
          {
            queryName: 'TestQuery',
            status: 'passed',
            baselineExists: true,
            comparisonResult: { matches: true },
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResults,
      });

      const result = await getRealApiTestResults('pipeline-123');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/pipeline/pipeline-123/real-api-tests'
      );
      expect(result).toEqual(mockResults);
    });

    it('should throw error when fetch fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Not found' }),
      });

      await expect(getRealApiTestResults('invalid-id')).rejects.toThrow(
        'Not found'
      );
    });
  });

  describe('triggerRealApiTests', () => {
    it('should trigger tests with authentication', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Success' }),
      });

      const auth = {
        cookies: 'session-cookies',
        appKey: 'app-key-123',
      };

      await triggerRealApiTests('pipeline-123', auth);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/pipeline/pipeline-123/trigger-real-api-tests',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth }),
        }
      );
    });

    it('should throw error with default message when none provided', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      await expect(
        triggerRealApiTests('pipeline-123', {
          cookies: 'test',
          appKey: 'test',
        })
      ).rejects.toThrow('Failed to trigger real API tests');
    });
  });
});