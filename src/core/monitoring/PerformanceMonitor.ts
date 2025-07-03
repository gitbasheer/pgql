import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { CacheManager, astCache, validationCache, transformCache, type CacheStats } from '../cache/CacheManager';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface OperationMetrics {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  memory: {
    start: number;
    end?: number;
    delta?: number;
  };
  metadata?: Record<string, any>;
  status: 'running' | 'completed' | 'failed';
  error?: Error;
}

interface PerformanceThresholds {
  duration: {
    warn: number;
    error: number;
  };
  memory: {
    warn: number;
    error: number;
  };
}

interface PerformanceTrend {
  operation: string;
  samples: number[];
  average: number;
  median: number;
  p95: number;
  p99: number;
  trend: 'improving' | 'degrading' | 'stable';
}

export class PerformanceMonitor extends EventEmitter {
  private operations: Map<string, OperationMetrics> = new Map();
  private history: OperationMetrics[] = [];
  private thresholds: Map<string, PerformanceThresholds> = new Map();
  private trends: Map<string, number[]> = new Map();
  private reportDir: string = '.performance';
  private isCI: boolean = process.env.CI === 'true';

  constructor() {
    super();
    this.setupDefaultThresholds();
    this.setupReportDirectory();
  }

  private setupDefaultThresholds() {
    // Default thresholds for common operations
    this.thresholds.set('extraction', {
      duration: { warn: 1000, error: 5000 },
      memory: { warn: 100 * 1024 * 1024, error: 500 * 1024 * 1024 }
    });

    this.thresholds.set('transformation', {
      duration: { warn: 500, error: 2000 },
      memory: { warn: 50 * 1024 * 1024, error: 200 * 1024 * 1024 }
    });

    this.thresholds.set('validation', {
      duration: { warn: 100, error: 500 },
      memory: { warn: 20 * 1024 * 1024, error: 100 * 1024 * 1024 }
    });

    this.thresholds.set('application', {
      duration: { warn: 200, error: 1000 },
      memory: { warn: 30 * 1024 * 1024, error: 150 * 1024 * 1024 }
    });
  }

  private setupReportDirectory() {
    if (!existsSync(this.reportDir)) {
      mkdirSync(this.reportDir, { recursive: true });
    }
  }

  /**
   * Start monitoring an operation
   */
  startOperation(name: string, metadata?: Record<string, any>): string {
    const operationId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const metrics: OperationMetrics = {
      name,
      startTime: performance.now(),
      memory: {
        start: process.memoryUsage().heapUsed,
      },
      metadata,
      status: 'running',
    };

    this.operations.set(operationId, metrics);
    this.emit('operation:start', { operationId, metrics });

    return operationId;
  }

  /**
   * End monitoring an operation
   */
  endOperation(operationId: string, error?: Error) {
    const metrics = this.operations.get(operationId);
    if (!metrics) {
      logger.warn(`Operation ${operationId} not found`);
      return;
    }

    metrics.endTime = performance.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.memory.end = process.memoryUsage().heapUsed;
    metrics.memory.delta = metrics.memory.end - metrics.memory.start;
    metrics.status = error ? 'failed' : 'completed';
    metrics.error = error;

    // Store in history
    this.history.push(metrics);
    if (this.history.length > 10000) {
      this.history.shift(); // Keep last 10k operations
    }

    // Update trends
    this.updateTrends(metrics.name, metrics.duration);

    // Check thresholds
    this.checkThresholds(metrics);

    // Emit events
    this.emit('operation:end', { operationId, metrics });

    // Log warnings for slow operations
    if (metrics.duration > 1000) {
      logger.warn(`Slow operation detected: ${metrics.name} took ${metrics.duration.toFixed(2)}ms`);
    }

    return metrics;
  }

  /**
   * Update performance trends
   */
  private updateTrends(operation: string, duration: number) {
    if (!this.trends.has(operation)) {
      this.trends.set(operation, []);
    }

    const samples = this.trends.get(operation)!;
    samples.push(duration);

    // Keep last 1000 samples
    if (samples.length > 1000) {
      samples.shift();
    }
  }

