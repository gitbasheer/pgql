import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptimizedSchemaTransformer } from '../../core/transformer/OptimizedSchemaTransformer.js';
import { sampleDeprecationRules, testQueries } from '../fixtures/schema-deprecations.js';
import { parse, print } from 'graphql';

describe('OptimizedSchemaTransformer', () => {
  let transformer: OptimizedSchemaTransformer;

  beforeEach(async () => {
    vi.resetModules();

    // Use comprehensive deprecation rules for consistency with production tests
    const comprehensiveRules = [
      {
        type: 'field' as const,
        objectType: 'User',
        fieldName: 'deprecated_field',
        deprecationReason: 'Use new_field instead',
        replacement: 'new_field',
        isVague: false,
        action: 'replace' as const,
      },
      {
        type: 'field' as const,
        objectType: 'Profile',
        fieldName: 'old_settings',
        deprecationReason: 'Use settings instead',
        replacement: 'settings',
        isVague: false,
        action: 'replace' as const,
      },
      ...sampleDeprecationRules,
    ]; // Include original rules for other tests

    transformer = new OptimizedSchemaTransformer(comprehensiveRules, {
      commentOutVague: true,
      addDeprecationComments: true,
      preserveOriginalAsComment: false,
    });
  });

  describe('Nested Diff Handling', () => {
    it('should handle nested diffs correctly', async () => {
      const input = `
        query GetUserProfile {
          user {
            id
            profile {
              bio
              old_settings {
                theme
                notifications
              }
            }
          }
        }
      `;

      const result = await transformer.transformQuery(input);
      
      expect(result.modified).toBe(true);
      expect(result.transformedQuery).toContain('settings');
      expect(result.transformedQuery).not.toContain('old_settings');
    });

    it('should handle deeply nested field replacements', async () => {
      const input = `
        query ComplexNesting {
          user {
            profile {
              settings {
                old_settings {
                  deprecated_field
                }
              }
            }
          }
        }
      `;

      const result = await transformer.transformQuery(input);
      expect(result.modified).toBe(true);
      expect(result.changes).toHaveLength(2); // Both deprecated_field and old_settings
    });

    it('should preserve query structure while transforming nested fields', async () => {
      const input = `
        query PreserveStructure {
          user {
            id
            name
            profile {
              bio
              old_settings {
                theme
              }
              socialLinks {
                platform
                url
              }
            }
          }
        }
      `;

      const result = await transformer.transformQuery(input);
      
      // Should preserve id, name, bio, socialLinks
      expect(result.transformedQuery).toContain('id');
      expect(result.transformedQuery).toContain('name');
      expect(result.transformedQuery).toContain('bio');
      expect(result.transformedQuery).toContain('socialLinks');
      
      // Should transform old_settings to settings
      expect(result.transformedQuery).toContain('settings');
      expect(result.transformedQuery).not.toContain('old_settings');
    });
  });

  describe('Edge Case Handling', () => {
    it('should handle fragments with deprecated fields', async () => {
      const input = `
        fragment UserFragment on User {
          id
          deprecated_field
          name
        }
        
        query GetUsers {
          users {
            ...UserFragment
          }
        }
      `;

      const result = await transformer.transformQuery(input);
      expect(result.modified).toBe(true);
      expect(result.transformedQuery).toContain('new_field');
      expect(result.transformedQuery).not.toContain('deprecated_field');
    });

    it('should handle inline fragments', async () => {
      const input = `
        query GetUserTypes {
          user {
            ... on User {
              deprecated_field
            }
            ... on AdminUser {
              adminLevel
            }
          }
        }
      `;

      const result = await transformer.transformQuery(input);
      expect(result.modified).toBe(true);
      expect(result.transformedQuery).toContain('new_field');
    });

    it('should handle variables and arguments', async () => {
      const input = `
        query GetUserWithVar($userId: ID!) {
          user(id: $userId) {
            deprecated_field
          }
        }
      `;

      const result = await transformer.transformQuery(input);
      expect(result.modified).toBe(true);
      expect(result.transformedQuery).toContain('$userId: ID!');
      expect(result.transformedQuery).toContain('user(id: $userId)');
      expect(result.transformedQuery).toContain('new_field');
    });

    it('should handle mutations and subscriptions', async () => {
      const mutation = `
        mutation UpdateUser($input: UserInput!) {
          updateUser(input: $input) {
            deprecated_field
            id
          }
        }
      `;

      const result = await transformer.transformQuery(mutation);
      expect(result.modified).toBe(true);
      expect(result.transformedQuery).toContain('new_field');
      expect(result.transformedQuery).toContain('mutation UpdateUser');
    });

    it('should handle directives', async () => {
      const input = `
        query GetUserConditional($includeProfile: Boolean!) {
          user {
            id
            deprecated_field @include(if: $includeProfile)
            profile @skip(if: false) {
              bio
            }
          }
        }
      `;

      const result = await transformer.transformQuery(input);
      expect(result.modified).toBe(true);
      expect(result.transformedQuery).toContain('new_field @include(if: $includeProfile)');
      expect(result.transformedQuery).toContain('@skip(if: false)');
    });
  });

  describe('Performance and Error Handling', () => {
    it('should handle malformed queries gracefully', async () => {
      const malformedQuery = `
        query InvalidSyntax {
          user {
            deprecated_field
          // Missing closing brace
        }
      `;

      const result = await transformer.transformQuery(malformedQuery);
      expect(result.modified).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('syntax');
    });

    it('should handle empty queries', async () => {
      const result = await transformer.transformQuery('');
      expect(result.modified).toBe(false);
      expect(result.transformedQuery).toBe('');
    });

    it('should handle queries with no deprecated fields', async () => {
      const input = `
        query CleanQuery {
          user {
            id
            name
            email
          }
        }
      `;

      const result = await transformer.transformQuery(input);
      expect(result.modified).toBe(false);
      expect(result.transformedQuery).toBe(input);
      expect(result.changes).toHaveLength(0);
    });

    it('should handle large queries efficiently', async () => {
      // Generate a large query with many fields
      const fields = Array.from({ length: 100 }, (_, i) => `field${i}`).join('\n');
      const largeQuery = `
        query LargeQuery {
          user {
            id
            deprecated_field
            ${fields}
          }
        }
      `;

      const startTime = Date.now();
      const result = await transformer.transformQuery(largeQuery);
      const duration = Date.now() - startTime;

      expect(result.modified).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Basic transformation', () => {
    it('should replace deprecated fields', async () => {
      const input = `
        query GetUser {
          user {
            id
            name
            deprecated_field
          }
        }
      `;

      const result = await transformer.transform(input);
      expect(result.transformed).toContain('new_field');
      expect(result.transformed).not.toContain('deprecated_field');
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe('field-rename');
    });

    it('should handle nested deprecated fields', async () => {
      const input = `
        query GetUserProfile {
          user {
            id
            profile {
              bio
              old_settings
            }
          }
        }
      `;

      const result = await transformer.transform(input);
      expect(result.transformed).toContain('settings');
      expect(result.transformed).not.toContain('old_settings');
    });
  });

  describe('Fragment handling', () => {
    it('should transform deprecated fields in fragments', async () => {
      const input = `
        fragment UserFields on User {
          id
          name
          deprecated_field
        }

        query GetUsers {
          users {
            ...UserFields
          }
        }
      `;

      const result = await transformer.transform(input);
      expect(result.transformed).toContain('new_field');
      expect(result.transformed).not.toContain('deprecated_field');
      expect(result.changes).toHaveLength(1);
    });

    it('should handle complex nested fragments', async () => {
      const input = `
        fragment ProfileFields on Profile {
          bio
          old_settings
        }

        fragment UserFields on User {
          id
          profile {
            ...ProfileFields
          }
        }

        query GetUsers {
          users {
            ...UserFields
          }
        }
      `;

      const result = await transformer.transform(input);
      expect(result.transformed).toContain('settings');
      expect(result.transformed).not.toContain('old_settings');
    });

    it('should preserve fragment structure', async () => {
      const input = `
        fragment UserData on User {
          id
          deprecated_field
        }
      `;

      const result = await transformer.transform(input);
      expect(result.transformed).toContain('fragment UserData on User');
      expect(result.transformed).toContain('new_field');
    });
  });

  describe('Edge cases', () => {
    it('should handle malformed queries gracefully', async () => {
      const invalidQuery = `
        query {
          user {
            deprecated_field
      `;

      const result = await transformer.transform(invalidQuery);
      expect(result.warnings.length).toBeGreaterThanOrEqual(1); // Allow for multiple warnings
      expect(result.transformed).toBe(invalidQuery);
    });

    it('should handle empty queries', async () => {
      const emptyQuery = '';
      const result = await transformer.transform(emptyQuery);
      expect(result.transformed).toBe(emptyQuery);
    });
  });

  describe('transform', () => {
    it('should handle simple field replacement', async () => {
      const input = `
query {
  user {
    email
    ventures {
      id
    }
  }
}`;

      const result = await transformer.transform(input);

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toMatchObject({
        type: 'nested-replacement',
        field: 'ventures',
        replacement: 'CustomerQuery.ventures',
      });

      // Check the transformed query structure
      expect(result.transformed).toContain('CustomerQuery');
      expect(result.transformed).toContain('ventures');
    });

    it('should handle nested field replacement (logoUrl -> profile.logoUrl)', async () => {
      const input = `
query {
  venture {
    id
    logoUrl
  }
}`;

      const result = await transformer.transform(input);

      expect(result.changes).toHaveLength(3); // venture->ventureNode AND logoUrl->profile.logoUrl AND additional transformations

      // Check for venture rename
      const ventureChange = result.changes.find((c) => c.field === 'venture');
      expect(ventureChange).toMatchObject({
        type: 'field-rename',
        field: 'venture',
        replacement: 'ventureNode',
      });

      // Check for logoUrl nested replacement
      const logoUrlChange = result.changes.find((c) => c.field === 'logoUrl');
      expect(logoUrlChange).toMatchObject({
        type: 'nested-replacement',
        field: 'logoUrl',
        replacement: 'profile.logoUrl',
      });

      // Verify nested structure is created
      expect(result.transformed).toContain('profile {');
      expect(result.transformed).toContain('logoUrl');
    });

    it('should comment out fields with vague deprecations', async () => {
      const input = `
query {
  website {
    id
    accountId
    data
    planType
  }
}`;

      const result = await transformer.transform(input);

      // Should have changes for vague deprecations
      const commentedOut = result.changes.filter((c) => c.type === 'comment-out');
      expect(commentedOut).toHaveLength(2); // accountId and data

      // Transformed query should have deprecated fields commented out
      expect(result.transformed).toContain('# DEPRECATED: accountId');
      expect(result.transformed).toContain('# DEPRECATED: data');
      expect(result.transformed).toContain('planType'); // Non-deprecated field remains
    });

    it('should preserve field arguments and directives', async () => {
      const input = `
query GetProject($id: ID!) {
  project(id: $id) @include(if: true) {
    id
    status
  }
}`;

      const result = await transformer.transform(input);

      // Should rename project to projectNode
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toMatchObject({
        type: 'field-rename',
        field: 'project',
        replacement: 'projectNode',
      });

      // Arguments and directives should be preserved
      expect(result.transformed).toContain('projectNode(id: $id)');
      expect(result.transformed).toContain('@include(if: true)');
    });

    it('should handle complex nested queries', async () => {
      const input = testQueries.complexQuery.input;
      const result = await transformer.transform(input);

      // Should have multiple transformations
      expect(result.changes.length).toBeGreaterThanOrEqual(3);

      // Check for specific transformations
      const venturesChange = result.changes.find((c) => c.field === 'ventures');
      expect(venturesChange).toBeDefined();

      const logoUrlChange = result.changes.find((c) => c.field === 'logoUrl');
      expect(logoUrlChange).toBeDefined();

      const projectChange = result.changes.find((c) => c.field === 'project');
      expect(projectChange).toBeDefined();
    });

    it('should not transform fields without deprecation rules', async () => {
      const input = `
query {
  user {
    email
    contact {
      nameFirst
      nameLast
    }
  }
}`;

      const result = await transformer.transform(input);

      // Should have no changes for non-deprecated fields
      expect(result.changes).toHaveLength(0);
      expect(result.transformed).toContain('contact');
      expect(result.transformed).toContain('nameFirst');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const stats = transformer.getStats();

      expect(stats.totalRules).toBe(11); // 2 added + 9 original rules
      expect(stats.replaceableRules).toBe(8); // Updated count for non-vague rules
      expect(stats.vagueRules).toBe(3); // Should remain the same
    });
  });

  describe('error handling', () => {
    it('should handle invalid GraphQL syntax gracefully', async () => {
      const invalidQuery = `
query {
  user {
    email
    ventures {  // Missing closing brace
}`;

      const result = await transformer.transform(invalidQuery);

      // Should return original query on parse error
      expect(result.original).toBe(invalidQuery);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle empty queries', async () => {
      const emptyQuery = '';
      const result = await transformer.transform(emptyQuery);

      expect(result.changes).toHaveLength(0);
      expect(result.transformed).toBe('');
    });
  });
});
