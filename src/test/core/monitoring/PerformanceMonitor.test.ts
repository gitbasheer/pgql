import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PerformanceMonitor,
  performanceMonitor,
  monitor as monitorDecorator,
} from '../../../core/monitoring/PerformanceMonitor.js';
import { logger } from '../../../utils/logger.js';
import { EventEmitter } from 'events';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Mock logger
vi.mock('../../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock cache managers
vi.mock('../../../core/cache/CacheManager', () => ({
  astCache: {
    getStats: vi.fn(() => ({
      hitRate: 0.85,
      hits: 850,
      misses: 150,
      size: 1000,
    })),
  },
  validationCache: {
    getStats: vi.fn(() => ({
      hitRate: 0.92,
      hits: 920,
      misses: 80,
      size: 500,
    })),
  },
  transformCache: {
    getStats: vi.fn(() => ({
      hitRate: 0.78,
      hits: 780,
      misses: 220,
      size: 300,
    })),
  },
}));

// Mock file system
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn((path: string) => {
    throw new Error(`File not found: ${path}`);
  }),
}));

// Mock performance.now()
let mockTime = 0;
vi.mock('perf_hooks', () => ({
  performance: {
    now: () => mockTime,
  },
}));

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
    mockTime = 0;
    vi.clearAllMocks();

    // Reset process.env.CI
    delete process.env.CI;

    // Reset the global performanceMonitor
    performanceMonitor.removeAllListeners();
  });

  afterEach(() => {
    // Clear any listeners
    monitor.removeAllListeners();
  });

  describe('startOperation', () => {
    it('should create operation metrics with unique ID', () => {
      mockTime = 1000;
      const memUsage = process.memoryUsage();
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        ...memUsage,
        heapUsed: 50 * 1024 * 1024, // 50MB
      });

      const operationId = monitor.startOperation('extraction', { file: 'test.ts' });

      expect(operationId).toMatch(/^extraction_\d+_[a-z0-9]+$/);

      // Verify event was emitted
      const startListener = vi.fn();
      monitor.on('operation:start', startListener);

      const operationId2 = monitor.startOperation('transformation');
      expect(startListener).toHaveBeenCalledWith({ type: 'query', id: 'generated-id',
        operationId: operationId2,
        metrics: expect.objectContaining({
          name: 'transformation',
          startTime: 1000,
          status: 'running',
        }),
      });
    });

    it('should track metadata', () => {
      const metadata = {
        queryCount: 10,
        fileName: 'test.graphql',
      };

      const operationId = monitor.startOperation('validation', metadata);

      const endListener = vi.fn();
      monitor.on('operation:end', endListener);

      monitor.endOperation(operationId);

      expect(endListener).toHaveBeenCalledWith({
        operationId,
        metrics: expect.objectContaining({
          metadata,
        }),
      });
    });
  });

  describe('endOperation', () => {
    it('should calculate duration and memory delta', () => {
      mockTime = 1000;
      vi.spyOn(process, 'memoryUsage')
        .mockReturnValueOnce({
          heapUsed: 50 * 1024 * 1024,
          rss: 0,
          heapTotal: 0,
          external: 0,
          arrayBuffers: 0,
        })
        .mockReturnValueOnce({
          heapUsed: 60 * 1024 * 1024,
          rss: 0,
          heapTotal: 0,
          external: 0,
          arrayBuffers: 0,
        });

      const operationId = monitor.startOperation('extraction');

      mockTime = 1500; // 500ms later
      const metrics = monitor.endOperation(operationId);

      expect(metrics).toMatchObject({ type: 'query', id: 'generated-id',
        name: 'extraction',
        startTime: 1000,
        endTime: 1500,
        duration: 500,
        memory: {
          start: 50 * 1024 * 1024,
          end: 60 * 1024 * 1024,
          delta: 10 * 1024 * 1024,
        },
        status: 'completed',
      });
    });

    it('should handle operation with error', () => {
      const operationId = monitor.startOperation('validation');
      const error = new Error('Validation failed');

      const metrics = monitor.endOperation(operationId, error);

      expect(metrics?.status).toBe('failed');
      expect(metrics?.error).toBe(error);
    });

    it('should warn for non-existent operation', () => {
      monitor.endOperation('fake-operation-id');

      expect(logger.warn).toHaveBeenCalledWith('Operation fake-operation-id not found');
    });

    it('should warn for slow operations', () => {
      mockTime = 0;
      const operationId = monitor.startOperation('extraction');

      mockTime = 1500; // 1.5 seconds
      monitor.endOperation(operationId);

      expect(logger.warn).toHaveBeenCalledWith(
        'Slow operation detected: extraction took 1500.00ms',
      );
    });

    it('should maintain history with size limit', () => {
      // Fill history beyond limit
      for (let i = 0; i < 10005; i++) {
        mockTime = i * 100;
        const opId = monitor.startOperation('test');
        mockTime = (i + 1) * 100;
        monitor.endOperation(opId);
      }

      // History should be capped at 10000
      const report = monitor.generateReport();
      expect(report).toContain('Total Operations: 10000');
    });
  });

  describe('threshold monitoring', () => { id: 'generated-id',
    it('should emit warning when duration threshold exceeded', () => {
      const thresholdListener = vi.fn();
      monitor.on('threshold:exceeded', thresholdListener);

      mockTime = 0;
      const operationId = monitor.startOperation('extraction');

      mockTime = 1500; // Exceeds warning threshold of 1000ms
      monitor.endOperation(operationId);

      expect(thresholdListener).toHaveBeenCalledWith({
        type: 'duration',
        level: 'warn',
        metrics: expect.objectContaining({
          name: 'extraction',
          duration: 1500,
        }),
        threshold: 1000,
      });
    });

    it('should emit error when duration threshold critically exceeded', () => {
      const thresholdListener = vi.fn();
      monitor.on('threshold:exceeded', thresholdListener);

      mockTime = 0;
      const operationId = monitor.startOperation('extraction');

      mockTime = 6000; // Exceeds error threshold of 5000ms
      monitor.endOperation(operationId);

      expect(thresholdListener).toHaveBeenCalledWith({
        type: 'duration',
        level: 'error',
        metrics: expect.objectContaining({
          duration: 6000,
        }),
        threshold: 5000,
      });
    });

    it('should check memory thresholds', () => {
      const thresholdListener = vi.fn();
      monitor.on('threshold:exceeded', thresholdListener);

      vi.spyOn(process, 'memoryUsage')
        .mockReturnValueOnce({
          heapUsed: 10 * 1024 * 1024, // 10MB
          rss: 0,
          heapTotal: 0,
          external: 0,
          arrayBuffers: 0,
        })
        .mockReturnValueOnce({
          heapUsed: 120 * 1024 * 1024, // 120MB (110MB increase)
          rss: 0,
          heapTotal: 0,
          external: 0,
          arrayBuffers: 0,
        });

      const operationId = monitor.startOperation('extraction');
      monitor.endOperation(operationId);

      expect(thresholdListener).toHaveBeenCalledWith({
        type: 'memory',
        level: 'warn',
        metrics: expect.objectContaining({
          memory: {
            start: 10 * 1024 * 1024,
            end: 120 * 1024 * 1024,
            delta: 110 * 1024 * 1024,
          },
        }),
        threshold: 100 * 1024 * 1024,
      });
    });

    it('should match operation names by prefix', () => {
      const thresholdListener = vi.fn();
      monitor.on('threshold:exceeded', thresholdListener);

      mockTime = 0;
      const operationId = monitor.startOperation('extraction.files.typescript');

      mockTime = 1500; // Should use 'extraction' thresholds
      monitor.endOperation(operationId);

      expect(thresholdListener).toHaveBeenCalled();
    });
  });

  describe('calculateTrends', () => {
    it('should calculate performance trends', () => {
      // Add historical data
      for (let i = 0; i < 200; i++) {
        mockTime = i * 10;
        const opId = monitor.startOperation('validation');
        mockTime = i * 10 + (i < 100 ? 50 : 100); // Slower in recent samples
        monitor.endOperation(opId);
      }

      const trends = monitor.calculateTrends();
      const validationTrend = trends.get('validation');

      expect(validationTrend).toBeDefined();
      expect(validationTrend?.trend).toBe('degrading');
      expect(validationTrend?.samples).toHaveLength(200);
      expect(validationTrend?.average).toBeGreaterThan(0);
      expect(validationTrend?.median).toBeGreaterThan(0);
      expect(validationTrend?.p95).toBeGreaterThanOrEqual(validationTrend?.median);
      expect(validationTrend?.p99).toBeGreaterThanOrEqual(validationTrend?.p95);
    });

    it('should detect improving trends', () => {
      // Add data that improves over time
      for (let i = 0; i < 200; i++) {
        mockTime = i * 10;
        const opId = monitor.startOperation('transformation');
        mockTime = i * 10 + (i < 100 ? 100 : 50); // Faster in recent samples
        monitor.endOperation(opId);
      }

      const trends = monitor.calculateTrends();
      const transformTrend = trends.get('transformation');

      expect(transformTrend?.trend).toBe('improving');
    });

    it('should detect stable trends', () => {
      // Add consistent data
      for (let i = 0; i < 200; i++) {
        mockTime = i * 10;
        const opId = monitor.startOperation('application');
        mockTime = i * 10 + 50 + (Math.random() * 10 - 5); // Stable with small variance
        monitor.endOperation(opId);
      }

      const trends = monitor.calculateTrends();
      const appTrend = trends.get('application');

      expect(appTrend?.trend).toBe('stable');
    });

    it('should skip operations with insufficient samples', () => {
      // Add only 5 samples
      for (let i = 0; i < 5; i++) {
        const opId = monitor.startOperation('rare-operation');
        monitor.endOperation(opId);
      }

      const trends = monitor.calculateTrends();
      expect(trends.has('rare-operation')).toBe(false);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = monitor.getCacheStats();

      expect(stats).toEqual({
        ast: {
          hitRate: 0.85,
          hits: 850,
          misses: 150,
          size: 1000,
        },
        validation: {
          hitRate: 0.92,
          hits: 920,
          misses: 80,
          size: 500,
        },
        transform: {
          hitRate: 0.78,
          hits: 780,
          misses: 220,
          size: 300,
        },
      });
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive performance report', () => {
      // Add some operations
      for (let i = 0; i < 5; i++) {
        mockTime = i * 100;
        const opId = monitor.startOperation('extraction');
        mockTime = i * 100 + (i === 3 ? 2000 : 50); // One slow operation
        monitor.endOperation(opId);
      }

      const report = monitor.generateReport();

      expect(report).toContain('# Performance Report');
      expect(report).toContain('Total Operations: 5');
      expect(report).toContain('## Performance Trends');
      expect(report).toContain('## Cache Performance');
      expect(report).toContain('### AST Cache');
      expect(report).toContain('Hit Rate: 85.00%');
      expect(report).toContain('## Slow Operations (Top 10)');
      expect(report).toContain('1. extraction: 2000.00ms');
    });

    it('should include trend emojis', () => {
      // Add trending data
      for (let i = 0; i < 200; i++) {
        mockTime = i;
        const opId = monitor.startOperation('improving-op');
        mockTime = i + (i < 100 ? 100 : 50);
        monitor.endOperation(opId);
      }

      const report = monitor.generateReport();

      expect(report).toContain('Trend: improving 📈');
    });
  });

  describe('saveForCI', () => {
    it('should save performance data when in CI environment', () => {
      process.env.CI = 'true';
      const ciMonitor = new PerformanceMonitor();

      // Add some data
      const opId = ciMonitor.startOperation('test');
      ciMonitor.endOperation(opId);

      ciMonitor.saveForCI();

      expect(writeFileSync).toHaveBeenCalledTimes(2); // performance-*.json and performance-latest.json
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.performance\/performance-\d+\.json$/),
        expect.any(String),
      );
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.performance\/performance-latest\.json$/),
        expect.any(String),
      );
    });

    it('should not save when not in CI', () => {
      vi.clearAllMocks(); // Clear any previous calls including from CI test
      delete process.env.CI; // Ensure CI is not set
      const monitor = new PerformanceMonitor();
      monitor.saveForCI();

      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('compareWithBaseline', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should detect performance regressions', () => {
      // First set up the current performance data - need at least 10 samples
      for (let i = 0; i < 50; i++) {
        mockTime = i * 1000;
        const opId = monitor.startOperation('extraction');
        mockTime = i * 1000 + 120; // 120ms duration (20% slower than baseline of 100ms)
        monitor.endOperation(opId);
      }

      // Mock readFileSync to return baseline data
      vi.mocked(readFileSync).mockImplementationOnce((path: string) => {
        if (path === '/baseline.json') {
          return JSON.stringify({
            trends: [
              ['extraction', { average: 100, p95: 150, p99: 200 }],
              ['transformation', { average: 50, p95: 75, p99: 100 }],
            ],
          });
        }
        throw new Error(`File not found: ${path}`);
      });

      const comparison = monitor.compareWithBaseline('/baseline.json');

      expect(comparison.regressions).toHaveLength(1);
      expect(comparison.regressions[0]).toContain('extraction');
      expect(comparison.regressions[0]).toContain('+20.0%');
    });

    it('should detect performance improvements', () => {
      // First set up the current performance data - need at least 10 samples
      for (let i = 0; i < 50; i++) {
        mockTime = i * 1000;
        const opId = monitor.startOperation('validation');
        mockTime = i * 1000 + 80; // 80ms duration (20% faster than baseline of 100ms)
        monitor.endOperation(opId);
      }

      // Mock readFileSync to return baseline data
      vi.mocked(readFileSync).mockImplementationOnce((path: string) => {
        if (path === '/baseline2.json') {
          return JSON.stringify({
            trends: [['validation', { average: 100, p95: 150, p99: 200 }]],
          });
        }
        throw new Error(`File not found: ${path}`);
      });

      const comparison = monitor.compareWithBaseline('/baseline2.json');

      expect(comparison.improvements).toHaveLength(1);
      expect(comparison.improvements[0]).toContain('validation');
      expect(comparison.improvements[0]).toContain('-20.0%');
    });

    it('should handle baseline load errors', () => {
      const comparison = monitor.compareWithBaseline('/non-existent.json');

      expect(comparison.regressions).toEqual([]);
      expect(comparison.improvements).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to compare with baseline:',
        expect.any(Error),
      );
    });
  });

  describe('getDashboardData', () => {
    it('should return real-time dashboard data', () => {
      // Add various operations
      mockTime = 0;
      const runningOp = monitor.startOperation('extraction');

      mockTime = 100;
      const completedOp = monitor.startOperation('validation');
      mockTime = 200;
      monitor.endOperation(completedOp);

      mockTime = 300;
      const failedOp = monitor.startOperation('transformation');
      mockTime = 400;
      monitor.endOperation(failedOp, new Error('Transform failed'));

      const dashboardData = monitor.getDashboardData();

      expect(dashboardData.operations).toEqual({
        total: 2, // completed + failed
        running: 1,
        completed: 1,
        failed: 1,
      });

      expect(dashboardData.recent).toHaveLength(2);
      expect(dashboardData.trends).toBeInstanceOf(Array);
      expect(dashboardData.cache).toHaveProperty('ast');
    });
  });

  describe('monitor decorator', () => {
    it('should track method execution automatically', async () => {
      class TestService {
        async performTask(value: number): Promise<number> {
          mockTime += 100;
          return value * 2;
        }

        syncTask(): string {
          mockTime += 50;
          return 'done';
        }
      }

      // Apply decorators manually since TypeScript decorators may not work in tests
      const performTaskDescriptor = Object.getOwnPropertyDescriptor(
        TestService.prototype,
        'performTask',
      )!;
      const decoratedPerformTask = monitorDecorator('customOperation')(
        TestService.prototype,
        'performTask',
        performTaskDescriptor,
      );
      TestService.prototype.performTask = decoratedPerformTask.value;

      const syncTaskDescriptor = Object.getOwnPropertyDescriptor(
        TestService.prototype,
        'syncTask',
      )!;
      const decoratedSyncTask = monitorDecorator()(
        TestService.prototype,
        'syncTask',
        syncTaskDescriptor,
      );
      TestService.prototype.syncTask = decoratedSyncTask.value;

      const service = new TestService();

      // Test async method
      const startListener = vi.fn();
      performanceMonitor.on('operation:start', startListener);

      const result = await service.performTask(5);

      expect(result).toBe(10);
      expect(startListener).toHaveBeenCalledWith({ type: 'query', id: 'generated-id',
        operationId: expect.stringMatching(/^customOperation_/),
        metrics: expect.objectContaining({
          name: 'customOperation',
          metadata: {
            args: 1,
            className: 'TestService',
            method: 'performTask',
          },
        }),
      });

      // Test sync method
      const syncResult = service.syncTask();
      expect(syncResult).toBe('done');
    });

    it('should handle errors in decorated methods', async () => {
      class TestService {
        async failingTask(): Promise<void> {
          throw new Error('Task failed');
        }
      }

      // Apply decorator manually
      const failingTaskDescriptor = Object.getOwnPropertyDescriptor(
        TestService.prototype,
        'failingTask',
      )!;
      const decoratedFailingTask = monitorDecorator('errorOperation')(
        TestService.prototype,
        'failingTask',
        failingTaskDescriptor,
      );
      TestService.prototype.failingTask = decoratedFailingTask.value;

      const service = new TestService();
      const endListener = vi.fn();
      performanceMonitor.on('operation:end', endListener);

      await expect(service.failingTask()).rejects.toThrow('Task failed');

      expect(endListener).toHaveBeenCalledWith({
        operationId: expect.any(String),
        metrics: expect.objectContaining({
          status: 'failed',
          error: expect.objectContaining({
            message: 'Task failed',
          }),
        }),
      });
    });
  });

  describe('global performanceMonitor instance', () => {
    it('should log warnings on threshold exceeded', () => {
      // Set up the listener before the operation
      performanceMonitor.removeAllListeners();
      performanceMonitor.on('threshold:exceeded', ({ type, level, metrics, threshold }) => {
        const value = type === 'duration' ? metrics.duration : metrics.memory?.delta;
        if (value === undefined) return;

        const message = `Performance threshold exceeded: ${metrics.name} ${type} (${value.toFixed(2)} > ${threshold})`;

        if (level === 'error') {
          logger.error(message);
        } else {
          logger.warn(message);
        }
      });

      mockTime = 0;
      const opId = performanceMonitor.startOperation('extraction'); // Use extraction which has defined thresholds

      mockTime = 1500; // Trigger warning (exceeds 1000ms threshold)
      performanceMonitor.endOperation(opId);

      // Global listener should have logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Performance threshold exceeded'),
      );
    });

    it('should log errors on critical threshold exceeded', () => {
      // Set up the listener before the operation
      performanceMonitor.removeAllListeners();
      performanceMonitor.on('threshold:exceeded', ({ type, level, metrics, threshold }) => {
        const value = type === 'duration' ? metrics.duration : metrics.memory?.delta;
        if (value === undefined) return;

        const message = `Performance threshold exceeded: ${metrics.name} ${type} (${value.toFixed(2)} > ${threshold})`;

        if (level === 'error') {
          logger.error(message);
        } else {
          logger.warn(message);
        }
      });

      vi.spyOn(process, 'memoryUsage')
        .mockReturnValueOnce({
          heapUsed: 10 * 1024 * 1024,
          rss: 0,
          heapTotal: 0,
          external: 0,
          arrayBuffers: 0,
        })
        .mockReturnValueOnce({
          heapUsed: 600 * 1024 * 1024, // Massive increase (590MB delta > 500MB error threshold)
          rss: 0,
          heapTotal: 0,
          external: 0,
          arrayBuffers: 0,
        });

      const opId = performanceMonitor.startOperation('extraction');
      performanceMonitor.endOperation(opId);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Performance threshold exceeded'),
      );
    });
  });
});
