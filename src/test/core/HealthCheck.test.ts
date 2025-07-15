import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthCheckSystem } from '../../core/safety/HealthCheck.js';
import { GraphQLOperation } from '../../types/index.js';

describe('HealthCheckSystem', () => {
  let healthCheck: HealthCheckSystem;

  beforeEach(() => {
    healthCheck = new HealthCheckSystem();
  });

  describe('performHealthCheck', () => {
    const mockOperation: GraphQLOperation = {
      id: 'op1',
      type: 'query',
      name: 'GetUser',
      ast: {} as any,
      source: 'query GetUser { user { id name } }',
      file: 'user.ts',
      line: 1,
      column: 1,
      variables: [],
      fragments: [],
      directives: []
    };

    it('should return healthy status with insufficient data', async () => {
      const result = await healthCheck.performHealthCheck(mockOperation);

      expect(result.status).toBe('healthy');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('low');
      expect(result.issues[0].message).toContain('Insufficient data');
    });

    it('should return healthy status with good metrics', async () => {
      // Record enough successful operations
      for (let i = 0; i < 150; i++) {
        healthCheck.recordSuccess(mockOperation.id, 100 + Math.random() * 200);
      }

      const result = await healthCheck.performHealthCheck(mockOperation);

      expect(result.status).toBe('healthy');
      expect(result.issues).toHaveLength(0);
    });

    it('should detect high error rate', async () => {
      // Record operations with high error rate
      for (let i = 0; i < 100; i++) {
        if (i < 95) {
          healthCheck.recordSuccess(mockOperation.id, 100);
        } else {
          healthCheck.recordError(mockOperation.id, new Error('Test error'), 100);
        }
      }

      const result = await healthCheck.performHealthCheck(mockOperation);

      expect(result.status).toBe('unhealthy');
      expect(result.issues.some(issue => 
        issue.severity === 'critical' && 
        issue.message.includes('Error rate')
      )).toBe(true);
    });

    it('should detect high latency', async () => {
      // Record operations with high latency
      for (let i = 0; i < 150; i++) {
        healthCheck.recordSuccess(mockOperation.id, 3000 + Math.random() * 1000); // High latency
      }

      const result = await healthCheck.performHealthCheck(mockOperation);

      expect(result.status).toBe('unhealthy');
      expect(result.issues.some(issue => 
        issue.severity === 'high' && 
        issue.message.includes('latency')
      )).toBe(true);
    });

    it('should detect both high error rate and latency', async () => {
      // Record operations with both issues
      for (let i = 0; i < 150; i++) {
        if (i < 140) {
          healthCheck.recordSuccess(mockOperation.id, 2500 + Math.random() * 1000); // High latency
        } else {
          healthCheck.recordError(mockOperation.id, new Error('Test error'), 2500 + Math.random() * 1000);
        }
      }

      const result = await healthCheck.performHealthCheck(mockOperation);

      expect(result.status).toBe('unhealthy');
      expect(result.issues.length).toBeGreaterThan(1);
      expect(result.issues.some(issue => issue.message.includes('Error rate'))).toBe(true);
      expect(result.issues.some(issue => issue.message.includes('latency'))).toBe(true);
    });

    it('should handle operations with no metrics', async () => {
      const newOperation: GraphQLOperation = {
        id: 'new-op',
        type: 'query',
        name: 'NewQuery',
        ast: {} as any,
        source: 'query NewQuery { data }',
        file: 'new.ts',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: []
      };

      const result = await healthCheck.performHealthCheck(newOperation);

      expect(result.status).toBe('healthy');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].message).toContain('Insufficient data (0/100 samples)');
    });
  });

  describe('recordSuccess and recordError', () => {
    const operationId = 'test-op';

    it('should record successful operations', () => {
      healthCheck.recordSuccess(operationId, 150);

      // Should not throw and should store the metrics internally
      expect(() => healthCheck.recordSuccess(operationId, 200)).not.toThrow();
    });

    it('should record error operations', () => {
      const error = new Error('Test error');
      
      healthCheck.recordError(operationId, error, 100);

      // Should not throw
      expect(() => healthCheck.recordError(operationId, error, 100)).not.toThrow();
    });

    it('should handle errors without latency', () => {
      const error = new Error('Test error');
      
      expect(() => healthCheck.recordError(operationId, error)).not.toThrow();
    });

    it('should accumulate metrics over time', async () => {
      const mockOperation: GraphQLOperation = {
        id: operationId,
        type: 'query',
        name: 'TestQuery',
        ast: {} as any,
        source: 'query TestQuery { test }',
        file: 'test.ts',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: []
      };

      // Record multiple metrics
      for (let i = 0; i < 50; i++) {
        healthCheck.recordSuccess(operationId, 100 + i);
      }

      for (let i = 0; i < 50; i++) {
        healthCheck.recordError(operationId, new Error(`Error ${i}`), 200 + i);
      }

      // Should have accumulated 100 total metrics
      const result = await healthCheck.performHealthCheck(mockOperation);
      
      // Should detect the 50% error rate
      expect(result.status).toBe('unhealthy');
      expect(result.issues.some(issue => issue.message.includes('Error rate'))).toBe(true);
    });
  });

  describe('getOperationHealth', () => {
    const operationId = 'test-op';

    it('should return null for operations with no metrics', () => {
      const health = healthCheck.getOperationHealth(operationId);

      expect(health).toBeNull();
    });

    it('should return correct health after recording operations', () => {
      // Record some operations
      healthCheck.recordSuccess(operationId, 100);
      healthCheck.recordSuccess(operationId, 200);
      healthCheck.recordError(operationId, new Error('Test error'), 300);

      const health = healthCheck.getOperationHealth(operationId);

      expect(health).toBeDefined();
      expect(health!.successRate).toBeCloseTo(0.667, 2); // 2/3
      expect(health!.errorRate).toBeCloseTo(0.333, 2); // 1/3
      expect(health!.avgLatency).toBe(200); // (100 + 200 + 300) / 3
    });

    it('should handle operations with only successes', () => {
      for (let i = 0; i < 10; i++) {
        healthCheck.recordSuccess(operationId, 100 + i * 10);
      }

      const health = healthCheck.getOperationHealth(operationId);

      expect(health!.successRate).toBe(1);
      expect(health!.errorRate).toBe(0);
      expect(health!.avgLatency).toBe(145); // (100 + 110 + ... + 190) / 10
    });

    it('should handle operations with only errors', () => {
      for (let i = 0; i < 5; i++) {
        healthCheck.recordError(operationId, new Error(`Error ${i}`), 200);
      }

      const health = healthCheck.getOperationHealth(operationId);

      expect(health!.successRate).toBe(0);
      expect(health!.errorRate).toBe(1);
      expect(health!.avgLatency).toBe(200);
    });
  });

  describe('resetMetrics', () => {
    const operationId = 'test-op';

    it('should clear metrics for specific operation', () => {
      // Record some metrics
      healthCheck.recordSuccess(operationId, 100);

      let health = healthCheck.getOperationHealth(operationId);
      expect(health).toBeDefined();

      // Clear metrics
      healthCheck.resetMetrics(operationId);

      health = healthCheck.getOperationHealth(operationId);
      expect(health).toBeNull();
    });

    it('should not affect other operations when clearing', () => {
      const operationId1 = 'op1';
      const operationId2 = 'op2';

      // Record metrics for both operations
      healthCheck.recordSuccess(operationId1, 100);
      healthCheck.recordSuccess(operationId2, 200);

      // Clear only first operation
      healthCheck.resetMetrics(operationId1);

      expect(healthCheck.getOperationHealth(operationId1)).toBeNull();
      expect(healthCheck.getOperationHealth(operationId2)).toBeDefined();
    });

    it('should handle clearing non-existent operation', () => {
      expect(() => healthCheck.resetMetrics('nonexistent')).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle realistic operation lifecycle', async () => {
      const mockOperation: GraphQLOperation = {
        id: 'lifecycle-op',
        type: 'query',
        name: 'LifecycleQuery',
        ast: {} as any,
        source: 'query LifecycleQuery { data }',
        file: 'lifecycle.ts',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: []
      };

      // Phase 1: Initial deployment - mostly successful
      for (let i = 0; i < 120; i++) {
        if (Math.random() > 0.005) { // 0.5% error rate
          healthCheck.recordSuccess(mockOperation.id, 80 + Math.random() * 40); // 80-120ms latency
        } else {
          healthCheck.recordError(mockOperation.id, new Error('Rare error'), 80 + Math.random() * 40);
        }
      }

      let result = await healthCheck.performHealthCheck(mockOperation);
      expect(result.status).toBe('healthy');

      // Phase 2: Performance degradation
      for (let i = 0; i < 50; i++) {
        if (Math.random() > 0.02) { // 2% error rate
          healthCheck.recordSuccess(mockOperation.id, 200 + Math.random() * 100); // 200-300ms latency
        } else {
          healthCheck.recordError(mockOperation.id, new Error('Performance error'), 200 + Math.random() * 100);
        }
      }

      result = await healthCheck.performHealthCheck(mockOperation);
      expect(result.status).toBe('unhealthy');
      expect(result.issues.some(issue => issue.message.includes('Error rate'))).toBe(true);

      // Phase 3: Recovery after fix
      healthCheck.resetMetrics(mockOperation.id);
      
      for (let i = 0; i < 120; i++) {
        healthCheck.recordSuccess(mockOperation.id, 70 + Math.random() * 30); // Improved latency
      }

      result = await healthCheck.performHealthCheck(mockOperation);
      expect(result.status).toBe('healthy');
      expect(result.issues).toHaveLength(0);
    });

    it('should handle multiple operations independently', async () => {
      const operations = [
        {
          id: 'healthy-op',
          type: 'query' as const,
          name: 'HealthyQuery',
          ast: {} as any,
          source: 'query HealthyQuery { data }',
          file: 'healthy.ts',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: []
        },
        {
          id: 'unhealthy-op',
          type: 'mutation' as const,
          name: 'UnhealthyMutation',
          ast: {} as any,
          source: 'mutation UnhealthyMutation { mutate }',
          file: 'unhealthy.ts',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: []
        }
      ];

      // Record good metrics for first operation
      for (let i = 0; i < 150; i++) {
        healthCheck.recordSuccess(operations[0].id, 100 + Math.random() * 50);
      }

      // Record bad metrics for second operation
      for (let i = 0; i < 150; i++) {
        if (i < 130) { // ~13% error rate
          healthCheck.recordSuccess(operations[1].id, 300 + Math.random() * 200);
        } else {
          healthCheck.recordError(operations[1].id, new Error('Mutation error'), 300 + Math.random() * 200);
        }
      }

      const healthyResult = await healthCheck.performHealthCheck(operations[0]);
      const unhealthyResult = await healthCheck.performHealthCheck(operations[1]);

      expect(healthyResult.status).toBe('healthy');
      expect(unhealthyResult.status).toBe('unhealthy');
      expect(unhealthyResult.issues.length).toBeGreaterThan(0);
    });

    it('should handle edge cases gracefully', async () => {
      const mockOperation: GraphQLOperation = {
        id: 'edge-case-op',
        type: 'subscription',
        name: 'EdgeCaseSubscription',
        ast: {} as any,
        source: 'subscription EdgeCaseSubscription { updates }',
        file: 'edge.ts',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: []
      };

      // Edge case: Exactly at threshold
      for (let i = 0; i < 100; i++) {
        healthCheck.recordMetrics(mockOperation.id, {
          success: i < 99, // Exactly 1% error rate (at threshold)
          latency: 2000, // Exactly at latency threshold
          timestamp: new Date(),
          error: i >= 99 ? new Error('Threshold error') : undefined
        });
      }

      const result = await healthCheck.performHealthCheck(mockOperation);
      
      // Should be healthy since we're at threshold, not above
      expect(result.status).toBe('healthy');

      // Edge case: Just above threshold
      healthCheck.recordMetrics(mockOperation.id, {
        success: false,
        latency: 2001,
        timestamp: new Date(),
        error: new Error('Push over threshold')
      });

      const result2 = await healthCheck.performHealthCheck(mockOperation);
      expect(result2.status).toBe('unhealthy');
    });
  });
});
