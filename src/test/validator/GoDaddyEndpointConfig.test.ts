import { describe, it, expect } from 'vitest';
import { GoDaddyEndpointConfig } from '../../core/validator/GoDaddyEndpointConfig.js';

describe('GoDaddyEndpointConfig', () => {
  const validCookies = {
    authIdp: 'test-auth-idp',
    custIdp: 'test-cust-idp',
    infoCustIdp: 'test-info-cust-idp',
    infoIdp: 'test-info-idp'
  };
  
  // Use snake_case for cookie validation
  const validCookiesSnakeCase = {
    auth_idp: 'test-auth-idp',
    cust_idp: 'test-cust-idp',
    info_cust_idp: 'test-info-cust-idp',
    info_idp: 'test-info-idp'
  };

  describe('createEndpoint', () => {
    it('should create endpoint with default production URL', () => {
      const endpoint = GoDaddyEndpointConfig.createEndpoint();
      
      expect(endpoint.url).toBe('https://pg.api.godaddy.com/v1/gql/customer');
      expect(endpoint.name).toBe('godaddy-pg-api');
      expect(endpoint.environment).toBe('production');
      expect(endpoint.timeout).toBe(30000);
    });

    it('should configure cookie authentication when SSO provided', () => {
      const endpoint = GoDaddyEndpointConfig.createEndpoint({ sso: validCookies });
      
      expect(endpoint.authentication?.type).toBe('cookie');
      expect(endpoint.authentication?.cookies?.cookies).toEqual({
        auth_idp: validCookies.authIdp,
        cust_idp: validCookies.custIdp,
        info_cust_idp: validCookies.infoCustIdp,
        info_idp: validCookies.infoIdp
      });
      expect(endpoint.authentication?.cookies?.secure).toBe(true);
      expect(endpoint.authentication?.cookies?.sameSite).toBe('none');
    });

    it('should configure SSO authentication when credentials provided', () => {
      const endpoint = GoDaddyEndpointConfig.createEndpoint({
        autoSSO: true,
        ssoCredentials: {
          username: 'test@example.com',
          password: 'testpass'
        }
      });
      
      expect(endpoint.authentication?.type).toBe('sso');
      expect(endpoint.authentication?.ssoConfig?.provider).toBe('godaddy');
      expect(endpoint.authentication?.ssoConfig?.credentials).toEqual({
        username: 'test@example.com',
        password: 'testpass'
      });
      expect(endpoint.authentication?.ssoConfig?.requiredCookies).toEqual([
        'auth_idp', 'cust_idp', 'info_cust_idp', 'info_idp'
      ]);
    });

    it('should include retry policy configuration', () => {
      const endpoint = GoDaddyEndpointConfig.createEndpoint();
      
      expect(endpoint.retryPolicy).toEqual({
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      });
    });

    it('should include default headers', () => {
      const endpoint = GoDaddyEndpointConfig.createEndpoint();
      
      expect(endpoint.headers).toEqual({
        'User-Agent': 'pg-migration-620/1.0.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      });
    });

    it('should prefer SSO cookies over auto-SSO when both provided', () => {
      const endpoint = GoDaddyEndpointConfig.createEndpoint({
        sso: validCookies,
        autoSSO: true,
        ssoCredentials: {
          username: 'test@example.com',
          password: 'testpass'
        }
      });
      
      expect(endpoint.authentication?.type).toBe('cookie');
      expect(endpoint.authentication?.cookies?.cookies).toEqual({
        auth_idp: validCookies.authIdp,
        cust_idp: validCookies.custIdp,
        info_cust_idp: validCookies.infoCustIdp,
        info_idp: validCookies.infoIdp
      });
    });
  });

  describe('createEndpoints', () => {
    it('should create multiple endpoints for different APIs', () => {
      const apis = ['customer', 'admin', 'internal'];
      const endpoints = GoDaddyEndpointConfig.createEndpoints(apis, { sso: validCookies });
      
      expect(endpoints).toHaveLength(3);
      expect(endpoints[0].url).toBe('https://pg.api.godaddy.com/v1/gql/customer');
      expect(endpoints[0].name).toBe('godaddy-pg-api-customer');
      expect(endpoints[1].url).toBe('https://pg.api.godaddy.com/v1/gql/admin');
      expect(endpoints[1].name).toBe('godaddy-pg-api-admin');
      expect(endpoints[2].url).toBe('https://pg.api.godaddy.com/v1/gql/internal');
      expect(endpoints[2].name).toBe('godaddy-pg-api-internal');
      
      // All should have the same authentication
      endpoints.forEach(endpoint => {
        expect(endpoint.authentication?.type).toBe('cookie');
        expect(endpoint.authentication?.cookies?.cookies).toEqual({
          auth_idp: validCookies.authIdp,
          cust_idp: validCookies.custIdp,
          info_cust_idp: validCookies.infoCustIdp,
          info_idp: validCookies.infoIdp
        });
      });
    });
  });

  describe('validateCookies', () => {
    it('should return true for valid cookies', () => {
      expect(GoDaddyEndpointConfig.validateCookies(validCookiesSnakeCase)).toBe(true);
    });

    it('should return false for missing cookies', () => {
      expect(GoDaddyEndpointConfig.validateCookies({})).toBe(false);
      expect(GoDaddyEndpointConfig.validateCookies({
        authIdp: 'test'
      })).toBe(false);
      expect(GoDaddyEndpointConfig.validateCookies({
        authIdp: 'test',
        custIdp: 'test',
        infoCustIdp: 'test'
        // missing infoIdp
      })).toBe(false);
    });

    it('should return false for cookies with empty values', () => {
      expect(GoDaddyEndpointConfig.validateCookies({
        authIdp: '',
        custIdp: 'test',
        infoCustIdp: 'test',
        infoIdp: 'test'
      })).toBe(false);
    });
  });

  describe('parseCookieString', () => {
    it('should parse valid cookie string', () => {
      const cookieString = 'auth_idp=value1; cust_idp=value2; info_cust_idp=value3; info_idp=value4';
      const parsed = GoDaddyEndpointConfig.parseCookieString(cookieString);
      
      expect(parsed).toEqual({
        auth_idp: 'value1',
        cust_idp: 'value2',
        info_cust_idp: 'value3',
        info_idp: 'value4'
      });
    });

    it('should handle cookies with spaces', () => {
      const cookieString = '  auth_idp = value1 ; cust_idp = value2  ';
      const parsed = GoDaddyEndpointConfig.parseCookieString(cookieString);
      
      expect(parsed).toEqual({
        auth_idp: 'value1',
        cust_idp: 'value2'
      });
    });

    it('should handle empty cookie string', () => {
      const parsed = GoDaddyEndpointConfig.parseCookieString('');
      expect(parsed).toEqual({});
    });

    it('should ignore malformed cookies', () => {
      const cookieString = 'auth_idp=value1; malformed; cust_idp=value2; =noname';
      const parsed = GoDaddyEndpointConfig.parseCookieString(cookieString);
      
      expect(parsed).toEqual({
        auth_idp: 'value1',
        cust_idp: 'value2'
      });
    });

    it('should handle cookies with special characters', () => {
      const cookieString = 'auth_idp=abc123!@#; cust_idp=test%20value';
      const parsed = GoDaddyEndpointConfig.parseCookieString(cookieString);
      
      expect(parsed).toEqual({
        auth_idp: 'abc123!@#',
        cust_idp: 'test%20value'
      });
    });
  });
}); 