import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import axios, { AxiosInstance, AxiosError } from 'axios';
import pRetry from 'p-retry';
import { ResponseCaptureService } from '../../core/validator/ResponseCaptureService.js';
import { EndpointConfig } from '../../core/validator/types.js';
import { ResolvedQuery } from '../../core/extraction/types/query.types.js';
import { createMockPRetry } from '../utils/mockRetry.js';
// Mock modules
vi.mock('p-limit', () => ({
  default: () => (fn: Function) => fn(),
}));
vi.mock('../../core/validator/VariableGenerator', () => ({
  VariableGeneratorImpl: vi.fn().mockImplementation(() => ({
    generateForQuery: vi.fn().mockResolvedValue([{}]),
  })),

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
      use: vi.fn(),
    },
  },
});

describe('ResponseCaptureService - Error Handling', () => {
  let service: ResponseCaptureService;
  let mockAxiosInstance: ReturnType<typeof createMockAxiosInstance>;
  const mockedAxios = vi.mocked(axios);
  const mockedPRetry = vi.mocked(pRetry);
  const mockRetry = createMockPRetry();

  const mockEndpoint: EndpointConfig = {
    url: 'https://api.example.com/graphql',
    headers: { Authorization: 'Bearer test-token' },
    timeout: 30000,
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
    allDependencies: [],
  };

  const mockResponse = {
    data: {
      data: {
        user: { id: '123', name: 'Test User' },
      },
    },
    status: 200,
    headers: { 'content-type': 'application/json' },
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Create a fresh axios instance for each test
    mockAxiosInstance = createMockAxiosInstance();

    // Setup default mock behaviors
    (mockedAxios.create as Mock).mockReturnValue(mockAxiosInstance as any);
    (mockedAxios.isAxiosError as any).mockReturnValue(false);

    // Default p-retry behavior - just execute the function
    mockedPRetry.mockImplementation(mockRetry.mockPRetry);
    mockRetry.setFailTimes(0); // Default: no failures
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should retry on failure', async () => {
    vi.clearAllMocks();
    mockRetry.setFailTimes(2); // Fail first 2 times
    let callCount = 0;

    // Create completely fresh mock instance
    const freshMockAxios = createMockAxiosInstance();
    (mockedAxios.create as Mock).mockReturnValue(freshMockAxios as any);
    (mockedAxios.isAxiosError as any).mockReturnValue(false);

    // Mock axios to fail first 2 times, then succeed
    freshMockAxios.post.mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.reject(new Error('Temporary failure'));
      }
      return Promise.resolve(mockResponse);
    });

    // Mock pRetry to actually retry the function
    mockedPRetry.mockImplementation(async (fn: any, options: any) => {
      let lastError;
      const maxRetries = (options?.retries || 3) + 1;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await fn();
          return result;
        } catch (error) { type: 'query', id: 'generated-id',
          lastError = error;
          if (options?.onFailedAttempt) {
            options.onFailedAttempt({
              attemptNumber: attempt,
              message: (error as Error).message,
              retriesLeft: maxRetries - attempt,
              name: 'FailedAttemptError',
            });
          }
          if (attempt === maxRetries) {
            throw lastError;
          }
        }
      }
      throw lastError;
    });

    service = new ResponseCaptureService([mockEndpoint]);
    const result = await service.captureBaseline([mockQuery]);

    expect(callCount).toBe(3);
    expect(mockRetry.getCallCount()).toBe(3);
    expect(result.responses.size).toBe(1);
    expect(result.metadata.successCount).toBe(1);
    expect(result.metadata.errorCount).toBe(0);
  });

  it('should capture axios errors as responses', async () => {
    // Clear all previous mocks completely
    vi.clearAllMocks();

    const axiosError = {
      message: 'Request failed',
      response: {
        status: 400,
        data: { errors: [{ message: 'Bad request' }] },
        headers: {},
      },
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
    };

    // Create completely fresh mock instance
    const freshMockAxios = createMockAxiosInstance();
    (mockedAxios.create as Mock).mockReturnValue(freshMockAxios as any);

    freshMockAxios.post.mockRejectedValue(axiosError);

    // Make sure isAxiosError returns true when checking our error
    (mockedAxios.isAxiosError as any).mockImplementation((err: any) => err === axiosError);

    // Mock pRetry to just execute the function once (no retries for this test)
    mockedPRetry.mockImplementation(async (fn: any) => {
      return await fn();
    });

    service = new ResponseCaptureService([mockEndpoint]);
    const result = await service.captureBaseline([mockQuery]);

    expect(result.responses.size).toBe(1);
    const capturedResponse = result.responses.get('query-1');
    expect(capturedResponse).toBeDefined();
    expect(capturedResponse?.response).toEqual({
      errors: [
        {
          message: 'Request failed',
          extensions: {
            code: 'ERR_BAD_REQUEST',
            response: { errors: [{ message: 'Bad request' }] },
          },
        },
      ],
    });
    expect(capturedResponse?.metadata.statusCode).toBe(400);
  });

  it('should handle non-axios errors', async () => {
    // Clear all previous mocks completely
    vi.clearAllMocks();

    const genericError = new Error('Unknown error');

    // Create completely fresh mock instance
    const freshMockAxios = createMockAxiosInstance();
    (mockedAxios.create as Mock).mockReturnValue(freshMockAxios as any);

    freshMockAxios.post.mockRejectedValue(genericError);
    (mockedAxios.isAxiosError as any).mockImplementation(() => false);

    // Mock pRetry to pass through the error (let it throw)
    mockedPRetry.mockImplementation(async (fn: any) => {
      return await fn();
    });

    service = new ResponseCaptureService([mockEndpoint]);
    const result = await service.captureBaseline([mockQuery]);

    // Non-axios errors should not be captured as responses (they throw and get caught in captureBaseline)
    expect(result.responses.size).toBe(0);
    expect(result.metadata.errorCount).toBe(1);
    expect(result.metadata.successCount).toBe(0);
  });

  it('should handle network timeout errors', async () => {
    // Clear all previous mocks completely
    vi.clearAllMocks();

    const timeoutError = {
      message: 'timeout of 30000ms exceeded',
      code: 'ECONNABORTED',
      response: undefined,
      isAxiosError: true,
    };

    // Create completely fresh mock instance
    const freshMockAxios = createMockAxiosInstance();
    (mockedAxios.create as Mock).mockReturnValue(freshMockAxios as any);

    freshMockAxios.post.mockRejectedValue(timeoutError);
    (mockedAxios.isAxiosError as any).mockImplementation((err: any) => err === timeoutError);

    // Mock pRetry to just execute the function once (no retries for this test)
    mockedPRetry.mockImplementation(async (fn: any) => {
      return await fn();
    });

    service = new ResponseCaptureService([mockEndpoint]);
    const result = await service.captureBaseline([mockQuery]);

    expect(result.responses.size).toBe(1);
    const capturedResponse = result.responses.get('query-1');
    expect(capturedResponse).toBeDefined();
    expect(capturedResponse?.response.errors?.[0].message).toContain('timeout');
    expect(capturedResponse?.metadata.statusCode).toBe(0);
  });

  it('should handle missing client for endpoint', async () => {
    const unknownEndpoint: EndpointConfig = {
      url: 'https://unknown.example.com/graphql',
    };

    service = new ResponseCaptureService([mockEndpoint]);
    const result = await service.captureBaseline([mockQuery], unknownEndpoint);

    expect(result.responses.size).toBe(0);
    expect(result.metadata.errorCount).toBe(1);
  });

  it('should respect retry policy configuration', async () => {
    const endpointWithRetry: EndpointConfig = {
      ...mockEndpoint,
      retryPolicy: {
        maxRetries: 5,
        initialDelay: 500,
        maxDelay: 5000,
        backoffMultiplier: 1.5,
      },
    };

    let retryCount = 0;

    // Set up mock to fail first 3 times, then succeed
    mockAxiosInstance.post.mockImplementation(() => {
      retryCount++;
      if (retryCount <= 3) {
        return Promise.reject(new Error('Retry test'));
      }
      return Promise.resolve(mockResponse);
    });

    // Mock pRetry to respect the retry policy
    mockedPRetry.mockImplementation(async (fn: any, options: any) => {
      expect(options.retries).toBe(5);
      expect(options.minTimeout).toBe(500);
      expect(options.maxTimeout).toBe(5000);
      expect(options.factor).toBe(1.5);

      // Simulate successful retry after 3 attempts
      let lastError;
      for (let i = 0; i < 4; i++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error;
          if (i === 3) throw error;
        }
      }
      throw lastError;
    });

    service = new ResponseCaptureService([endpointWithRetry]);
    await service.captureBaseline([mockQuery]);

    expect(retryCount).toBe(4);
  });
});
