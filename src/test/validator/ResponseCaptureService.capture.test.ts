import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import axios, { AxiosInstance } from 'axios';
import pRetry from 'p-retry';
import pLimit from 'p-limit';
import { ResponseCaptureService } from '../../core/validator/ResponseCaptureService';
import { EndpointConfig } from '../../core/validator/types';
import { ResolvedQuery } from '../../core/extraction/types/query.types';
// Mock modules
vi.mock('p-limit', () => ({
  default: () => (fn: Function) => fn()
}))
vi.mock('../../core/validator/VariableGenerator', () => ({
  VariableGeneratorImpl: vi.fn().mockImplementation(() => ({
    generateForQuery: vi.fn().mockResolvedValue([{}])
  }))

// Mock modules


}));

// Mock all dependencies at the module level
vi.mock('axios');
vi.mock('p-retry');
vi.mock('../../utils/logger');

const createMockAxiosInstance = () => ({
  post: vi.fn(),
  interceptors: {
    response: {
      use: vi.fn()
    }
  }
});

describe('ResponseCaptureService - Capture Operations', () => {
  let service: ResponseCaptureService;
  let mockAxiosInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock for each test
    mockAxiosInstance = {
      post: vi.fn()
    };

    // Create fresh axios mock for each test
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  const mockedAxios = vi.mocked(axios);
  const mockedPRetry = vi.mocked(pRetry);

  const mockEndpoint: EndpointConfig = {
    url: 'https://api.example.com/graphql',
    headers: { 'Authorization': 'Bearer test-token' },
    timeout: 30000
  };

  const mockQuery: ResolvedQuery = {
    id: 'query-1',
    content: 'query GetUser { user { id name } }',
    name: 'GetUser',
    type: 'query',
    filePath: 'test.ts',
    location: { line: 1, column: 1, file: 'test.ts' },
    ast: null,
    resolvedContent: 'query GetUser { user { id name } }',
    resolvedFragments: [],
    allDependencies: []
  };

  const createMockResponse = (id: string = '123', name: string = 'Test User') => ({
    data: {
      data: {
        user: { id, name }
      }
    },
    status: 200,
    headers: { 'content-type': 'application/json' }
  });

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Create a fresh axios instance for each test
    mockAxiosInstance = createMockAxiosInstance();

    // Setup default mock behaviors
    (mockedAxios.create as Mock).mockReturnValue(mockAxiosInstance as any);
    (mockedAxios.isAxiosError as any).mockReturnValue(false);

    // Default p-retry behavior - just execute the function
    mockedPRetry.mockImplementation(async (fn: any) => fn());
  });

  describe('captureBaseline', () => {
    it('should capture baseline responses for queries', async () => {
      const queries: ResolvedQuery[] = [mockQuery];

      // Use function to return fresh data
      mockAxiosInstance.post.mockImplementation(() => Promise.resolve({
        data: {
          data: {
            user: { id: '123', name: 'Test User' }
          }
        },
        headers: {},
        status: 200,
        statusText: 'OK'
      }));

      service = new ResponseCaptureService([mockEndpoint]);
      const result = await service.captureBaseline(queries);

      expect(result.responses.size).toBe(1);
      expect(result.responses.has('query-1')).toBe(true);
      expect(result.metadata.totalQueries).toBe(1);
      expect(result.metadata.successCount).toBe(1);
      expect(result.metadata.errorCount).toBe(0);

      const capturedResponse = result.responses.get('query-1');
      expect(capturedResponse?.queryId).toBe('query-1');
      expect(capturedResponse?.response).toEqual({
        data: {
          user: { id: '123', name: 'Test User' }
        }
      });
      expect(capturedResponse?.version).toBe('baseline');
    });

    it('should handle multiple queries in parallel', async () => {
      const queries: ResolvedQuery[] = [
        { ...mockQuery, id: 'query-1' },
        { ...mockQuery, id: 'query-2' },
        { ...mockQuery, id: 'query-3' }
      ];

      // Return fresh data for each call
      let callCount = 0;
      mockAxiosInstance.post.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          data: { data: { user: { id: String(callCount), name: `User ${callCount}` } } },
          headers: {},
          status: 200,
          statusText: 'OK'
        });
      });

      service = new ResponseCaptureService([mockEndpoint]);
      const result = await service.captureBaseline(queries);

      expect(result.responses.size).toBe(3);
      expect(result.metadata.totalQueries).toBe(3);
      expect(result.metadata.successCount).toBe(3);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should handle query capture errors', async () => {
      const queries = [mockQuery, { ...mockQuery, id: 'query-2' }];

      // Make second query fail
      mockAxiosInstance.post
        .mockResolvedValueOnce(createMockResponse())
        .mockRejectedValueOnce(new Error('Network error'));

      service = new ResponseCaptureService([mockEndpoint]);
      const result = await service.captureBaseline(queries);

      expect(result.responses.size).toBe(1); // Only successful query captured
      expect(result.metadata.totalQueries).toBe(2);
      expect(result.metadata.successCount).toBe(1);
      expect(result.metadata.errorCount).toBe(1);
    });

    it('should use custom endpoint when provided', async () => {
      const customEndpoint: EndpointConfig = {
        url: 'https://custom.api.com/graphql',
        headers: { 'X-Custom': 'header' }
      };

      // Create new axios instance for custom endpoint
      const customAxiosInstance = createMockAxiosInstance();
      customAxiosInstance.post.mockResolvedValue(createMockResponse());

      (mockedAxios.create as Mock)
        .mockReturnValueOnce(mockAxiosInstance as any)  // For main endpoint
        .mockReturnValueOnce(customAxiosInstance as any); // For custom endpoint

      const service2 = new ResponseCaptureService([mockEndpoint, customEndpoint]);
      const result = await service2.captureBaseline([mockQuery], customEndpoint);

      expect(result.metadata.endpoint).toEqual(customEndpoint);
    });

    it('should capture response metadata correctly', async () => {
      // Set up the mock response for this test
      mockAxiosInstance.post.mockResolvedValue(createMockResponse());

      service = new ResponseCaptureService([mockEndpoint]);
      const result = await service.captureBaseline([mockQuery]);

      expect(result.responses.size).toBe(1);
      const capturedResponse = result.responses.get('query-1');
      expect(capturedResponse).toBeDefined();
      expect(capturedResponse?.metadata).toMatchObject({
        duration: expect.any(Number),
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        size: expect.any(Number),
        endpoint: mockEndpoint.url,
        environment: 'production'
      });
    });

    it('should handle empty query list', async () => {
      service = new ResponseCaptureService([mockEndpoint]);
      const result = await service.captureBaseline([]);

      expect(result.responses.size).toBe(0);
      expect(result.metadata.totalQueries).toBe(0);
      expect(result.metadata.successCount).toBe(0);
      expect(result.metadata.errorCount).toBe(0);
    });
  });

  describe('captureTransformed', () => {
    it('should capture transformed responses', async () => {
      const queries = [mockQuery];
      const transformationVersion = 'v1.2.3';

      // Set up the mock response for this test
      mockAxiosInstance.post.mockResolvedValue(createMockResponse());

      service = new ResponseCaptureService([mockEndpoint]);
      const result = await service.captureTransformed(queries, undefined, transformationVersion);

      expect(result.transformationVersion).toBe(transformationVersion);
      expect(result.responses.size).toBe(1);
    });

    it('should use default transformation version', async () => {
      const queries = [mockQuery];

      // Set up the mock response for this test
      mockAxiosInstance.post.mockResolvedValue(createMockResponse());

      service = new ResponseCaptureService([mockEndpoint]);
      const result = await service.captureTransformed(queries);

      expect(result.transformationVersion).toBe('latest');
    });
  });

  describe('captureWithVariableSets', () => {
    it('should capture responses for multiple variable sets', async () => {
      const variableSets = [
        { userId: '1' },
        { userId: '2' },
        { userId: '3' }
      ];

      // Set up the mock response for this test
      mockAxiosInstance.post.mockResolvedValue(createMockResponse());

      service = new ResponseCaptureService([mockEndpoint]);
      const responses = await service.captureWithVariableSets(mockQuery, variableSets);

      expect(responses).toHaveLength(3);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('captureBatch', () => {
    it('should capture batched queries', async () => {
      const queries = [
        mockQuery,
        { ...mockQuery, id: 'query-2', name: 'GetUser2' }
      ];

      const batchResponse = {
        data: [
          { data: { user: { id: '1' } } },
          { data: { user: { id: '2' } } }
        ],
        status: 200,
        headers: {}
      };

      mockAxiosInstance.post.mockResolvedValue(batchResponse);

      service = new ResponseCaptureService([mockEndpoint]);
      const result = await service.captureBatch(queries);

      expect(result.queryId).toMatch(/^batch-/);
      expect(result.operationName).toBe('BatchQuery');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', [
        {
          query: queries[0].resolvedContent,
          operationName: queries[0].name,
          variables: {}
        },
        {
          query: queries[1].resolvedContent,
          operationName: queries[1].name,
          variables: {}
        }
      ]);
    });
  });

  describe('captureSubscription', () => {
    it('should capture subscription responses', async () => {
      const subscriptionQuery: ResolvedQuery = {
        ...mockQuery,
        type: 'subscription',
        content: 'subscription OnUpdate { update { id } }'
      };

      // Set up the mock response for this test
      mockAxiosInstance.post.mockResolvedValue(createMockResponse());

      service = new ResponseCaptureService([mockEndpoint]);
      const result = await service.captureSubscription(subscriptionQuery, mockEndpoint);

      expect(result).toHaveLength(1);
      expect(result[0].queryId).toBe('query-1');
    });
  });
});
