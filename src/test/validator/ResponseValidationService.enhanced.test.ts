import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponseValidationService } from '../../src/core/validator/ResponseValidationService';
import { ExtractedQuery, TestParams } from '../../src/types/pgql.types';
import { parse } from 'graphql';

vi.mock('@apollo/client');
vi.mock('fs/promises');

describe('ResponseValidationService dynamic variables', () => {
  let service: ResponseValidationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ResponseValidationService({
      endpoints: [{ url: 'https://api.example.com', environment: 'test' }],
      capture: { parallel: true, maxConcurrency: 10, timeout: 30000 },
      comparison: { strict: false },
      storage: { type: 'file', path: './test-storage' },
    });
  });

  it('builds variables from testing account - ventureId pattern', async () => {
    const query = `
      query GetVenture($ventureId: UUID!) {
        venture(ventureId: $ventureId) {
          id
          name
        }
      }
    `;

    const testingAccount = {
      id: 'user-123',
      ventures: [{ id: 'venture-456', name: 'Test Venture' }],
    };

    const variables = await service.buildVariables(query, testingAccount);

    expect(variables).toEqual({
      ventureId: 'venture-456',
    });
  });

  it('builds variables from testing account - domainName pattern', async () => {
    const query = `
      query GetProject($domainName: String!) {
        project(domain: $domainName) {
          id
          domain
        }
      }
    `;

    const testingAccount = {
      id: 'user-123',
      projects: [{ id: 'project-789', domain: 'example.com' }],
    };

    const variables = await service.buildVariables(query, testingAccount);

    expect(variables).toEqual({
      domainName: 'example.com',
    });
  });

  it('builds variables with default values for unknown patterns', async () => {
    const query = `
      query ComplexQuery(
        $stringVar: String!,
        $intVar: Int!,
        $boolVar: Boolean!,
        $customId: UUID!
      ) {
        data(
          str: $stringVar,
          num: $intVar,
          flag: $boolVar,
          id: $customId
        ) {
          result
        }
      }
    `;

    const testingAccount = {
      id: 'user-123',
    };

    const variables = await service.buildVariables(query, testingAccount);

    expect(variables).toEqual({
      stringVar: 'test-string',
      intVar: 1,
      boolVar: true,
      customId: 'user-123',
    });
  });

  it('validates query syntax', async () => {
    const validQuery = `
      query GetVenture($id: ID!) {
        venture(id: $id) {
          name
        }
      }
    `;

    const invalidQuery = `
      query GetVenture($id: ID!) {
        venture(id: $id) {
          name
        // Missing closing brace
      }
    `;

    const validResult = await service.validateAgainstSchema(validQuery, 'productGraph');
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);

    const invalidResult = await service.validateAgainstSchema(invalidQuery, 'productGraph');
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  it('generates correct endpoint URLs', async () => {
    process.env.ROOT_DOMAIN = 'godaddy.com';

    const pgQuery: ExtractedQuery = {
      query: 'query { venture { id } }',
      fullExpandedQuery: 'query { venture { id } }',
      name: 'GetVenture',
      variables: {},
      fragments: [],
      endpoint: 'productGraph',
      sourceFile: 'test.js',
    };

    const ogQuery: ExtractedQuery = {
      query: 'query { offer { id } }',
      fullExpandedQuery: 'query { offer { id } }',
      name: 'GetOffer',
      variables: {},
      fragments: [],
      endpoint: 'offerGraph',
      sourceFile: 'test.js',
    };

    const testParams1: TestParams = {
      query: pgQuery,
      testingAccount: { id: 'test' },
      auth: { cookies: 'test', appKey: 'test' },
    };

    const testParams2: TestParams = {
      query: ogQuery,
      testingAccount: { id: 'test' },
      auth: { cookies: 'test', appKey: 'test' },
    };

    // Test endpoint URL generation through private method
    const pgUrl = (service as any).getEndpointUrl('productGraph');
    const ogUrl = (service as any).getEndpointUrl('offerGraph');

    expect(pgUrl).toBe('https://pg.api.godaddy.com/v1/gql/customer');
    expect(ogUrl).toBe('https://og.api.godaddy.com/v1/graphql');
  });
});
