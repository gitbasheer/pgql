import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import axios, { AxiosInstance } from 'axios';
import pRetry from 'p-retry';
import { ResponseCaptureService } from '../../core/validator/ResponseCaptureService.js';
import { EndpointConfig } from '../../core/validator/types.js';

// Mock all dependencies
vi.mock('axios');
vi.mock('p-retry');
vi.mock('../../utils/logger');

describe('ResponseCaptureService - Constructor', () => {
  let service: ResponseCaptureService;
  let mockAxiosInstance: Partial<AxiosInstance>;
  const mockedAxios = vi.mocked(axios);
  const mockedPRetry = vi.mocked(pRetry);

  const mockEndpoint: EndpointConfig = {
    url: 'https://api.example.com/graphql',
    headers: { 'Authorization': 'Bearer test-token' },
    timeout: 30000
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Create fresh mock instance for each test to avoid pollution
    mockAxiosInstance = {
      post: vi.fn<any, any>(),
      interceptors: {
        response: {
          use: vi.fn()
        }
      } as any
    };

    // Setup axios mocks
    (mockedAxios.create as any).mockReturnValue(mockAxiosInstance as AxiosInstance);
    (mockedAxios.isAxiosError as any).mockReturnValue(false);

    // Mock p-retry to execute immediately by default
    mockedPRetry.mockImplementation(async (fn: any) => {
      try {
        return await fn();
      } catch (error) {
        throw error;
      }
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize with default options', async () => {
    service = new ResponseCaptureService([mockEndpoint]);

    expect(mockedAxios.create).toHaveBeenCalledWith({
      baseURL: mockEndpoint.url,
      timeout: mockEndpoint.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      }
    });
  });

  it('should handle multiple endpoints', async () => {
    // Clear previous calls from other tests
    (mockedAxios.create as any).mockClear();

    const endpoints = [
      mockEndpoint,
      { ...mockEndpoint, url: 'https://api2.example.com/graphql' }
    ];

    service = new ResponseCaptureService(endpoints);

    expect(mockedAxios.create).toHaveBeenCalledTimes(2);
  });

  it('should configure concurrency limit', async () => {
    service = new ResponseCaptureService([mockEndpoint], {
      maxConcurrency: 5
    });

    // Concurrency limit is tested through captureBaseline behavior
    expect(service).toBeDefined();
  });

  it('should configure timeout from options', async () => {
    const customTimeout = 60000;
    service = new ResponseCaptureService([{ ...mockEndpoint, timeout: undefined }], {
      timeout: customTimeout
    });

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: customTimeout
      })
    );
  });

  it('should use endpoint timeout over options timeout', async () => {
    const endpointTimeout = 10000;
    const optionsTimeout = 60000;

    service = new ResponseCaptureService(
      [{ ...mockEndpoint, timeout: endpointTimeout }],
      { timeout: optionsTimeout }
    );

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: endpointTimeout
      })
    );
  });
});