  /**
   * Check if operation exceeded thresholds
   */
  private checkThresholds(metrics: OperationMetrics) {
    const threshold = this.findThreshold(metrics.name);
    if (!threshold || !metrics.duration || !metrics.memory.delta) return;

    // Check duration threshold
    if (metrics.duration > threshold.duration.error) {
      this.emit('threshold:exceeded', {
        type: 'duration',
        level: 'error',
        metrics,
        threshold: threshold.duration.error,
      });
    } else if (metrics.duration > threshold.duration.warn) {
      this.emit('threshold:exceeded', {
        type: 'duration',
        level: 'warn',
        metrics,
        threshold: threshold.duration.warn,
      });
    }

    // Check memory threshold
    if (metrics.memory.delta > threshold.memory.error) {
      this.emit('threshold:exceeded', {
        type: 'memory',
        level: 'error',
        metrics,
        threshold: threshold.memory.error,
      });
    } else if (metrics.memory.delta > threshold.memory.warn) {
      this.emit('threshold:exceeded', {
        type: 'memory',
        level: 'warn',
        metrics,
        threshold: threshold.memory.warn,
      });
    }
  }

  /**
   * Find threshold for operation
   */
  private findThreshold(operationName: string): PerformanceThresholds | undefined {
    // Try exact match first
    if (this.thresholds.has(operationName)) {
      return this.thresholds.get(operationName);
    }

    // Try to match by prefix
    for (const [key, threshold] of this.thresholds) {
      if (operationName.startsWith(key)) {
        return threshold;
      }
    }

    return undefined;
  }

  /**
   * Calculate performance trends
   */
  calculateTrends(): Map<string, PerformanceTrend> {
    const trends = new Map<string, PerformanceTrend>();

    for (const [operation, samples] of this.trends) {
      if (samples.length < 10) continue;

      const sorted = [...samples].sort((a, b) => a - b);
      const average = samples.reduce((a, b) => a + b, 0) / samples.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      // Determine trend by comparing recent vs historical performance
      const recentSamples = samples.slice(-100);
      const historicalSamples = samples.slice(0, -100);
      const recentAvg = recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
      const historicalAvg = historicalSamples.reduce((a, b) => a + b, 0) / historicalSamples.length;

      let trend: 'improving' | 'degrading' | 'stable';
      if (recentAvg < historicalAvg * 0.9) {
        trend = 'improving';
      } else if (recentAvg > historicalAvg * 1.1) {
        trend = 'degrading';
      } else {
        trend = 'stable';
      }

      trends.set(operation, {
        operation,
        samples: samples,
        average,
        median,
        p95,
        p99,
        trend,
      });
    }

    return trends;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      ast: astCache.getStats(),
      validation: validationCache.getStats(),
      transform: transformCache.getStats(),
    };
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const trends = this.calculateTrends();
    const cacheStats = this.getCacheStats();

    const report = [
      '# Performance Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Total Operations: ${this.history.length}`,
      '',
      '## Performance Trends',
      '',
    ];

    // Add trend information
    for (const [operation, trend] of trends) {
      report.push(`### ${operation}`);
      report.push(`- Samples: ${trend.samples}`);
      report.push(`- Average: ${trend.average.toFixed(2)}ms`);
      report.push(`- Median: ${trend.median.toFixed(2)}ms`);
      report.push(`- P95: ${trend.p95.toFixed(2)}ms`);
      report.push(`- P99: ${trend.p99.toFixed(2)}ms`);
      report.push(`- Trend: ${trend.trend} ${this.getTrendEmoji(trend.trend)}`);
      report.push('');
    }

    // Add cache statistics
    report.push('## Cache Performance');
    report.push('');
    report.push('### AST Cache');
    report.push(`- Hit Rate: ${(cacheStats.ast.hitRate * 100).toFixed(2)}%`);
    report.push(`- Hits: ${cacheStats.ast.hits}`);
    report.push(`- Misses: ${cacheStats.ast.misses}`);
    report.push(`- Size: ${cacheStats.ast.size}`);
    report.push('');

    report.push('### Validation Cache');
    report.push(`- Hit Rate: ${(cacheStats.validation.hitRate * 100).toFixed(2)}%`);
    report.push(`- Hits: ${cacheStats.validation.hits}`);
    report.push(`- Misses: ${cacheStats.validation.misses}`);
    report.push(`- Size: ${cacheStats.validation.size}`);
    report.push('');

    report.push('### Transform Cache');
    report.push(`- Hit Rate: ${(cacheStats.transform.hitRate * 100).toFixed(2)}%`);
    report.push(`- Hits: ${cacheStats.transform.hits}`);
    report.push(`- Misses: ${cacheStats.transform.misses}`);
    report.push(`- Size: ${cacheStats.transform.size}`);

