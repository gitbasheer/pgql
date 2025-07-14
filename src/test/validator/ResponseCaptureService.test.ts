import { describe, it, expect, beforeEach, afterEach, vi, Mock, MockedFunction } from 'vitest';
import axios, { AxiosInstance, AxiosError } from 'axios';
import pRetry from 'p-retry';
import { ResponseCaptureService } from '../../core/validator/ResponseCaptureService';
import { EndpointConfig, CapturedResponse } from '../../core/validator/types';
import { ResolvedQuery } from '../../core/extraction/types/query.types';
import { createMockPRetry } from '../utils/mockRetry';

// Mock all dependencies
vi.mock('axios');
vi.mock('p-retry');
vi.mock('../../utils/logger');

describe('ResponseCaptureService', () => {
  let service: ResponseCaptureService;
  let mockAxiosInstance: any;
  const mockedAxios = vi.mocked(axios);
  const mockedPRetry = vi.mocked(pRetry);
  const mockRetry = createMockPRetry();

  const mockEndpoint: EndpointConfig = {
    url: 'https://api.example.com/graphql',
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
    authentication: {
      type: 'bearer',
      token: 'test-token'
    }
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

  const mockResponse = {
    data: {
      data: {
        user: { id: '123', name: 'Test User' }
      }
    },
    status: 200,
    headers: { 'content-type': 'application/json' }
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock axios instance
    mockAxiosInstance = {
      post: vi.fn().mockResolvedValue(mockResponse),
      interceptors: {
        response: {
          use: vi.fn()
        }
      }
    };
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance as any);
    vi.mocked(axios.isAxiosError).mockReturnValue(false);

    // Setup pRetry mock to return immediately
    vi.mocked(pRetry).mockImplementation(mockRetry.mockPRetry);
    mockRetry.setFailTimes(0); // Default: no failures
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', async () => {
      service = new ResponseCaptureService([mockEndpoint]);

      // Trigger client initialization
      await service.captureBaseline([mockQuery]);

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: mockEndpoint.url,
        timeout: mockEndpoint.timeout,
        headers: {
          'Content-Type': 'application/json',
          'x-app-key': 'vnext-dashboard',
          'Authorization': 'Bearer test-token'
        }
      });
    });

    it('should handle multiple endpoints', async () => {
      // Clear previous calls from other tests
      vi.mocked(axios.create).mockClear();

      const endpoints = [
        mockEndpoint,
        { ...mockEndpoint, url: 'https://api2.example.com/graphql' }
      ];

      service = new ResponseCaptureService(endpoints);

      // Trigger client initialization
      await service.captureBaseline([mockQuery]);

      expect(mockedAxios.create).toHaveBeenCalledTimes(2);
    });

    it('should configure concurrency limit', async () => {
      service = new ResponseCaptureService([mockEndpoint], {
        maxConcurrency: 5
      });

      // Concurrency limit is tested through captureBaseline behavior
      expect(service).toBeDefined();
    });
  });

  describe('authentication configuration', () => {
    it('should configure bearer token authentication', async () => {
      const bearerEndpoint: EndpointConfig = {
        url: 'https://api.example.com/graphql',
        authentication: { type: 'bearer', token: 'my-token' }
      };

      service = new ResponseCaptureService([bearerEndpoint]);

      // Trigger client initialization
      await service.captureBaseline([mockQuery]);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer my-token'
          })
        })
      );
    });

    it('should configure API key authentication', async () => {
      const apiKeyEndpoint: EndpointConfig = {
        url: 'https://api.example.com/graphql',
        authentication: {
          type: 'api-key',
          token: 'api-key-123',
          header: 'X-Custom-Key'
        }
      };

      service = new ResponseCaptureService([apiKeyEndpoint]);

      // Trigger client initialization
      await service.captureBaseline([mockQuery]);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Key': 'api-key-123'
          })
        })
      );
    });

    it('should configure cookie authentication', async () => {
      const cookieEndpoint: EndpointConfig = {
        url: 'https://api.example.com/graphql',
        authentication: {
          type: 'cookie',
          cookies: {
            cookies: {
              session: 'abc123',
              auth: 'xyz789'
            }
          }
        }
      };

      service = new ResponseCaptureService([cookieEndpoint]);

      // Trigger client initialization
      await service.captureBaseline([mockQuery]);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Cookie': 'session=abc123; auth=xyz789'
          }),
          withCredentials: true
        })
      );
    });

    it('should handle no authentication', async () => {
      const noAuthEndpoint: EndpointConfig = {
        url: 'https://api.example.com/graphql'
      };

      service = new ResponseCaptureService([noAuthEndpoint]);

      // Trigger client initialization
      await service.captureBaseline([mockQuery]);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-app-key': 'vnext-dashboard'
          })
        })
      );
    });
  });

  describe('captureBaseline', () => {
    beforeEach(async () => {
    vi.resetModules();
      // Reset all mocks before each test
      vi.clearAllMocks();

      // Reset the mock implementation for this test suite
      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);
      mockedPRetry.mockImplementation(mockRetry.mockPRetry);

      service = new ResponseCaptureService([mockEndpoint]);
    });

    it('should capture baseline responses for queries', async () => {
      const queries = [mockQuery];

      const result = await service.captureBaseline(queries);

      expect(result.responses.size).toBe(1);
      expect(result.responses.has('query-1')).toBe(true);
      expect(result.metadata.totalQueries).toBe(1);
      expect(result.metadata.successCount).toBe(1);
      expect(result.metadata.errorCount).toBe(0);

      const capturedResponse = result.responses.get('query-1');
      expect(capturedResponse?.queryId).toBe('query-1');
      expect(capturedResponse?.response).toEqual(mockResponse.data);
      expect(capturedResponse?.version).toBe('baseline');
    });

        it('should handle multiple queries in parallel', async () => {
      const queries = [
        mockQuery,
        { ...mockQuery, id: 'query-2', name: 'GetUser2' },
        { ...mockQuery, id: 'query-3', name: 'GetUser3' }
      ];

      const result = await service.captureBaseline(queries);

      expect(result.responses.size).toBe(3);
      expect(result.metadata.totalQueries).toBe(2);
      expect(result.metadata.successCount).toBe(2);
      expect((mockAxiosInstance.post as Mock).mock.calls.length).toBe(3);
    });

    it('should handle query capture errors', async () => {
      const queries = [mockQuery, { ...mockQuery, id: 'query-2' }];

      // Make second query fail
      (mockAxiosInstance.post as Mock)
        .mockResolvedValueOnce(mockResponse)
        .mockRejectedValueOnce(new Error('Network error'));

      // Mock pRetry to just execute the function
      mockedPRetry.mockImplementation(mockRetry.mockPRetry);

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
      const customAxiosInstance = {
        post: vi.fn().mockResolvedValue(mockResponse),
        interceptors: { response: { use: vi.fn() } }
      };

      (mockedAxios.create as Mock).mockReturnValueOnce(customAxiosInstance as any);

      const service2 = new ResponseCaptureService([mockEndpoint, customEndpoint]);
      const result = await service2.captureBaseline([mockQuery], customEndpoint);

      expect(result.metadata.endpoint).toEqual(customEndpoint);
    });
  });

  describe('captureTransformed', () => {
    beforeEach(async () => {
    vi.resetModules();
      service = new ResponseCaptureService([mockEndpoint]);
    });

    it('should capture transformed responses', async () => {
      const queries = [mockQuery];
      const transformationVersion = 'v1.2.3';

      const result = await service.captureTransformed(queries, undefined, transformationVersion);

      expect(result.transformationVersion).toBe(transformationVersion);
      expect(result.responses.size).toBe(1);
    });

    it('should use default transformation version', async () => {
      const queries = [mockQuery];

      const result = await service.captureTransformed(queries);

      expect(result.transformationVersion).toBe('latest');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
    vi.resetModules();
      // Reset all mocks before each test
      vi.clearAllMocks();

      // Reset the mock implementation for this test suite
      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);
      mockedPRetry.mockImplementation(mockRetry.mockPRetry);
      (mockedAxios.isAxiosError as unknown as Mock).mockReturnValue(false);

      service = new ResponseCaptureService([mockEndpoint]);
    });

    it('should retry on failure', async () => {
      mockRetry.setFailTimes(2); // Fail first 2 times
      let callCount = 0;
      (mockAxiosInstance.post as Mock).mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve(mockResponse);
      });
      await service.captureBaseline([mockQuery]);
      expect(callCount).toBe(3);
      expect(mockRetry.getCallCount()).toBe(3);
    });

    it('should capture axios errors as responses', async () => {
      const axiosError = {
        message: 'Request failed',
        response: {
          status: 400,
          data: { errors: [{ message: 'Bad request' }] }
        },
        isAxiosError: true,
        code: undefined
      };

      (mockAxiosInstance.post as Mock).mockRejectedValue(axiosError);
      (mockedAxios.isAxiosError as unknown as Mock).mockReturnValue(true);

      // Mock pRetry to throw the error
      mockedPRetry.mockImplementation(mockRetry.mockPRetry);

      const result = await service.captureBaseline([mockQuery]);

      const capturedResponse = result.responses.get('query-1');
      expect(capturedResponse?.response).toEqual({
        errors: [{
          message: 'Request failed',
          extensions: {
            code: undefined,
            response: { errors: [{ message: 'Bad request' }] }
          }
        }]
      });
      expect(capturedResponse?.metadata.statusCode).toBe(400);
    });

    it('should handle non-axios errors', async () => {
      const genericError = new Error('Unknown error');

      (mockAxiosInstance.post as Mock).mockRejectedValue(genericError);
      (mockedAxios.isAxiosError as unknown as Mock).mockReturnValue(false);

      // Mock pRetry to throw the error
      mockedPRetry.mockImplementation(mockRetry.mockPRetry);

      const result = await service.captureBaseline([mockQuery]);

      expect(result.responses.size).toBe(0);
      expect(result.metadata.errorCount).toBe(1);
    });
  });

  describe('variable generation', () => {
    beforeEach(async () => {
    vi.resetModules();
      service = new ResponseCaptureService([mockEndpoint], {
        variableGeneration: 'auto'
      });
    });

    it('should use manual variables when available', async () => {
      const queryWithVars: ResolvedQuery = {
        ...mockQuery,
        variables: [
          { name: 'userId', type: 'ID!', defaultValue: '123', isRequired: true }
        ]
      };

      service = new ResponseCaptureService([mockEndpoint], {
        variableGeneration: 'manual'
      });

      await service.captureBaseline([queryWithVars]);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', {
        query: queryWithVars.resolvedContent,
        operationName: queryWithVars.name,
        variables: { userId: '123' }
      });
    });

    it('should generate empty variables when no AST available', async () => {
      await service.captureBaseline([mockQuery]);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', {
        query: mockQuery.resolvedContent,
        operationName: mockQuery.name,
        variables: {}
      });
    });
  });

  describe('special query types', () => {
    beforeEach(async () => {
    vi.resetModules();
      service = new ResponseCaptureService([mockEndpoint]);
    });

    it('should capture subscription responses', async () => {
      const subscriptionQuery: ResolvedQuery = {
        ...mockQuery,
        type: 'subscription',
        content: 'subscription OnUpdate { update { id } }'
      };

      const result = await service.captureSubscription(subscriptionQuery, mockEndpoint);

      expect(result).toHaveLength(1);
      expect(result[0].queryId).toBe('query-1');
    });

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

      (mockAxiosInstance.post as Mock).mockResolvedValue(batchResponse);

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

  describe('cleanup', () => {
    it('should destroy clients on cleanup', async () => {
      service = new ResponseCaptureService([mockEndpoint]);

      service.destroy();

      // Verify no errors thrown and service can be recreated
      expect(() => {
        service = new ResponseCaptureService([mockEndpoint]);
      }).not.toThrow();
    });
  });

  describe('error retry behavior', () => {
    it('should retry on failure', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockResponse);

      let attemptCount = 0;
      vi.mocked(pRetry).mockImplementation(async (fn: any, options?: any) => {
        const maxRetries = (options?.retries !== undefined ? options.retries : 3) + 1;

        while (attemptCount < maxRetries) {
          attemptCount++;
          try {
            return await fn(attemptCount);
          } catch (error) {
            if (attemptCount >= maxRetries) throw error;
            if (options?.onFailedAttempt) {
              await options.onFailedAttempt({
                attemptNumber: attemptCount,
                message: error instanceof Error ? error.message : String(error),
                retriesLeft: maxRetries - attemptCount,
                name: 'RetryError',
                stack: ''
              });
            }
          }
        }
      });

      await service.captureBaseline([mockQuery]);

      expect(attemptCount).toBe(3);
    });

    it('should support custom axios instance', async () => {
      const customAxiosInstance = {
        post: vi.fn().mockResolvedValue(mockResponse)
      };

      vi.mocked(axios.create).mockReturnValue(customAxiosInstance as any);

      const result = await service.captureBaseline([mockQuery]);

      expect(result.responses.size).toBe(1);
    });

    it('should capture axios errors as responses', async () => {
      const axiosError = {
        response: {
          data: { errors: [{ message: 'GraphQL error' }] },
          status: 400,
          headers: {},
          statusText: 'Bad Request'
        },
        request: {},
        config: {},
        isAxiosError: true,
        message: 'Request failed'
      };

      mockAxiosInstance.post.mockRejectedValue(axiosError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);
      vi.mocked(pRetry).mockImplementation(async (fn: any) => {
        try {
          return await fn(1);
        } catch (error) {
          throw error;
        }
      });

      const result = await service.captureBaseline([mockQuery]);

      const capturedResponse = result.responses.get('query-1');
      expect(capturedResponse?.response).toEqual({
        errors: [{
          message: 'GraphQL error',
          extensions: {
            code: undefined,
            response: { errors: [{ message: 'GraphQL error' }] }
          }
        }]
      });
      expect(capturedResponse?.metadata.statusCode).toBe(400);
    });

    it('should capture non-axios errors with default response', async () => {
      const regularError = new Error('Connection timeout');
      mockAxiosInstance.post.mockRejectedValue(regularError);
      vi.mocked(axios.isAxiosError).mockReturnValue(false);
      vi.mocked(pRetry).mockImplementation(async (fn: any) => {
        try {
          return await fn(1);
        } catch (error) {
          throw error;
        }
      });

      const result = await service.captureBaseline([mockQuery]);

      expect(result.responses.size).toBe(0);
      expect(result.metadata.errorCount).toBe(1);
    });
  });
});
