import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaValidator } from '../../core/validator/SchemaValidator';
import { MigrationValidator } from '../../cli/validate-migration';
import { ResponseComparator } from '../../core/validator/ResponseComparator';
import { buildSchema } from 'graphql';
import { ExtractedQuery } from '../../types';
import { CapturedResponse } from '../../core/validator/types';

describe('Validation Edge Cases', () => {
  describe('Dynamic Pattern Validation', () => {
    let validator: SchemaValidator;
    const schema = buildSchema(`
      type Query {
        getUserV1(id: ID!): User
        getUserV2(id: ID!): User
        getUserV3(id: ID!): User
        ventureDomainV1(domain: String!): Venture
        ventureDomainV2(domain: String!): Venture
      }

      type User {
        id: ID!
        name: String
        email: String
      }

      type Venture {
        id: ID!
        domain: String!
        name: String
      }
    `);

    beforeEach(async () => {
      validator = new SchemaValidator();
      await validator.loadSchema(schema.toString());
    });

    it('should validate queries with dynamic pattern names', async () => {
      const dynamicQueries = [
        `query \${queryNames.getUserById} { getUserV1(id: "123") { id name } }`,
        `query \${conditions.v2 ? 'GetUserV2' : 'GetUserV1'} { getUserV2(id: "456") { id email } }`,
        `query \${getQueryName('user', version)} { getUserV3(id: "789") { id name email } }`
      ];

      for (const query of dynamicQueries) {
        const result = await validator.validateQuery(query);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    it('should handle interpolated field names', async () => {
      const interpolatedQuery = `
        query GetDynamicUser {
          getUserV\${version}(id: "123") {
            id
            \${includeEmail ? 'email' : ''}
            name
          }
        }
      `;

      const result = await validator.validateQuery(interpolatedQuery);
      // Should be valid as GraphQL syntax even with interpolations
      expect(result.errors.some(e => e.type === 'syntax')).toBe(false);
    });

    it('should detect errors in dynamic patterns', async () => {
      const invalidDynamicQuery = `
        query \${queryNames.invalidQuery} {
          nonExistentField {
            id
          }
        }
      `;

      const result = await validator.validateQuery(invalidDynamicQuery);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Cannot query field'))).toBe(true);
      expect(result.errors[0].suggestion).toBeDefined();
    });
  });

  describe('Template Literal Edge Cases', () => {
    let validator: SchemaValidator;

    beforeEach(async () => {
      validator = new SchemaValidator();
      const schema = buildSchema(`
        type Query {
          search(query: String!, filters: SearchFilters): SearchResult
        }

        input SearchFilters {
          category: String
          minPrice: Float
          maxPrice: Float
        }

        type SearchResult {
          items: [Item!]!
          total: Int!
        }

        type Item {
          id: ID!
          name: String!
          price: Float!
        }
      `);
      await validator.loadSchema(schema.toString());
    });

    it('should handle template literals with complex expressions', async () => {
      const complexTemplate = `
        query SearchItems {
          search(
            query: "\${searchTerm.trim().toLowerCase()}"
            filters: {
              category: "\${category || 'all'}"
              minPrice: \${minPrice || 0}
              maxPrice: \${maxPrice || 999999}
            }
          ) {
            items {
              id
              name
              price
            }
            total
          }
        }
      `;

      const result = await validator.validateQuery(complexTemplate);
      expect(result.valid).toBe(true);
    });

    it('should handle nested template expressions', async () => {
      const nestedTemplate = `
        query NestedTemplate {
          search(query: "\${items.map(i => \`item:\${i.id}\`).join(' OR ')}") {
            items { id }
          }
        }
      `;

      const result = await validator.validateQuery(nestedTemplate);
      expect(result.valid).toBe(true);
    });

    it('should handle multiline template literals', async () => {
      const multilineTemplate = `
        query MultilineQuery {
          search(query: \`
            \${conditions.map(c => {
              return \`(\${c.field}:\${c.value})\`;
            }).join(' AND ')}
          \`) {
            items { id name }
          }
        }
      `;

      const result = await validator.validateQuery(multilineTemplate);
      // Should handle backticks in GraphQL
      expect(result.errors.some(e => e.type === 'syntax')).toBe(false);
    });
  });

  describe('Intentional Duplicate Handling', () => {
    let migrationValidator: MigrationValidator;

    beforeEach(() => {
      migrationValidator = new MigrationValidator();
    });

    it('should handle intentional duplicates with different contexts', async () => {
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'admin/users.ts',
          fragments: []
        },
        {
          id: 'query2',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'public/profile.ts',
          fragments: []
        }
      ];

      const afterQueries = beforeQueries.map(q => ({
        ...q,
        source: 'query GetUser { user { id displayName } }'
      }));

      const report = await migrationValidator.validateMigration({
        before: beforeQueries,
        after: afterQueries,
        strictMode: false
      } as any);

      // Should recognize both duplicates were transformed
      expect(report.summary.matchedQueries).toBe(2);
      expect(report.issues.filter(i => i.type === 'structural')).toHaveLength(2);
    });

    it('should detect when only some duplicates are transformed', async () => {
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetVenture',
          source: 'query GetVenture { venture { id name } }',
          type: 'query',
          filePath: 'feature1.ts',
          fragments: []
        },
        {
          id: 'query2',
          name: 'GetVenture',
          source: 'query GetVenture { venture { id name } }',
          type: 'query',
          filePath: 'feature2.ts',
          fragments: []
        },
        {
          id: 'query3',
          name: 'GetVenture',
          source: 'query GetVenture { venture { id name } }',
          type: 'query',
          filePath: 'feature3.ts',
          fragments: []
        }
      ];

      const afterQueries = [
        { ...beforeQueries[0], source: 'query GetVenture { venture { id displayName } }' },
        beforeQueries[1], // Not transformed
        { ...beforeQueries[2], source: 'query GetVenture { venture { id displayName } }' }
      ];

      const report = await migrationValidator.validateMigration({
        before: beforeQueries,
        after: afterQueries,
        strictMode: true
      } as any);

      // Should detect inconsistent transformation
      expect(report.issues.some(i =>
        i.type === 'structural' && i.queryId === 'query2'
      )).toBe(false); // query2 wasn't changed
      expect(report.summary.modifiedQueries).toBe(2);
    });
  });

  describe('Response Validation Edge Cases', () => {
    let comparator: ResponseComparator;

    beforeEach(() => {
      comparator = new ResponseComparator({
        strict: false,
        ignorePatterns: [
          { path: 'data.*.debug', reason: 'Debug fields are environment-specific' },
          { path: /data\.timestamp.*/, reason: 'Timestamps vary between calls' },
          { path: 'data.user.lastSeen', type: 'value', reason: 'Real-time field' }
        ],
        expectedDifferences: [
          {
            path: 'data.user.name',
            expectedChange: { from: 'name', to: 'displayName', type: 'missing-field' },
            reason: 'Field renamed in new schema'
          }
        ]
      });
    });

    it('should handle deeply nested array comparisons', () => {
      const baseline = createResponse({
        users: [
          {
            id: '1',
            posts: [
              { id: 'p1', comments: [{ id: 'c1', text: 'Hello' }] }
            ]
          }
        ]
      });

      const transformed = createResponse({
        users: [
          {
            id: '1',
            posts: [
              { id: 'p1', comments: [{ id: 'c1', text: 'Hello', debug: 'info' }] }
            ]
          }
        ]
      });

      const result = comparator.compare(baseline, transformed);

      // Debug field should be ignored
      const debugDiff = result.differences.find(d =>
        d.path.toString().includes('debug')
      );
      expect(debugDiff?.ignored).toBeDefined();
    });

    it('should handle null vs undefined with configuration', () => {
      const strictComparator = new ResponseComparator({ strict: true });
      const lenientComparator = new ResponseComparator({ strict: false });

      const baseline = createResponse({ user: { id: '1', email: null } });
      const transformed = createResponse({ user: { id: '1', email: undefined } });

      const strictResult = strictComparator.compare(baseline, transformed);
      const lenientResult = lenientComparator.compare(baseline, transformed);

      expect(strictResult.identical).toBe(false);
      expect(lenientResult.identical).toBe(true);
    });

    it('should handle array reordering based on configuration', () => {
      const comparatorWithOrder = new ResponseComparator({
        strict: true,
        ignorePatterns: [
          { path: 'data.items', type: 'array-order', reason: 'Order not guaranteed' }
        ]
      });

      const baseline = createResponse({
        items: [
          { id: '1', name: 'A' },
          { id: '2', name: 'B' },
          { id: '3', name: 'C' }
        ]
      });

      const transformed = createResponse({
        items: [
          { id: '3', name: 'C' },
          { id: '1', name: 'A' },
          { id: '2', name: 'B' }
        ]
      });

      const result = comparatorWithOrder.compare(baseline, transformed);

      // Should detect reordering but mark as ignored
      const orderDiff = result.differences.find(d => d.type === 'array-order');
      expect(orderDiff?.ignored).toBeDefined();
    });

    it('should handle type coercion scenarios', () => {
      const baseline = createResponse({
        stats: {
          count: '100',
          average: 45.5,
          enabled: 'true'
        }
      });

      const transformed = createResponse({
        stats: {
          count: 100,
          average: '45.5',
          enabled: true
        }
      });

      const result = comparator.compare(baseline, transformed);

      // Should detect type changes but mark as fixable
      result.differences.forEach(diff => {
        if (diff.type === 'value-change') {
          expect(diff.fixable).toBe(true);
        }
      });
    });

    it('should handle circular references gracefully', () => {
      const circular1: any = { id: '1', name: 'Test' };
      circular1.self = circular1;

      const circular2: any = { id: '1', name: 'Test' };
      circular2.self = circular2;

      const baseline = createResponse({ data: circular1 });
      const transformed = createResponse({ data: circular2 });

      // Should not throw on circular references
      expect(() => comparator.compare(baseline, transformed)).not.toThrow();
    });
  });

  describe('CI-Friendly Output', () => {
    let validator: SchemaValidator;

    beforeEach(async () => {
      validator = new SchemaValidator();

      try {
        // Attempt to load the actual schema file
        await validator.loadSchemaFromFile('./data/schema.graphql');
      } catch (error) {
        // In tests, we should fail explicitly if the schema file is missing
        // This prevents false positives in CI
        throw new Error(
          `Failed to load schema file: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
          'Ensure schema.graphql exists in the data directory for proper testing.'
        );
      }
    });

    it('should generate machine-readable validation reports', async () => {
      const queries = [
        { id: 'q1', content: 'query { test }' },
        { id: 'q2', content: 'query { invalid }' }
      ];

      const results = await validator.validateQueries(queries, undefined);
      const report = validator.generateValidationReport(results);

      expect(report.machineReadable).toBeDefined();
      expect(report.machineReadable?.version).toBe('1.0.0');
      expect(report.machineReadable?.timestamp).toBeDefined();
      expect(report.machineReadable?.exitCode).toBe(1); // Has invalid queries
    });

    it('should include actionable suggestions in errors', async () => {
      const invalidQuery = `
        query GetNonExistent {
          userr { # Typo in field name
            idd   # Another typo
            namee
          }
        }
      `;

      const result = await validator.validateQuery(invalidQuery);

      expect(result.valid).toBe(false);
      result.errors.forEach(error => {
        expect(error.suggestion).toBeDefined();
        expect(error.suggestion).toContain('Check the schema');
      });
    });
  });
});

// Helper function to create mock responses
function createResponse(data: any): CapturedResponse {
  return {
    queryId: 'test-query',
    operationName: 'TestQuery',
    variables: {},
    response: { data },
    metadata: {
      duration: 100,
      statusCode: 200,
      headers: {},
      size: JSON.stringify(data).length,
      endpoint: 'test',
      environment: 'test'
    },
    timestamp: new Date(),
    version: 'test'
  };
}
