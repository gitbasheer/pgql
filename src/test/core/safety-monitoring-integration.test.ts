import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthCheckSystem } from '../../core/safety/HealthCheck.js';
import { ProgressiveMigration } from '../../core/safety/ProgressiveMigration.js';
import { RollbackSystem } from '../../core/safety/Rollback.js';
import {
  PerformanceMonitor,
  performanceMonitor,
} from '../../core/monitoring/PerformanceMonitor.js';
import { GraphQLOperation } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock performance.now()
let mockTime = 0;
vi.mock('perf_hooks', () => ({
  performance: {
    now: () => mockTime,
  },
}));

describe('Safety and Monitoring Integration', () => {
  let healthCheck: HealthCheckSystem;
  let progressiveMigration: ProgressiveMigration;
  let rollbackSystem: RollbackSystem;
  let monitor: PerformanceMonitor;
  let mockOperation: GraphQLOperation;

  beforeEach(() => {
    healthCheck = new HealthCheckSystem();
    progressiveMigration = new ProgressiveMigration();
    rollbackSystem = new RollbackSystem(progressiveMigration);
    monitor = new PerformanceMonitor();

    mockTime = 0;

    mockOperation = {
      id: 'getUserData',
      name: 'GetUserData',
      type: 'query',
      ast: {} as any,
      source: 'query GetUserData { user { id name } }',
      file: 'user.queries.ts',
      line: 10,
      column: 5,
      variables: [],
      fragments: [],
      directives: [],
    };

    vi.clearAllMocks();
  });

  describe('Production Migration Scenario', () => {
    it('should handle progressive rollout with health monitoring', async () => {
      // 1. Create feature flag and start monitoring
      progressiveMigration.createFeatureFlag(mockOperation);

      // 2. Start with 1% rollout
      await progressiveMigration.startRollout(mockOperation.id, 1);

      // 3. Simulate traffic and monitor health
      const simulateTraffic = async (errorRate: number, latency: number, count: number) => {
        for (let i = 0; i < count; i++) {
          const shouldUseMigrated = progressiveMigration.shouldUseMigratedQuery(mockOperation.id, {
            userId: `user-${i}`,
          });

          if (shouldUseMigrated) {
            // Monitor the migrated query execution
            mockTime = i * 100;
            const opId = monitor.startOperation('migration.getUserData', {
              migrated: true,
              userId: `user-${i}`,
            });

            // Simulate execution
            mockTime = i * 100 + latency;

            if (Math.random() < errorRate) {
              monitor.endOperation(opId, new Error('Query failed'));
              healthCheck.recordError(mockOperation.id, new Error('Query failed'), latency);
            } else {
              monitor.endOperation(opId);
              healthCheck.recordSuccess(mockOperation.id, latency);
            }
          }
        }
      };

      // 4. Initial traffic with good performance
      await simulateTraffic(0.005, 100, 1000); // 0.5% error rate, 100ms latency

      const healthStatus1 = await healthCheck.performHealthCheck(mockOperation);
      expect(healthStatus1.status).toBe('healthy');

      // 5. Increase rollout to 10%
      await progressiveMigration.increaseRollout(mockOperation.id, 9);

      // 6. More traffic, still healthy
      await simulateTraffic(0.008, 120, 1000); // 0.8% error rate, 120ms latency

      const healthStatus2 = await healthCheck.performHealthCheck(mockOperation);
      expect(healthStatus2.status).toBe('healthy');

      // 7. Increase to 25%
      await progressiveMigration.increaseRollout(mockOperation.id, 15);

      // 8. Performance starts degrading
      await simulateTraffic(0.02, 2500, 500); // 2% error rate, high latency

      const healthStatus3 = await healthCheck.performHealthCheck(mockOperation);
      expect(healthStatus3.status).toBe('unhealthy'); // High error rate

      // 9. Automatic rollback triggered
      await rollbackSystem.rollbackOperation(mockOperation.id);

      const rolloutStatus = progressiveMigration.getRolloutStatus(mockOperation.id);
      expect(rolloutStatus?.enabled).toBe(false);
      expect(rolloutStatus?.percentage).toBe(0);
    });

    it('should handle gradual rollback with monitoring', async () => { type: 'query',
      // Setup: Multiple operations in production
      const operations: GraphQLOperation[] = [
        mockOperation,
        { ...mockOperation, id: 'getVentures', name: 'GetVentures' },
        { ...mockOperation, id: 'updateProfile', name: 'UpdateProfile', type: 'mutation' },
      ];

      // Create flags and enable operations
      for (const op of operations) {
        progressiveMigration.createFeatureFlag(op);
        await progressiveMigration.startRollout(op.id, 50);
      }

      // Create checkpoint before issues arise
      const checkpoint = await rollbackSystem.createCheckpoint(operations);

      // Simulate production issues
      for (const op of operations) {
        for (let i = 0; i < 100; i++) {
          healthCheck.recordError(op.id, new Error('Service unavailable'));
        }
      }

      // Create and execute gradual rollback plan
      const plan = await rollbackSystem.createRollbackPlan(operations, 'gradual');

      // Monitor rollback execution
      const rollbackOpId = monitor.startOperation('rollback.gradual', {
        planId: plan.id,
        operations: operations.map((op) => op.id),
      });

      await rollbackSystem.executeRollback(plan.id);

      monitor.endOperation(rollbackOpId);

      // Verify all operations rolled back
      for (const op of operations) {
        const status = progressiveMigration.getRolloutStatus(op.id);
        expect(status?.enabled).toBe(false);
        expect(status?.percentage).toBe(0);
      }
    });
  });

  describe('Performance Monitoring with Health Checks', () => {
    it('should track operation performance and trigger health alerts', async () => {
      // Setup performance thresholds monitoring
      const thresholdListener = vi.fn();
      monitor.on('threshold:exceeded', thresholdListener);

      // Simulate operations with varying performance
      const runOperations = async (count: number, baseLatency: number, variance: number) => {
        for (let i = 0; i < count; i++) {
          mockTime = i * 1000;
          const opId = monitor.startOperation('query.execution', {
            queryName: mockOperation.name,
          });

          const latency = baseLatency + Math.random() * variance;
          mockTime = i * 1000 + latency;

          if (latency > 2000) {
            // Simulate timeout
            monitor.endOperation(opId, new Error('Query timeout'));
            healthCheck.recordError(mockOperation.id, new Error('Query timeout'), latency);
          } else {
            monitor.endOperation(opId);
            healthCheck.recordSuccess(mockOperation.id, latency);
          }
        }
      };

      // Good performance initially
      await runOperations(50, 100, 50);

      // Performance degrades
      await runOperations(50, 1500, 1000);

      // Check threshold violations
      expect(thresholdListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'duration',
          level: 'warn',
        }),
      );

      // Health check should reflect issues
      const health = await healthCheck.performHealthCheck(mockOperation);
      expect(health.issues.some((i) => i.severity === 'high')).toBe(true);
    });
  });

  describe('Segment-based Rollout with Monitoring', () => {
    it('should monitor segment-specific performance', async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      progressiveMigration.enableForSegments(mockOperation.id, ['beta', 'internal']);

      const segments = ['beta', 'internal', 'public'];
      const segmentMetrics = new Map<string, { success: number; error: number }>();

      // Initialize metrics
      segments.forEach((segment) => {
        segmentMetrics.set(segment, { success: 0, error: 0 });
      });

      // Simulate traffic from different segments
      for (let i = 0; i < 300; i++) {
        const segment = segments[i % segments.length];
        const shouldUseMigrated = progressiveMigration.shouldUseMigratedQuery(mockOperation.id, {
          segment,
        });

        if (shouldUseMigrated) {
          const opId = monitor.startOperation('segment.query', { segment });

          // Beta segment has higher error rate
          const errorRate = segment === 'beta' ? 0.05 : 0.01;
          if (Math.random() < errorRate) {
            monitor.endOperation(opId, new Error('Segment error'));
            segmentMetrics.get(segment)!.error++;
          } else {
            monitor.endOperation(opId);
            segmentMetrics.get(segment)!.success++;
          }
        }
      }

      // Only beta and internal segments should have traffic
      expect(
        segmentMetrics.get('beta')!.success + segmentMetrics.get('beta')!.error,
      ).toBeGreaterThan(0);
      expect(
        segmentMetrics.get('internal')!.success + segmentMetrics.get('internal')!.error,
      ).toBeGreaterThan(0);
      expect(segmentMetrics.get('public')!.success + segmentMetrics.get('public')!.error).toBe(0);
    });
  });

  describe('Real-time Dashboard Integration', () => { type: 'query',
    it('should provide comprehensive migration status', async () => {
      // Setup multiple operations in various states
      const operations = [
        { ...mockOperation, id: 'op1', name: 'Operation1' },
        { type: 'query', ...mockOperation, id: 'op2', name: 'Operation2' },
        { type: 'query', ...mockOperation, id: 'op3', name: 'Operation3' },
      ];

      // Op1: Healthy at 75%
      progressiveMigration.createFeatureFlag(operations[0]);
      await progressiveMigration.startRollout(operations[0].id, 75);
      for (let i = 0; i < 100; i++) {
        healthCheck.recordSuccess(operations[0].id, 100);
      }

      // Op2: Degraded at 25%
      progressiveMigration.createFeatureFlag(operations[1]);
      await progressiveMigration.startRollout(operations[1].id, 25);
      for (let i = 0; i < 100; i++) {
        if (i < 5) {
          healthCheck.recordError(operations[1].id, new Error('Minor issues'));
        } else {
          healthCheck.recordSuccess(operations[1].id, 1500); // High latency
        }
      }

      // Op3: Failed and rolled back
      progressiveMigration.createFeatureFlag(operations[2]);
      await progressiveMigration.startRollout(operations[2].id, 10);
      for (let i = 0; i < 20; i++) {
        healthCheck.recordError(operations[2].id, new Error('Critical failure'));
      }
      await rollbackSystem.rollbackOperation(operations[2].id);

      // Collect dashboard data
      const dashboardData = monitor.getDashboardData();
      const migrationStatuses = await Promise.all(
        operations.map(async (op) => ({
          operation: op.name,
          rollout: progressiveMigration.getRolloutStatus(op.id),
          health: await healthCheck.performHealthCheck(op),
        })),
      );

      // Verify dashboard shows correct status
      expect(migrationStatuses[0].rollout?.percentage).toBe(75);
      expect(migrationStatuses[0].health.status).toBe('healthy');

      expect(migrationStatuses[1].rollout?.percentage).toBe(25);
      expect(migrationStatuses[1].health.status).toBe('degraded');

      expect(migrationStatuses[2].rollout?.percentage).toBe(0);
      expect(migrationStatuses[2].rollout?.enabled).toBe(false);
    });
  });

  describe('Emergency Procedures', () => { type: 'query',
    it('should handle cascade failures with immediate rollback', async () => {
      // Setup: Multiple interdependent operations
      const criticalOps = [
        { ...mockOperation, id: 'auth', name: 'Authentication' },
        { type: 'query', ...mockOperation, id: 'userData', name: 'UserData' },
        { type: 'query', ...mockOperation, id: 'ventures', name: 'Ventures' },
      ];

      // Enable all operations
      for (const op of criticalOps) {
        progressiveMigration.createFeatureFlag(op);
        await progressiveMigration.startRollout(op.id, 30);
      }

      // Monitor cascade failure
      const emergencyOpId = monitor.startOperation('emergency.cascade_failure');

      // Simulate cascade: auth fails, causing other failures
      healthCheck.recordError(criticalOps[0].id, new Error('Auth service down'));

      // This triggers failures in dependent services
      for (let i = 1; i < criticalOps.length; i++) {
        for (let j = 0; j < 50; j++) {
          healthCheck.recordError(criticalOps[i].id, new Error('Dependency failure'));
        }
      }

      // Emergency rollback all operations
      const plan = await rollbackSystem.createRollbackPlan(criticalOps, 'immediate');
      await rollbackSystem.executeRollback(plan.id);

      monitor.endOperation(emergencyOpId);

      // Verify all operations disabled
      for (const op of criticalOps) {
        const status = progressiveMigration.getRolloutStatus(op.id);
        expect(status?.enabled).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Rolled back operation'));
      }
    });
  });

  describe('Performance Trend Analysis', () => {
    it('should detect migration performance regression', async () => {
      progressiveMigration.createFeatureFlag(mockOperation);

      // Baseline performance (old query)
      for (let i = 0; i < 100; i++) {
        mockTime = i * 100;
        const opId = monitor.startOperation('query.baseline');
        mockTime = i * 100 + 80; // 80ms average
        monitor.endOperation(opId);
      }

      // Start migration
      await progressiveMigration.startRollout(mockOperation.id, 50);

      // Migrated query performance (worse)
      for (let i = 0; i < 100; i++) {
        mockTime = (100 + i) * 100;
        const opId = monitor.startOperation('query.migrated');
        mockTime = (100 + i) * 100 + 150; // 150ms average (87% slower)
        monitor.endOperation(opId);
      }

      // Analyze trends
      const trends = monitor.calculateTrends();
      const baselineTrend = trends.get('query.baseline');
      const migratedTrend = trends.get('query.migrated');

      expect(baselineTrend?.average).toBeLessThan(100);
      expect(migratedTrend?.average).toBeGreaterThan(140);

      // This should trigger investigation and potential rollback
      const performanceRegression = (migratedTrend?.average || 0) / (baselineTrend?.average || 1);
      expect(performanceRegression).toBeGreaterThan(1.5); // 50% regression threshold
    });
  });
});