    // Add slow operations
    const slowOps = this.history
      .filter(op => op.duration && op.duration > 1000)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);

    if (slowOps.length > 0) {
      report.push('');
      report.push('## Slow Operations (Top 10)');
      report.push('');
      slowOps.forEach((op, i) => {
        report.push(`${i + 1}. ${op.name}: ${op.duration?.toFixed(2)}ms`);
      });
    }

    return report.join('\n');
  }

  private getTrendEmoji(trend: string): string {
    switch (trend) {
      case 'improving': return '📈';
      case 'degrading': return '📉';
      case 'stable': return '➡️';
      default: return '';
    }
  }

  /**
   * Save performance data for CI
   */
  saveForCI() {
    if (!this.isCI) return;

    const data = {
      timestamp: Date.now(),
      trends: Array.from(this.calculateTrends().entries()),
      cacheStats: this.getCacheStats(),
      slowOperations: this.history
        .filter(op => op.duration && op.duration > 1000)
        .map(op => ({
          name: op.name,
          duration: op.duration,
          memory: op.memory.delta,
        })),
    };

    const outputPath = join(this.reportDir, `performance-${Date.now()}.json`);
    writeFileSync(outputPath, JSON.stringify(data, null, 2));
    
    // Also save as latest for easy access
    const latestPath = join(this.reportDir, 'performance-latest.json');
    writeFileSync(latestPath, JSON.stringify(data, null, 2));

    logger.info(`Performance data saved to ${outputPath}`);
  }

  /**
   * Compare with baseline
   */
  compareWithBaseline(baselinePath: string): { regressions: string[]; improvements: string[] } {
    try {
      const baseline = require(baselinePath);
      const currentTrends = this.calculateTrends();
      const regressions: string[] = [];
      const improvements: string[] = [];

      for (const [operation, current] of currentTrends) {
        const baselineTrend = baseline.trends.find(([op]: [string, any]) => op === operation)?.[1];
        if (!baselineTrend) continue;

        // Check for performance regression
        if (current.average > baselineTrend.average * 1.1) {
          regressions.push(
            `${operation}: ${baselineTrend.average.toFixed(2)}ms → ${current.average.toFixed(2)}ms (+${((current.average / baselineTrend.average - 1) * 100).toFixed(1)}%)`
          );
        }

        // Check for improvements
        if (current.average < baselineTrend.average * 0.9) {
          improvements.push(
            `${operation}: ${baselineTrend.average.toFixed(2)}ms → ${current.average.toFixed(2)}ms (-${((1 - current.average / baselineTrend.average) * 100).toFixed(1)}%)`
          );
        }
      }

      return { regressions, improvements };
    } catch (error) {
      logger.error('Failed to compare with baseline:', error);
      return { regressions: [], improvements: [] };
    }
  }

  /**
   * Real-time monitoring dashboard data
   */
  getDashboardData() {
    const recentOps = this.history.slice(-50);
    const runningOps = Array.from(this.operations.values()).filter(op => op.status === 'running');

    return {
      operations: {
        total: this.history.length,
        running: runningOps.length,
        completed: this.history.filter(op => op.status === 'completed').length,
        failed: this.history.filter(op => op.status === 'failed').length,
      },
      recent: recentOps.map(op => ({
        name: op.name,
        duration: op.duration,
        memory: op.memory.delta,
        status: op.status,
        timestamp: op.startTime,
      })),
      trends: Array.from(this.calculateTrends().values()),
      cache: this.getCacheStats(),
    };
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Setup threshold exceeded handler
performanceMonitor.on('threshold:exceeded', ({ type, level, metrics, threshold }) => {
  const message = `Performance threshold exceeded: ${metrics.name} ${type} (${metrics[type === 'duration' ? 'duration' : 'memory']?.toFixed(2)} > ${threshold})`;
  
  if (level === 'error') {
    logger.error(message);
  } else {
    logger.warn(message);
  }
});

/**
 * Performance monitoring decorator
 */
export function monitor(operationName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const name = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const operationId = performanceMonitor.startOperation(name, {
        args: args.length,
        className: target.constructor.name,
        method: propertyKey,
      });

      try {
        const result = await originalMethod.apply(this, args);
        performanceMonitor.endOperation(operationId);
        return result;
      } catch (error) {
        performanceMonitor.endOperation(operationId, error as Error);
        throw error;
      }
    };

    return descriptor;
  };
} 