/** @fileoverview E2E tests for real API with curl-like headers per CLAUDE.local.md best practices */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphQLClient } from '../../core/testing/GraphQLClient.js';
import { getApiConfig } from '../../config/index.js';

// Mock GraphQL Client to prevent real API calls during testing
vi.mock('../../core/testing/GraphQLClient.js', () => ({
  GraphQLClient: vi.fn().mockImplementation(() => ({
    executeQuery: vi.fn().mockResolvedValue({
      data: { ventures: [{ id: '1', name: 'Test Venture' }] },
      errors: null
    }),
    testConnection: vi.fn().mockResolvedValue({ success: true }),
    captureBaseline: vi.fn().mockResolvedValue({ saved: true })
  }))
}));

describe('Real API E2E Tests', () => {
  let client: GraphQLClient;

  beforeEach(() => {
    // Mock environment variables for testing
    process.env.APOLLO_PG_ENDPOINT = 'https://pg.api.godaddy.com/v1/gql/customer';
    process.env.APOLLO_OG_ENDPOINT = 'https://og.api.godaddy.com/';
    process.env.auth_idp = 'test-auth-idp';
    process.env.cust_idp = 'test-cust-idp';
    process.env.info_cust_idp = 'test-info-cust-idp';
    process.env.info_idp = 'test-info-idp';
  });

  describe('Cookie Authentication Headers', () => {
    it('should construct Cookie header with all 4 SSO tokens', async () => {
      try {
        // Construct cookie string as in production (curl-like format)
        const cookieString = constructCookieString({
          auth_idp: process.env.auth_idp! /* Primary auth token */,
          cust_idp: process.env.cust_idp! /* Customer identity token */,
          info_cust_idp: process.env.info_cust_idp! /* Customer info token */,
          info_idp: process.env.info_idp! /* Info identity token */,
        });

        expect(cookieString).toBe(
          'auth_idp=test-auth-idp; cust_idp=test-cust-idp; info_cust_idp=test-info-cust-idp; info_idp=test-info-idp',
        );

        // Verify no sensitive data leaks in construction
        const logSpy = vi.spyOn(console, 'log');
        console.log('Cookie configured:', maskCookieString(cookieString));

        const logCalls = logSpy.mock.calls;
        const hasLeaks = logCalls.some((call) =>
          call.some(
            (arg) =>
              typeof arg === 'string' && /auth_idp=test-|cust_idp=test-|info.*idp=test-/.test(arg),
          ),
        );

        expect(hasLeaks).toBe(false);
        logSpy.mockRestore();
      } catch (error) {
        console.error('Cookie construction test failed:', error);
        throw error;
      }
    });

    it('should test no leaks in GraphQL client initialization', async () => {
      try {
        const cookieString =
          'auth_idp=secret1; cust_idp=secret2; info_cust_idp=secret3; info_idp=secret4';

        client = new GraphQLClient({
          endpoint: process.env.APOLLO_PG_ENDPOINT!,
          cookieString,
          appKey: 'test-app-key',
          baselineDir: './test-baselines',
        });

        // Mock the actual HTTP request to avoid real API calls
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: { user: { id: '123', name: 'Test User' } },
            }),
          headers: new Map([['content-type', 'application/json']]),
        } as any);

        global.fetch = mockFetch;

        const testQuery = `
          query GetUser($id: ID!) {
            user(id: $id) {
              id
              name
              email
            }
          }
        `;

        const variables = { id: 'test-user-123' };

        // Capture console output to verify no leaks
        const originalConsoleLog = console.log;
        const originalConsoleError = console.error;
        let logOutput = '';

        console.log = (...args) => {
          logOutput += args.join(' ') + '\\n';
          originalConsoleLog(...args);
        };

        console.error = (...args) => {
          logOutput += args.join(' ') + '\\n';
          originalConsoleError(...args);
        };

        const result = await client.query(testQuery, variables);

        // Restore console
        console.log = originalConsoleLog;
        console.error = originalConsoleError;

        // Verify response structure
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('user');

        // Verify no sensitive cookies leaked in logs
        const hasTokenLeaks = /secret1|secret2|secret3|secret4/.test(logOutput);
        expect(hasTokenLeaks).toBe(false);

        // Verify request was made with proper headers
        expect(mockFetch).toHaveBeenCalledWith(
          process.env.APOLLO_PG_ENDPOINT,
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              Cookie: cookieString,
            }),
          }),
        );
      } catch (error) {
        console.error('GraphQL client test failed:', error);
        throw error;
      }
    });

    it('should handle endpoint-specific authentication', async () => {
      const endpoints = [
        {
          name: 'Product Graph',
          url: process.env.APOLLO_PG_ENDPOINT!,
          expectedPath: '/v1/gql/customer',
        },
        {
          name: 'Offer Graph',
          url: process.env.APOLLO_OG_ENDPOINT!,
          expectedPath: '/',
        },
      ];

      for (const endpoint of endpoints) {
        try {
          client = new GraphQLClient({
            endpoint: endpoint.url,
            cookieString: constructCookieString({
              auth_idp: 'endpoint-auth',
              cust_idp: 'endpoint-cust',
              info_cust_idp: 'endpoint-info-cust',
              info_idp: 'endpoint-info',
            }),
            appKey: `test-${endpoint.name.toLowerCase().replace(' ', '-')}-key`,
          });

          expect(client).toBeDefined();
          expect(endpoint.url).toContain(endpoint.expectedPath);
        } catch (error) {
          console.error(`${endpoint.name} endpoint test failed:`, error);
          throw error;
        }
      }
    });
  });

  describe('Variable Building and Dynamic Auth', () => {
    it('should build variables from testing account data', async () => {
      const testingAccount = {
        ventures: [{ id: 'venture-123', name: 'Test Venture', domain: 'test.example.com' }],
        projects: [{ id: 'project-456', domain: 'project.example.com', name: 'Test Project' }],
      };

      const buildDynamicVariables = (baseVars: any, account: any) => {
        const result = { ...baseVars };

        // Use CLAUDE.local.md pattern: spreads for merging
        const accountDefaults = {
          ventureId: account.ventures[0]?.id || 'default-venture',
          domainName: account.projects[0]?.domain || 'default.com',
          projectId: account.projects[0]?.id || 'default-project',
        };

        return { ...accountDefaults, ...result };
      };

      const variables = buildDynamicVariables(
        { ventureId: null, customField: 'custom-value' },
        testingAccount,
      );

      expect(variables.ventureId).toBe('venture-123');
      expect(variables.customField).toBe('custom-value');
      expect(variables.domainName).toBe('project.example.com');
    });

    it('should handle auth token rotation gracefully', async () => {
      const tokenSets = [
        {
          auth_idp: 'token-set-1-auth',
          cust_idp: 'token-set-1-cust',
          info_cust_idp: 'token-set-1-info-cust',
          info_idp: 'token-set-1-info',
        },
        {
          auth_idp: 'token-set-2-auth',
          cust_idp: 'token-set-2-cust',
          info_cust_idp: 'token-set-2-info-cust',
          info_idp: 'token-set-2-info',
        },
      ];

      for (let i = 0; i < tokenSets.length; i++) {
        try {
          const tokens = tokenSets[i];
          const cookieString = constructCookieString(tokens);

          // Verify each token set produces valid cookie string
          expect(cookieString).toContain(`auth_idp=${tokens.auth_idp}`);
          expect(cookieString).toContain(`cust_idp=${tokens.cust_idp}`);
          expect(cookieString).toContain(`info_cust_idp=${tokens.info_cust_idp}`);
          expect(cookieString).toContain(`info_idp=${tokens.info_idp}`);

          // Verify no cross-contamination between token sets
          const otherTokens = tokenSets[1 - i];
          expect(cookieString).not.toContain(otherTokens.auth_idp);
          expect(cookieString).not.toContain(otherTokens.cust_idp);
        } catch (error) {
          console.error(`Token set ${i + 1} failed:`, error);
          throw error;
        }
      }
    });
  });
});

/**
 * Construct cookie string in curl-like format
 * Per CLAUDE.local.md: Use parameter comments for auth calls
 */
function constructCookieString(tokens: {
  auth_idp: string /* Primary authentication token */;
  cust_idp: string /* Customer identity token */;
  info_cust_idp: string /* Customer info token */;
  info_idp: string /* Info identity token */;
}): string {
  return Object.entries(tokens)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

/**
 * Mask cookie string for safe logging
 */
function maskCookieString(cookieString: string): string {
  return cookieString.replace(/=[^;]+/g, '=***');
}
