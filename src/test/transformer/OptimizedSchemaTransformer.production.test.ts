import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OptimizedSchemaTransformer } from '../../core/transformer/OptimizedSchemaTransformer.js';
import { TestSchemaLoader } from '../utils/schemaLoader.js';
import { performanceMonitor, monitor } from '../../core/monitoring/PerformanceMonitor.js';
import { transformCache } from 'from '../../core/cache/CacheManager.js'.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'graphql';
import { logger } from '../../utils/logger.js';
describe('OptimizedSchemaTransformer - Production Schema Tests', () => {
  let transformer: OptimizedSchemaTransformer;
  let productionSchema: any;
  const schemaPath = './data/schema.graphql';
  beforeAll(async () => {
    // Load production schema
    productionSchema = await TestSchemaLoader.loadSchema(schemaPath);

    // Create deprecation rules for testing
    const deprecationRules = [{
      type: 'field' as const,
      objectType: 'User',
      fieldName: 'deprecated_field',
      deprecationReason: 'Use new_field instead',
      replacement: 'new_field',
      isVague: false,
      action: 'replace' as const
    }, {
      type: 'field' as const,
      objectType: 'CurrentUser',
      fieldName: 'deprecated_field',
      deprecationReason: 'Use new_field instead',
      replacement: 'new_field',
      isVague: false,
      action: 'replace' as const
    }, {
      type: 'field' as const,
      objectType: 'Profile',
      fieldName: 'old_settings',
      deprecationReason: 'Use settings instead',
      replacement: 'settings',
      isVague: false,
      action: 'replace' as const
    }, {
      type: 'field' as const,
      objectType: 'Project',
      fieldName: 'deprecated_status',
      deprecationReason: 'Use status instead',
      replacement: 'status',
      isVague: false,
      action: 'replace' as const
    }, {
      type: 'field' as const,
      objectType: 'Post',
      fieldName: 'old_content',
      deprecationReason: 'Use content instead',
      replacement: 'content',
      isVague: false,
      action: 'replace' as const
    }, {
      type: 'field' as const,
      objectType: 'User',
      fieldName: 'deprecated_role',
      deprecationReason: 'Use role instead',
      replacement: 'role',
      isVague: false,
      action: 'replace' as const
    }, {
      type: 'field' as const,
      objectType: 'Comment',
      fieldName: 'deprecated_status',
      deprecationReason: 'Use status instead',
      replacement: 'status',
      isVague: false,
      action: 'replace' as const
    }, {
      type: 'field' as const,
      objectType: 'Settings',
      fieldName: 'old_permission_model',
      deprecationReason: 'Use permission_model instead',
      replacement: 'permission_model',
      isVague: false,
      action: 'replace' as const
    }, {
      type: 'field' as const,
      objectType: 'Features',
      fieldName: 'deprecated_flag',
      deprecationReason: 'Use flag instead',
      replacement: 'flag',
      isVague: false,
      action: 'replace' as const
    }, {
      type: 'field' as const,
      objectType: 'User',
      fieldName: 'old_avatar',
      deprecationReason: 'Use avatar instead',
      replacement: 'avatar',
      isVague: false,
      action: 'replace' as const
    }, {
      type: 'field' as const,
      objectType: 'SocialLink',
      fieldName: 'deprecated_verified',
      deprecationReason: 'Use verified instead',
      replacement: 'verified',
      isVague: false,
      action: 'replace' as const
    }];
    transformer = new OptimizedSchemaTransformer(deprecationRules);

    // Clear cache for accurate performance testing
    await transformCache.clear();
    logger.info('Starting production schema transformer tests');
  });
  afterAll(async () => {
    // Generate performance report
    const report = performanceMonitor.generateReport();
    logger.info('Performance Report:\n' + report);

    // Save metrics for CI
    performanceMonitor.saveForCI();

    // Cache statistics
    const cacheStats = transformCache.getStats();
    logger.info(`Transform cache hit rate: ${(cacheStats.hitRate * 100).toFixed(2)}%`);
  });
  describe('Real-world Query Transformations', () => {
    it('should transform deprecated field queries with caching', async () => {
      const query = `
        query GetUserProfile($id: ID!) {
          user(id: $id) {
            id
            name
            email
            deprecated_field
            profile {
              bio
              avatar_url
              old_settings
            }
          }
        }
      `;

      // First transformation (cache miss)
      const opId1 = performanceMonitor.startOperation('transform-deprecated-fields-1');
      const result1 = await transformer.transform(query);
      const metrics1 = performanceMonitor.endOperation(opId1);
      expect(result1.transformed).not.toContain('deprecated_field');
      expect(result1.transformed).not.toContain('old_settings');
      expect(result1.changes.length).toBeGreaterThan(0);

      // Second transformation (cache hit)
      const opId2 = performanceMonitor.startOperation('transform-deprecated-fields-2');
      const result2 = await transformer.transform(query);
      const metrics2 = performanceMonitor.endOperation(opId2);

      // Verify cache is working (second run should be faster)
      if (metrics1?.duration && metrics2?.duration) {
        expect(metrics2.duration).toBeLessThan(metrics1.duration * 0.5);
      }
    });
    it('should handle complex nested queries', async () => {
      const complexQuery = `
        query GetProjectDetails($projectId: ID!, $includeMembers: Boolean!) {
          project(id: $projectId) {
            id
            name
            description
            deprecated_status
            settings {
              visibility
              old_permission_model
              features {
                enabled
                deprecated_flag
              }
            }
            members @include(if: $includeMembers) {
              edges {
                node {
                  id
                  user {
                    name
                    deprecated_role
                  }
                  permissions
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `;
      const opId = performanceMonitor.startOperation('transform-complex-nested');
      const result = await transformer.transform(complexQuery);
      performanceMonitor.endOperation(opId);
      expect(result.transformed).toBeDefined();
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.transformed).not.toContain('deprecated_status');
      expect(result.transformed).not.toContain('old_permission_model');
      expect(result.transformed).not.toContain('deprecated_flag');
      expect(result.transformed).not.toContain('deprecated_role');
    });
    it('should optimize fragment transformations', async () => {
      const queryWithFragments = `
        fragment UserFields on User {
          id
          name
          email
          deprecated_field
          profile {
            ...ProfileFields
          }
        }

        fragment ProfileFields on Profile {
          bio
          avatar_url
          old_settings
          social_links {
            platform
            url
            deprecated_verified
          }
        }

        query GetUsers($limit: Int!) {
          users(first: $limit) {
            edges {
              node {
                ...UserFields
              }
            }
          }
        }
      `;
      const opId = performanceMonitor.startOperation('transform-fragments');
      const result = await transformer.transform(queryWithFragments);
      performanceMonitor.endOperation(opId);
      expect(result.transformed).toContain('fragment UserFields');
      expect(result.transformed).toContain('fragment ProfileFields');
      expect(result.transformed).not.toContain('deprecated_field');
      expect(result.transformed).not.toContain('old_settings');
      expect(result.transformed).not.toContain('deprecated_verified');
    });
    it('should handle batch query transformations efficiently', async () => {
      const batchQueries = [
        `query GetUser1 { user(id: "1") { id name deprecated_field } }`,
        `query GetUser2 { user(id: "2") { id name deprecated_field profile { old_settings } } }`,
        `query GetUser3 { user(id: "3") { id profile { bio old_settings } } }`,
        `query GetUser4 { user(id: "4") { id name deprecated_field } }`,
        `query GetUser5 { user(id: "5") { id name deprecated_field profile { bio old_settings } } }`
      ];
      const opId = performanceMonitor.startOperation('transform-batch');
      const results = await Promise.all(batchQueries.map((query, index) => transformer.transform(query)));
      performanceMonitor.endOperation(opId);

      // All should be transformed successfully
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.transformed).toBeDefined();
        expect(result.changes.length).toBeGreaterThan(0);
      });

      // Check cache effectiveness
      const cacheStats = transformCache.getStats();
      expect(cacheStats.hits).toBeGreaterThan(0);
    });
    it('should handle union and interface transformations', async () => {
      const unionQuery = `
        query SearchContent($term: String!) {
          search(term: $term) {
            ... on User {
              id
              name
              deprecated_field
            }
            ... on Post {
              id
              title
              old_content
              author {
                name
                deprecated_role
              }
            }
            ... on Comment {
              id
              text
              deprecated_status
            }
          }
        }
      `;
      const opId = performanceMonitor.startOperation('transform-union-interface');
      const result = await transformer.transform(unionQuery);
      performanceMonitor.endOperation(opId);
      expect(result.transformed).toBeDefined();
      expect(result.transformed).not.toContain('deprecated_field');
      expect(result.transformed).not.toContain('old_content');
      expect(result.transformed).not.toContain('deprecated_role');
      expect(result.transformed).not.toContain('deprecated_status');
    });
    it('should preserve query structure while transforming', async () => {
      const structuredQuery = `
        query GetDashboard(
          $userId: ID!
          $projectId: ID!
          $includeStats: Boolean!
          $dateRange: DateRange!
        ) {
          user(id: $userId) {
            id
            name
            deprecated_field
            projects(first: 10) @include(if: $includeStats) {
              edges {
                node {
                  id
                  name
                  deprecated_status
                }
              }
            }
          }

          project(id: $projectId) {
            id
            statistics(range: $dateRange) {
              views
              old_metric
              engagement {
                total
                deprecated_breakdown
              }
            }
          }
        }
      `;
      const opId = performanceMonitor.startOperation('transform-preserve-structure');
      const result = await transformer.transform(structuredQuery);
      performanceMonitor.endOperation(opId);

      // Parse both queries to compare structure
      const originalAst = parse(structuredQuery);
      const transformedAst = parse(result.transformed);

      // Should have same number of operations
      expect(transformedAst.definitions.length).toBe(originalAst.definitions.length);

      // Should preserve directives
      expect(result.transformed).toContain('@include(if: $includeStats)');

      // Should preserve variable definitions
      expect(result.transformed).toContain('$userId: ID!');
      expect(result.transformed).toContain('$projectId: ID!');
      expect(result.transformed).toContain('$includeStats: Boolean!');
      expect(result.transformed).toContain('$dateRange: DateRange!');
    });
  });
  describe('Performance Benchmarks', () => {
    it('should meet performance targets for various query sizes', async () => {
      const performanceTargets = [{
        size: 'small',
        lines: 10,
        maxDuration: 50
      }, {
        size: 'medium',
        lines: 50,
        maxDuration: 200
      }, {
        size: 'large',
        lines: 200,
        maxDuration: 1000
      }];
      for (const target of performanceTargets) {
        const query = generateQueryOfSize(target.lines);
        const opId = performanceMonitor.startOperation(`benchmark-${target.size}`);
        await transformer.transform(query);
        const metrics = performanceMonitor.endOperation(opId);
        expect(metrics?.duration).toBeLessThan(target.maxDuration);
        logger.info(`${target.size} query (${target.lines} lines): ${metrics?.duration?.toFixed(2)}ms`);
      }
    });
    it('should demonstrate cache effectiveness', async () => {
      const query = `
        query CacheTest {
          users(first: 100) {
            edges {
              node {
                id
                name
                deprecated_field
                profile {
                  bio
                  old_settings
                }
              }
            }
          }
        }
      `;

      // Clear cache
      await transformCache.clear();
      const beforeStats = transformCache.getStats();

      // Run same query multiple times
      const iterations = 10;
      const durations: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const opId = performanceMonitor.startOperation(`cache-test-${i}`);
        await transformer.transform(query);
        const metrics = performanceMonitor.endOperation(opId);
        if (metrics?.duration) durations.push(metrics.duration);
      }
      const afterStats = transformCache.getStats();

      // First run should be slowest (cache miss)
      expect(durations[0]).toBeGreaterThan(durations[(durations && durations.length) - 1]);

      // Cache hit rate should be reasonable
      expect(afterStats.hitRate).toBeGreaterThan(0.3);

      // Average duration of cached runs should be much lower
      const cachedAvg = durations.slice(1).reduce((a, b) => a + b, 0) / ((durations && durations.length) - 1);
      expect(cachedAvg).toBeLessThan(durations[0] * 0.5);
      logger.info(`Cache performance: First run: ${durations[0].toFixed(2)}ms, Cached avg: ${cachedAvg.toFixed(2)}ms`);
    });
  });
  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed queries gracefully', async () => {
      const malformedQueries = ['{ user { id name deprecated_field',
      // Missing closing braces
      'query { user(id: $id) { name } }',
      // Undefined variable
      '{ ...UserFields }',
      // Undefined fragment
      '{ user { ...on Unknown { id } } }' // Unknown type
      ];
      for (const query of malformedQueries) {
        const opId = performanceMonitor.startOperation('transform-malformed');
        const result = await transformer.transform(query);
        performanceMonitor.endOperation(opId);

        // Should handle gracefully without throwing
        expect(result).toBeDefined();
      }
    });
    it('should handle extremely nested queries', async () => {
      const deepQuery = generateDeeplyNestedQuery(10);
      const opId = performanceMonitor.startOperation('transform-deep-nested');
      const result = await transformer.transform(deepQuery);
      const metrics = performanceMonitor.endOperation(opId);
      expect(result.transformed).toBeDefined();
      expect(metrics?.duration).toBeLessThan(5000); // Should complete within 5s even for deep queries
    });
  });
});

// Helper functions
function generateQueryOfSize(lines: number): string {
  const fields = ['id', 'name', 'email', 'deprecated_field', 'created_at', 'updated_at'];
  let query = 'query LargeQuery {\n';
  for (let i = 0; i < lines - 2; i++) {
    const field = fields[i % fields.length];
    const indent = '  '.repeat(i % 3 + 1);
    if (i % 5 === 0) {
      query += `${indent}user${i} {\n`;
    } else if (i % 5 === 4) {
      query += `${indent}}\n`;
    } else {
      query += `${indent}${field}\n`;
    }
  }
  query += '}';
  return query;
}
function generateDeeplyNestedQuery(depth: number): string {
  let query = 'query DeepQuery {\n';
  let indent = '  ';
  for (let i = 0; i < depth; i++) {
    query += `${indent}level${i} {\n`;
    query += `${indent}  id\n`;
    query += `${indent}  deprecated_field\n`;
    indent += '  ';
  }
  for (let i = depth - 1; i >= 0; i--) {
    indent = '  '.repeat(i + 1);
    query += `${indent}}\n`;
  }
  query += '}';
  return query;
}
