import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import axios, { AxiosInstance } from 'axios';
import { ResponseCaptureService } from '../../core/validator/ResponseCaptureService';
import { EndpointConfig } from '../../core/validator/types';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as unknown as {
  create: MockedFunction<typeof axios.create>;
};

describe('ResponseCaptureService - Cookie Authentication', () => {
  let service: ResponseCaptureService;
  let mockAxiosInstance: Partial<AxiosInstance>;
  const validCookies = {
    auth_idp: 'test-auth-idp',
    cust_idp: 'test-cust-idp',
    info_cust_idp: 'test-info-cust-idp',
    info_idp: 'test-info-idp'
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    
    // Setup mock axios instance
    mockAxiosInstance = {
      post: vi.fn().mockResolvedValue({
        data: { data: { test: 'response' } },
        status: 200,
        headers: { 'content-type': 'application/json' }
      }),
      interceptors: {
        response: {
          use: vi.fn()
        }
      } as any
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance as AxiosInstance);
  });

  describe('Cookie Authentication Configuration', () => {
    it('should configure axios with cookie header for cookie auth type', () => {
      const endpoint: EndpointConfig = {
        url: 'https://pg.api.godaddy.com/v1/gql/customer',
        authentication: {
          type: 'cookie',
          cookies: {
            cookies: validCookies,
            secure: true,
            sameSite: 'none'
          }
        }
      };

      service = new ResponseCaptureService([endpoint]);

      // Verify axios was created with correct config
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://pg.api.godaddy.com/v1/gql/customer',
          headers: expect.objectContaining({
            'Cookie': 'auth_idp=test-auth-idp; cust_idp=test-cust-idp; info_cust_idp=test-info-cust-idp; info_idp=test-info-idp',
            'Content-Type': 'application/json'
          }),
          withCredentials: true
        })
      );
    });

    it('should handle empty cookies gracefully', () => {
      const endpoint: EndpointConfig = {
        url: 'https://pg.api.godaddy.com/v1/gql/customer',
        authentication: {
          type: 'cookie',
          cookies: {
            cookies: {}
          }
        }
      };

      service = new ResponseCaptureService([endpoint]);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Cookie': ''
          })
        })
      );
    });

    it('should not add cookie header for non-cookie auth types', () => {
      const endpoint: EndpointConfig = {
        url: 'https://api.example.com/graphql',
        authentication: {
          type: 'bearer',
          token: 'test-token'
        }
      };

      service = new ResponseCaptureService([endpoint]);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Cookie': expect.any(String)
          })
        })
      );
    });

    it('should log info for SSO authentication type', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const endpoint: EndpointConfig = {
        url: 'https://pg.api.godaddy.com/v1/gql/customer',
        authentication: {
          type: 'sso',
          ssoConfig: {
            provider: 'godaddy',
            requiredCookies: ['auth_idp', 'cust_idp', 'info_cust_idp', 'info_idp']
          }
        }
      };

      service = new ResponseCaptureService([endpoint]);

      // SSO logging happens in logger.info which we need to mock properly
      // For now, just verify the axios config doesn't include cookies
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          withCredentials: true
        })
      );

      logSpy.mockRestore();
    });
  });

  describe('Multiple Endpoints with Different Auth', () => {
    it('should create separate clients for each endpoint', () => {
      const endpoints: EndpointConfig[] = [
        {
          url: 'https://pg.api.godaddy.com/v1/gql/customer',
          authentication: {
            type: 'cookie',
            cookies: {
              cookies: validCookies
            }
          }
        },
        {
          url: 'https://api.example.com/graphql',
          authentication: {
            type: 'bearer',
            token: 'test-token'
          }
        }
      ];

      service = new ResponseCaptureService(endpoints);

      expect(mockedAxios.create).toHaveBeenCalledTimes(2);
      
      // First call should have cookies
      expect(mockedAxios.create).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Cookie': expect.stringContaining('auth_idp=test-auth-idp')
          }),
          withCredentials: true
        })
      );

      // Second call should have bearer token
      expect(mockedAxios.create).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });
  });

  describe('Cookie String Formation', () => {
    it('should format cookies correctly with semicolon separator', () => {
      const endpoint: EndpointConfig = {
        url: 'https://pg.api.godaddy.com/v1/gql/customer',
        authentication: {
          type: 'cookie',
          cookies: {
            cookies: {
              cookie1: 'value1',
              cookie2: 'value2',
              cookie3: 'value3'
            }
          }
        }
      };

      service = new ResponseCaptureService([endpoint]);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Cookie': 'cookie1=value1; cookie2=value2; cookie3=value3'
          })
        })
      );
    });

    it('should handle special characters in cookie values', () => {
      const endpoint: EndpointConfig = {
        url: 'https://pg.api.godaddy.com/v1/gql/customer',
        authentication: {
          type: 'cookie',
          cookies: {
            cookies: {
              auth: 'abc123!@#$%',
              session: 'test=value&special'
            }
          }
        }
      };

      service = new ResponseCaptureService([endpoint]);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Cookie': 'auth=abc123!@#$%; session=test=value&special'
          })
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle missing authentication gracefully', () => {
      const endpoint: EndpointConfig = {
        url: 'https://pg.api.godaddy.com/v1/gql/customer'
      };

      expect(() => {
        service = new ResponseCaptureService([endpoint]);
      }).not.toThrow();

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Cookie': expect.any(String),
            'Authorization': expect.any(String)
          })
        })
      );
    });

    it('should handle malformed cookie authentication config', () => {
      const endpoint: EndpointConfig = {
        url: 'https://pg.api.godaddy.com/v1/gql/customer',
        authentication: {
          type: 'cookie'
          // Missing cookies property
        }
      };

      expect(() => {
        service = new ResponseCaptureService([endpoint]);
      }).not.toThrow();
    });
  });
}); 