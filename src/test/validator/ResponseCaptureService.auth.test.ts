import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios, { AxiosInstance } from 'axios';
import pRetry from 'p-retry';
import { ResponseCaptureService } from '../../core/validator/ResponseCaptureService.js';
import { EndpointConfig } from '../../core/validator/types.js';

// Mock all dependencies
vi.mock('axios');
vi.mock('p-retry');
vi.mock('../../utils/logger');

describe('ResponseCaptureService - Authentication Configuration', () => {
  let service: ResponseCaptureService;
  let mockAxiosInstance: Partial<AxiosInstance>;
  const mockedAxios = vi.mocked(axios);
  const mockedPRetry = vi.mocked(pRetry);

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Create fresh mock instance for each test to avoid pollution
    mockAxiosInstance = {
      post: vi.fn<any, any>(),
      interceptors: {
        response: {
          use: vi.fn(),
        },
      } as any,
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

  it('should configure bearer token authentication', async () => {
    const bearerEndpoint: EndpointConfig = {
      url: 'https://api.example.com/graphql',
      authentication: { type: 'bearer', token: 'my-token' },
    };

    service = new ResponseCaptureService([bearerEndpoint]);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      }),
    );
  });

  it('should configure API key authentication', async () => {
    const apiKeyEndpoint: EndpointConfig = {
      url: 'https://api.example.com/graphql',
      authentication: {
        type: 'api-key',
        token: 'api-key-123',
        header: 'X-Custom-Key',
      },
    };

    service = new ResponseCaptureService([apiKeyEndpoint]);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Key': 'api-key-123',
        }),
      }),
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
            auth: 'xyz789',
          },
        },
      },
    };

    service = new ResponseCaptureService([cookieEndpoint]);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'session=abc123; auth=xyz789',
        }),
        withCredentials: true,
      }),
    );
  });

  it('should handle no authentication', async () => {
    const noAuthEndpoint: EndpointConfig = {
      url: 'https://api.example.com/graphql',
    };

    service = new ResponseCaptureService([noAuthEndpoint]);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('should handle SSO authentication placeholder', async () => {
    const ssoEndpoint: EndpointConfig = {
      url: 'https://api.example.com/graphql',
      authentication: {
        type: 'sso',
        ssoConfig: {
          provider: 'godaddy',
          loginEndpoint: 'https://sso.godaddy.com/login',
        },
      },
    };

    service = new ResponseCaptureService([ssoEndpoint]);

    // SSO is handled separately, so just verify no errors
    expect(service).toBeDefined();
  });

  it('should use default API key header when not specified', async () => {
    const apiKeyEndpoint: EndpointConfig = {
      url: 'https://api.example.com/graphql',
      authentication: {
        type: 'api-key',
        token: 'api-key-456',
      },
    };

    service = new ResponseCaptureService([apiKeyEndpoint]);

    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'api-key-456',
        }),
      }),
    );
  });

  it('should handle custom authentication type', async () => {
    const customAuthEndpoint: EndpointConfig = {
      url: 'https://api.example.com/graphql',
      authentication: {
        type: 'custom',
        customAuth: async (request) => {
          request.headers = { ...request.headers, 'X-Custom-Auth': 'custom-value' };
          return request;
        },
      },
    };

    service = new ResponseCaptureService([customAuthEndpoint]);

    // Custom auth is handled in request interceptor
    expect(service).toBeDefined();
  });
});
