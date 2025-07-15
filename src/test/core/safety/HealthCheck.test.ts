import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthCheckSystem } from '../../../core/safety/HealthCheck';
import { GraphQLOperation } from '../../../types';
import { logger } from '../../../utils/logger.js';

// Mock logger
vi.mock('../../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

describe('HealthCheckSystem', () => {
  let healthCheck: HealthCheckSystem;
  let mockOperation: GraphQLOperation;

  beforeEach(() => {
    healthCheck = new HealthCheckSystem();
    mockOperation = {
      id: 'test-op-1',
      name: 'TestOperation',
      type: 'query',
      ast: {} as any,
      source: 'query TestOperation { test }',
      file: 'test.ts',
      line: 10,
      column: 5,
      variables: [],
      fragments: [],
      directives: []
    };
    vi.clearAllMocks();
  });

  describe('performHealthCheck', () => {
    it('should return healthy status with insufficient data warning', async () => {
      const status = await healthCheck.performHealthCheck(mockOperation);
      
      expect(status.status).toBe('healthy');
      expect(status.issues).toHaveLength(1);
      expect(status.issues[0].severity).toBe('low');
      expect(status.issues[0].message).toContain('Insufficient data');
    });

    it('should detect high error rate and return unhealthy status', async () => {
      // Record enough samples
      for (let i = 0; i < 100; i++) {
        if (i < 10) {
          healthCheck.recordError(mockOperation.id, new Error('Test error'));
        } else {
          healthCheck.recordSuccess(mockOperation.id, 100);
        }
      }

      const status = await healthCheck.performHealthCheck(mockOperation);
      
      expect(status.status).toBe('unhealthy');
      expect(status.errorRate).toBeCloseTo(0.1);
      expect(status.issues.some(i => 
        i.severity === 'critical' && i.message.includes('Error rate')
      )).toBe(true);
    });

    it('should detect high latency and return degraded status', async () => {
      // Record high latency operations
      for (let i = 0; i < 100; i++) {
        healthCheck.recordSuccess(mockOperation.id, 3000); // 3 seconds
      }

      const status = await healthCheck.performHealthCheck(mockOperation);
      
      expect(status.status).toBe('degraded');
      expect(status.issues.some(i => 
        i.severity === 'high' && i.message.includes('P99 latency')
      )).toBe(true);
    });

    it('should include recent error information', async () => {
      // Record operations with one recent error
      for (let i = 0; i < 100; i++) {
        healthCheck.recordSuccess(mockOperation.id, 100);
      }
      healthCheck.recordError(mockOperation.id, new Error('Recent failure'), 150);

      const status = await healthCheck.performHealthCheck(mockOperation);
      
      expect(status.issues.some(i => 
        i.severity === 'medium' && i.message.includes('Recent error: Recent failure')
      )).toBe(true);
    });

    it('should calculate accurate latency percentiles', async () => {
      // Record varied latencies
      const latencies = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
      for (let i = 0; i < 10; i++) {
        for (const latency of latencies) {
          healthCheck.recordSuccess(mockOperation.id, latency);
        }
      }

      const status = await healthCheck.performHealthCheck(mockOperation);
      
      expect(status.latency.p50).toBe(300); // Median
      expect(status.latency.p95).toBe(475); // 95th percentile
      expect(status.latency.p99).toBe(495); // 99th percentile
    });
  });

  describe('recordSuccess', () => {
    it('should track success metrics', () => {
      healthCheck.recordSuccess(mockOperation.id, 150);
      
      const health = healthCheck.getOperationHealth(mockOperation.id);
      
      expect(health).not.toBeNull();
      expect(health?.successRate).toBe(1);
      expect(health?.errorRate).toBe(0);
      expect(health?.avgLatency).toBe(150);
    });

    it('should maintain sliding window of latencies', () => {
      // Record more than 1000 latencies
      for (let i = 0; i < 1100; i++) {
        healthCheck.recordSuccess(mockOperation.id, i);
      }
      
      const health = healthCheck.getOperationHealth(mockOperation.id);
      
      expect(health).not.toBeNull();
      // Average should be from last 1000 samples (100-1099)
      expect(health?.avgLatency).toBeCloseTo(599.5);
    });
  });

  describe('recordError', () => {
    it('should track error metrics', () => {
      const error = new Error('Test error');
      healthCheck.recordError(mockOperation.id, error, 200);
      
      const health = healthCheck.getOperationHealth(mockOperation.id);
      
      expect(health).not.toBeNull();
      expect(health?.successRate).toBe(0);
      expect(health?.errorRate).toBe(1);
      expect(health?.avgLatency).toBe(200);
      expect(logger.error).toHaveBeenCalledWith(
        `Operation ${mockOperation.id} error:`,
        error
      );
    });

    it('should track errors without latency', () => {
      healthCheck.recordError(mockOperation.id, new Error('Test error'));
      
      const health = healthCheck.getOperationHealth(mockOperation.id);
      
      expect(health).not.toBeNull();
      expect(health?.errorRate).toBe(1);
      expect(health?.avgLatency).toBe(0);
    });
  });

  describe('getOperationHealth', () => {
    it('should return null for unknown operations', () => {
      const health = healthCheck.getOperationHealth('unknown-op');
      expect(health).toBeNull();
    });

    it('should calculate correct rates', () => {
      // Record mixed results
      for (let i = 0; i < 7; i++) {
        healthCheck.recordSuccess(mockOperation.id, 100);
      }
      for (let i = 0; i < 3; i++) {
        healthCheck.recordError(mockOperation.id, new Error('Test'));
      }
      
      const health = healthCheck.getOperationHealth(mockOperation.id);
      
      expect(health).not.toBeNull();
      expect(health?.successRate).toBe(0.7);
      expect(health?.errorRate).toBe(0.3);
    });
  });

  describe('resetMetrics', () => {
    it('should clear all metrics for an operation', () => {
      healthCheck.recordSuccess(mockOperation.id, 100);
      healthCheck.recordError(mockOperation.id, new Error('Test'));
      
      healthCheck.resetMetrics(mockOperation.id);
      
      const health = healthCheck.getOperationHealth(mockOperation.id);
      expect(health).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        `Reset metrics for operation: ${mockOperation.id}`
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty latency array', async () => {
      // Record errors without latency
      for (let i = 0; i < 100; i++) {
        healthCheck.recordError(mockOperation.id, new Error('Test'));
      }
      
      const status = await healthCheck.performHealthCheck(mockOperation);
      
      expect(status.latency).toEqual({ p50: 0, p95: 0, p99: 0 });
    });

    it('should handle operations with only one sample', async () => {
      healthCheck.recordSuccess(mockOperation.id, 150);
      
      const status = await healthCheck.performHealthCheck(mockOperation);
      
      expect(status.latency).toEqual({ p50: 150, p95: 150, p99: 150 });
    });

    it('should properly determine status priorities', async () => {
      // Record data that triggers multiple issue types
      for (let i = 0; i < 100; i++) {
        if (i < 5) {
          healthCheck.recordError(mockOperation.id, new Error('Test'));
        } else {
          healthCheck.recordSuccess(mockOperation.id, 2500); // High latency
        }
      }
      
      const status = await healthCheck.performHealthCheck(mockOperation);
      
      // Should be unhealthy due to critical error rate, not just degraded from latency
      expect(status.status).toBe('unhealthy');
      expect(status.issues.some(i => i.severity === 'critical')).toBe(true);
      expect(status.issues.some(i => i.severity === 'high')).toBe(true);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple operations independently', async () => {
      const operation2 = { ...mockOperation, id: 'test-op-2', name: 'TestOperation2' };
      
      // Record different metrics for each operation
      for (let i = 0; i < 100; i++) {
        healthCheck.recordSuccess(mockOperation.id, 100);
        healthCheck.recordError(operation2.id, new Error('Test'));
      }
      
      const status1 = await healthCheck.performHealthCheck(mockOperation);
      const status2 = await healthCheck.performHealthCheck(operation2);
      
      expect(status1.status).toBe('healthy');
      expect(status1.errorRate).toBe(0);
      
      expect(status2.status).toBe('unhealthy');
      expect(status2.errorRate).toBe(1);
    });
  });
});
