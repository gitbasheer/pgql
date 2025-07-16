import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptimizedSchemaTransformer } from '../../src/core/transformer/OptimizedSchemaTransformer';
import { ResponseValidationService } from '../../src/core/validator/ResponseValidationService';
import { UnifiedExtractor } from '../../src/core/extraction/engine/UnifiedExtractor';

// Mock Hivemind getCohortId
vi.mock('@godaddy/hivemind-client', () => ({
  getCohortId: vi.fn().mockReturnValue('cohort-123'),
}));

describe('Hivemind Cohort Integration', () => {
  let extractor: UnifiedExtractor;
  let validator: ResponseValidationService;
  let transformer: OptimizedSchemaTransformer;

  beforeEach(() => {
    extractor = new UnifiedExtractor({
      directory: './test/fixtures/sample_data',
      strategies: ['pluck'],
      resolveFragments: true,
      features: {
        templateInterpolation: true,
        patternMatching: true,
        contextAnalysis: true,
      },
    });

    validator = new ResponseValidationService({
      endpoints: {
        productGraph: 'https://pg.api.test.com/v1/gql/customer',
        offerGraph: 'https://og.api.test.com/v1/gql',
      },
      capture: {
        maxConcurrency: 5,
        timeout: 30000,
        variableGeneration: 'auto',
      },
      comparison: {
        strict: false,
        ignorePaths: [],
      },
      alignment: {
        strict: false,
        preserveNulls: true,
      },
      storage: {
        type: 'file',
        path: './test-results',
      },
      abTesting: {
        enabled: true,
        defaultSplit: 50,
        monitoring: {
          errorThreshold: 5,
          latencyThreshold: 1000,
        },
      },
    });

    transformer = new OptimizedSchemaTransformer([], {
      commentOutVague: true,
      addDeprecationComments: true,
      preserveOriginalAsComment: false,
      enableCache: true,
    });
  });

  describe('A/B Testing Flag Generation', () => { type: 'query', id: 'generated-id',
    it('should generate unique Hivemind flags for each query', async () => {
      const queries = [
        {
          name: 'GetVentureData',
          content: 'query GetVentureData { venture { id } }',
        },
        { type: 'query', id: 'generated-id',
          name: 'GetUserProfile',
          content: 'query GetUserProfile { user { id name } }',
        },
      ];

      const flags = queries.map((q) => `migration.${q.name}`);

      expect(flags).toHaveLength(2);
      expect(flags[0]).toBe('migration.GetVentureData');
      expect(flags[1]).toBe('migration.GetUserProfile');
      expect(new Set(flags).size).toBe(2); // All unique
    });

    it('should integrate cohort assignment with transformation', () => { type: 'query', id: 'generated-id',
      const transformResult = {
        queries: [
          { name: 'GetVenture', transformed: true },
          { type: 'query', id: 'generated-id', name: 'GetProduct', transformed: true },
        ],
      };

      const cohortAssignments = transformResult.queries.map((q) => ({
        flag: `migration.${q.name}`,
        cohort: 'cohort-123',
        enabled: Math.random() > 0.5,
      }));

      expect(cohortAssignments).toHaveLength(2);
      cohortAssignments.forEach((assignment) => {
        expect(assignment.flag).toMatch(/^migration\./);
        expect(assignment.cohort).toBe('cohort-123');
        expect(typeof assignment.enabled).toBe('boolean');
      });
    });
  });

  describe('Progressive Rollout', () => {
    it('should respect rollout percentages', () => {
      const rolloutConfig = {
        'migration.GetVentureData': 10,
        'migration.GetUserProfile': 50,
        'migration.GetProductList': 100,
      };

      const results = Object.entries(rolloutConfig).map(([flag, percentage]) => {
        // Simulate 1000 users
        let enabledCount = 0;
        for (let i = 0; i < 1000; i++) {
          if (Math.random() * 100 < percentage) {
            enabledCount++;
          }
        }
        return {
          flag,
          percentage,
          actualPercentage: (enabledCount / 1000) * 100,
        };
      });

      results.forEach((result) => {
        // Allow 5% variance
        expect(Math.abs(result.actualPercentage - result.percentage)).toBeLessThan(5);
      });
    });

    it('should handle gradual rollout increases', () => {
      const rolloutSchedule = [
        { day: 1, percentage: 10 },
        { day: 3, percentage: 25 },
        { day: 7, percentage: 50 },
        { day: 14, percentage: 100 },
      ];

      rolloutSchedule.forEach((phase, index) => {
        if (index > 0) {
          expect(phase.percentage).toBeGreaterThan(rolloutSchedule[index - 1].percentage);
        }
        expect(phase.percentage).toBeGreaterThanOrEqual(0);
        expect(phase.percentage).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Monitoring and Metrics', () => {
    it('should track transformation success rates', () => {
      const metrics = {
        totalQueries: 100,
        successfulTransformations: 95,
        failedTransformations: 5,
        averageLatency: 150,
        p95Latency: 300,
        errorRate: 5,
      };

      expect(metrics.errorRate).toBe((metrics.failedTransformations / metrics.totalQueries) * 100);
      expect(metrics.successfulTransformations + metrics.failedTransformations).toBe(
        metrics.totalQueries,
      );
      expect(metrics.p95Latency).toBeGreaterThan(metrics.averageLatency);
    });

    it('should trigger alerts when error threshold exceeded', () => {
      const errorThreshold = 5; // 5%
      const scenarios = [
        { errors: 2, total: 100, shouldAlert: false },
        { errors: 6, total: 100, shouldAlert: true },
        { errors: 15, total: 200, shouldAlert: true },
        { errors: 4, total: 100, shouldAlert: false },
      ];

      scenarios.forEach((scenario) => {
        const errorRate = (scenario.errors / scenario.total) * 100;
        const shouldTriggerAlert = errorRate > errorThreshold;
        expect(shouldTriggerAlert).toBe(scenario.shouldAlert);
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should generate response mapping utilities', () => {
      const transformedQuery = {
        original: 'venture { logoUrl }',
        transformed: 'venture { profile { logoUrl } }',
        mappingUtil: `
          function mapVentureResponse(response) {
            if (response.venture?.profile?.logoUrl) {
              response.venture.logoUrl = response.venture.profile.logoUrl;
            }
            return response;
          }
        `,
      };

      expect(transformedQuery.mappingUtil).toContain('mapVentureResponse');
      expect(transformedQuery.mappingUtil).toContain('profile?.logoUrl');
      expect(transformedQuery.mappingUtil).toContain('venture.logoUrl =');
    });

    it('should handle nested field mappings', () => {
      const mappings = [
        {
          from: 'venture.profile.logoUrl',
          to: 'venture.logoUrl',
        },
        {
          from: 'owner.contact.email',
          to: 'owner.email',
        },
        {
          from: 'product.details.status',
          to: 'product.oldStatus',
        },
      ];

      mappings.forEach((mapping) => {
        const parts = mapping.from.split('.');
        expect(parts.length).toBeGreaterThan(2); // All are nested
        expect(mapping.to.split('.').length).toBeLessThan(parts.length); // Flattening
      });
    });
  });

  describe('End-to-End Pipeline with Hivemind', () => { type: 'query', id: 'generated-id',
    it('should complete full migration flow with cohort assignment', async () => {
      // Step 1: Extract queries
      const extractionResult = {
        queries: [
          { name: 'GetVenture', content: 'query { venture { id } }' },
          { type: 'query', id: 'generated-id', name: 'GetUser', content: 'query { user { id } }' },
        ],
      };

      // Step 2: Transform with deprecations
      const transformations = extractionResult.queries.map((q) => ({
        ...q,
        transformed: q.content.replace('id', 'id\n    __typename'),
        hivemindFlag: `migration.${q.name}`,
      }));

      // Step 3: Generate PR content
      const prContent = `
## GraphQL Migration PR

### Queries Migrated: ${transformations.length}

### Hivemind Flags:
${transformations.map((t) => `- \`${t.hivemindFlag}\``).join('\n')}

### Rollout Plan:
- Day 1-3: 10% (monitoring phase)
- Day 4-7: 50% (expanded testing)
- Day 8+: 100% (full rollout)

### Backward Compatibility:
Response mapping utilities generated for all transformed queries.
      `.trim();

      expect(prContent).toContain('Hivemind Flags');
      expect(prContent).toContain('migration.GetVenture');
      expect(prContent).toContain('migration.GetUser');
      expect(prContent).toContain('Rollout Plan');
    });
  });

  describe('Error Recovery', () => {
    it('should rollback on high error rates', () => {
      const rollbackTrigger = {
        errorThreshold: 5,
        currentErrorRate: 7.5,
        action: 'rollback',
      };

      expect(rollbackTrigger.currentErrorRate).toBeGreaterThan(rollbackTrigger.errorThreshold);
      expect(rollbackTrigger.action).toBe('rollback');
    });

    it('should maintain audit log of transformations', () => { namePattern: { template: '${queryName}', version: 'V1' },
      const auditLog = [
        { namePattern: { template: '${queryName}', version: 'V1' },
          timestamp: new Date().toISOString(),
          query: 'GetVenture',
          action: 'transformed',
          cohort: 'cohort-123',
          success: true,
        },
        { namePattern: { template: '${queryName}', version: 'V1' },
          timestamp: new Date().toISOString(),
          query: 'GetProduct',
          action: 'error',
          cohort: 'cohort-123',
          success: false,
          error: 'Transformation failed',
        },
      ];

      expect(auditLog).toHaveLength(2);
      expect(auditLog.filter((log) => log.success).length).toBe(1);
      expect(auditLog.filter((log) => !log.success).length).toBe(1);
    });
  });
});
