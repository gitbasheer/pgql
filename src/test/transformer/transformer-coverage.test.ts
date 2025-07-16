/** @fileoverview Transformer coverage boost tests - targeting 95%+ coverage */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnhancedOptimizedSchemaTransformer } from '../../core/transformer/OptimizedSchemaTransformer.js';
import { UnifiedSchemaTransformer } from '../../core/transformer/UnifiedSchemaTransformer.js';
import { UnifiedQueryTransformer } from '../../core/transformer/UnifiedQueryTransformer.js';
import { parse, print } from 'graphql';
import type { DeprecationRule } from '../../core/analyzer/SchemaDeprecationAnalyzer.js';
import type { TransformationResult } from '../../types/shared.types.js';

describe('Transformer Edge Cases - 95%+ Coverage', () => {
  let schemaTransformer: EnhancedOptimizedSchemaTransformer;
  let queryTransformer: UnifiedQueryTransformer;
  let unifiedTransformer: UnifiedSchemaTransformer;

  beforeEach(() => {
    schemaTransformer = new EnhancedOptimizedSchemaTransformer([
      // Add some basic deprecation rules for testing
      {
        type: 'field',
        objectType: 'User',
        fieldName: 'name',
        replacement: 'displayName',
        isVague: false,
        deprecationReason: 'Standardizing naming',
        action: 'replace'
      }
    ]);
    queryTransformer = new UnifiedQueryTransformer();
    unifiedTransformer = new UnifiedSchemaTransformer();
  });

  describe('Change Type Mismatch Handling', () => {
    it('should handle field rename transformations correctly', async () => {
      const query = `
        query GetUser {
          user {
            name
            email
            profile
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'User.name',
          replacement: 'User.displayName',
          type: 'field-rename',
          reason: 'Standardizing naming convention'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'test1', content: query, filePath: 'test.js' },
        deprecationRules
      );

      expect(result.transformedQuery).toContain('displayName');
      expect(result.transformedQuery).not.toContain('name\n');
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe('field');
    });

    it('should handle nested object transformations', async () => {
      const query = `
        query GetVenture {
          venture {
            id
            billing {
              plan
              status
            }
            owner {
              profile {
                bio
              }
            }
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'Venture.billing',
          replacement: 'Venture.subscription',
          type: 'nested-replacement',
          reason: 'Billing renamed to subscription'
        },
        {
          field: 'User.profile.bio',
          replacement: 'User.profile.biography',
          type: 'field-rename',
          reason: 'Consistent field naming'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'test2', content: query, filePath: 'test.js' },
        deprecationRules
      );

      expect(result.transformedQuery).toContain('subscription {');
      expect(result.transformedQuery).not.toContain('billing {');
      expect(result.transformedQuery).toContain('biography');
      expect(result.changes).toHaveLength(2);
    });

    it('should handle array field modifications', async () => {
      const query = `
        query GetVentures {
          ventures {
            items {
              id
              name
            }
            total
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'Query.ventures.items',
          replacement: 'Query.ventures.edges',
          type: 'field-rename',
          reason: 'Following GraphQL connections spec'
        },
        {
          field: 'Query.ventures.total',
          replacement: 'Query.ventures.totalCount',
          type: 'field-rename',
          reason: 'Consistent counting field names'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'test3', content: query, filePath: 'test.js' },
        deprecationRules
      );

      expect(result.transformedQuery).toContain('edges {');
      expect(result.transformedQuery).toContain('totalCount');
      expect(result.changes).toHaveLength(2);
    });

    it('should handle scalar type changes with coercion', async () => {
      const query = `
        query GetProduct($minPrice: Float!) {
          products(filter: { minPrice: $minPrice }) {
            id
            price
            discount
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'Product.price',
          replacement: 'Product.priceAmount',
          type: 'field-rename',
          reason: 'Price is now an object with amount and currency'
        },
        {
          field: 'Product.discount',
          replacement: 'Product.discountPercentage',
          type: 'field-rename',
          reason: 'Clarifying discount is a percentage'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'test4', content: query, filePath: 'test.js' },
        deprecationRules
      );

      expect(result.transformedQuery).toContain('priceAmount');
      expect(result.transformedQuery).toContain('discountPercentage');
      expect(result.warnings).toBeDefined();
    });

    it('should handle enum value updates', async () => {
      const query = `
        query GetUsersByStatus($status: UserStatus!) {
          users(status: $status) {
            id
            status
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'UserStatus.ACTIVE',
          replacement: 'UserStatus.ACTIVE_USER',
          type: 'enum-value-rename',
          reason: 'More descriptive enum values'
        },
        {
          field: 'UserStatus.INACTIVE',
          replacement: 'UserStatus.INACTIVE_USER',
          type: 'enum-value-rename',
          reason: 'More descriptive enum values'
        }
      ];

      // Note: Enum value transformation typically happens at runtime
      // This test ensures the transformer recognizes and documents the change
      const result = await schemaTransformer.transformQuery(
        { queryId: 'test5', content: query, filePath: 'test.js' },
        deprecationRules
      );

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('enum value')
        })
      );
    });
  });

  describe('Complex Query Transformations', () => {
    it('should handle multiple simultaneous field changes', async () => {
      const query = `
        query ComplexQuery {
          user {
            name
            email
            profile {
              bio
              avatar
            }
            ventures {
              name
              domain
              billing {
                plan
              }
            }
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'User.name',
          replacement: 'User.displayName',
          type: 'field-rename',
          reason: 'Standardization'
        },
        {
          field: 'User.profile.bio',
          replacement: 'User.profile.biography',
          type: 'field-rename',
          reason: 'Consistency'
        },
        {
          field: 'Venture.domain',
          replacement: 'Venture.domainName',
          type: 'field-rename',
          reason: 'Clarity'
        },
        {
          field: 'Venture.billing',
          replacement: 'Venture.subscription',
          type: 'nested-replacement',
          reason: 'Terminology update'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'complex', content: query, filePath: 'test.js' },
        deprecationRules
      );

      const transformed = result.transformedQuery;
      expect(transformed).toContain('displayName');
      expect(transformed).toContain('biography');
      expect(transformed).toContain('domainName');
      expect(transformed).toContain('subscription {');
      expect(result.changes).toHaveLength(4);
    });

    it('should handle fragment transformations', async () => {
      const query = `
        fragment UserFields on User {
          name
          email
          profile {
            bio
          }
        }
        
        query GetUsers {
          users {
            ...UserFields
            ventures {
              domain
            }
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'User.name',
          replacement: 'User.displayName',
          type: 'field-rename',
          reason: 'Standardization'
        },
        {
          field: 'User.profile.bio',
          replacement: 'User.profile.biography',
          type: 'field-rename',
          reason: 'Consistency'
        },
        {
          field: 'Venture.domain',
          replacement: 'Venture.domainName',
          type: 'field-rename',
          reason: 'Clarity'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'fragment-test', content: query, filePath: 'test.js' },
        deprecationRules
      );

      const transformed = result.transformedQuery;
      // Fragment should be transformed
      expect(transformed).toContain('fragment UserFields on User {');
      expect(transformed).toContain('displayName');
      expect(transformed).toContain('biography');
      // Query should also be transformed
      expect(transformed).toContain('domainName');
    });

    it('should handle variable transformations', async () => {
      const query = `
        query SearchVentures($domain: String!, $status: VentureStatus) {
          ventures(filter: { domain: $domain, status: $status }) {
            id
            domain
            billing {
              plan
            }
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'VentureFilter.domain',
          replacement: 'VentureFilter.domainName',
          type: 'field-rename',
          reason: 'Consistency'
        },
        {
          field: 'Venture.domain',
          replacement: 'Venture.domainName',
          type: 'field-rename',
          reason: 'Consistency'
        },
        {
          field: 'Venture.billing',
          replacement: 'Venture.subscription',
          type: 'nested-replacement',
          reason: 'Terminology'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'var-test', content: query, filePath: 'test.js' },
        deprecationRules
      );

      const transformed = result.transformedQuery;
      // Variable usage in filter should be updated
      expect(transformed).toContain('domainName: $domain');
      // Field selection should be updated
      expect(transformed).toContain('domainName\n');
      expect(transformed).toContain('subscription {');
    });

    it('should handle directive transformations', async () => {
      const query = `
        query GetCachedUser {
          user @cache(ttl: 300) {
            name @deprecated(reason: "Use displayName")
            email
            profile @include(if: true) {
              bio
            }
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'User.name',
          replacement: 'User.displayName',
          type: 'field-rename',
          reason: 'Already marked deprecated'
        },
        {
          field: 'User.profile.bio',
          replacement: 'User.profile.biography',
          type: 'field-rename',
          reason: 'Consistency'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'directive-test', content: query, filePath: 'test.js' },
        deprecationRules
      );

      const transformed = result.transformedQuery;
      // Should preserve directives
      expect(transformed).toContain('@cache(ttl: 300)');
      expect(transformed).toContain('@include(if: true)');
      // Should transform fields
      expect(transformed).toContain('displayName');
      expect(transformed).toContain('biography');
      // Should remove deprecated directive after transformation
      expect(transformed).not.toContain('@deprecated');
    });

    it('should handle inline fragments', async () => {
      const query = `
        query GetContent {
          content {
            ... on BlogPost {
              title
              author {
                name
              }
            }
            ... on Video {
              title
              creator {
                name
              }
            }
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'User.name',
          replacement: 'User.displayName',
          type: 'field-rename',
          reason: 'Standardization'
        },
        {
          field: 'BlogPost.author',
          replacement: 'BlogPost.writer',
          type: 'field-rename',
          reason: 'Terminology'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'inline-test', content: query, filePath: 'test.js' },
        deprecationRules
      );

      const transformed = result.transformedQuery;
      expect(transformed).toContain('writer {');
      expect(transformed).toContain('displayName');
      expect(transformed).toContain('... on Video');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed queries gracefully', async () => {
      const malformedQuery = `
        query GetUser {
          user {
            name
            email
            profile {
              bio
            # Missing closing brace
          }
        }
      `;

      const result = await schemaTransformer.transformQuery(
        { queryId: 'malformed', content: malformedQuery, filePath: 'test.js' },
        []
      );

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Syntax Error');
      expect(result.transformedQuery).toBe('');
    });

    it('should handle circular references in transformations', async () => {
      const query = `
        query GetUser {
          user {
            id
            friends {
              id
              friends {
                id
              }
            }
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'User.friends',
          replacement: 'User.connections',
          type: 'field-rename',
          reason: 'Better naming'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'circular', content: query, filePath: 'test.js' },
        deprecationRules
      );

      const transformed = result.transformedQuery;
      // Should handle nested replacements correctly
      expect(transformed.match(/connections/g)?.length).toBe(2);
      expect(transformed).not.toContain('friends');
    });

    it('should handle empty and null queries', async () => {
      const emptyQuery = '';
      const whitespaceQuery = '   \n\t  ';
      
      const result1 = await schemaTransformer.transformQuery(
        { queryId: 'empty', content: emptyQuery, filePath: 'test.js' },
        []
      );
      
      const result2 = await schemaTransformer.transformQuery(
        { queryId: 'whitespace', content: whitespaceQuery, filePath: 'test.js' },
        []
      );

      expect(result1.warnings).toHaveLength(1);
      expect(result2.warnings).toHaveLength(1);
    });

    it('should handle extremely large queries', async () => {
      // Generate a very large query
      const fields = Array(100).fill(null).map((_, i) => `field${i}`).join('\n    ');
      const largeQuery = `
        query LargeQuery {
          user {
            ${fields}
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'User.field50',
          replacement: 'User.renamedField50',
          type: 'field-rename',
          reason: 'Test'
        }
      ];

      const startTime = Date.now();
      const result = await schemaTransformer.transformQuery(
        { queryId: 'large', content: largeQuery, filePath: 'test.js' },
        deprecationRules
      );
      const endTime = Date.now();

      expect(result.transformedQuery).toBeDefined();
      expect(result.transformedQuery).toContain('renamedField50');
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
    });

    it('should handle special characters in field names', async () => {
      const query = `
        query GetData {
          user {
            _id
            __typename
            field_with_underscore
            "field.with.dots"
          }
        }
      `;

      const deprecationRules: DeprecationRule[] = [
        {
          field: 'User.field_with_underscore',
          replacement: 'User.fieldWithCamelCase',
          type: 'field-rename',
          reason: 'Camel case convention'
        }
      ];

      const result = await schemaTransformer.transformQuery(
        { queryId: 'special', content: query, filePath: 'test.js' },
        deprecationRules
      );

      const transformed = result.transformedQuery;
      expect(transformed).toContain('fieldWithCamelCase');
      expect(transformed).toContain('_id'); // Should preserve
      expect(transformed).toContain('__typename'); // Should preserve
      expect(transformed).toContain('"field.with.dots"'); // Should preserve
    });
  });
});