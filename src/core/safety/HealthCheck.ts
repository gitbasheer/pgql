import { HealthStatus, HealthIssue, GraphQLOperation } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

interface OperationMetrics {
  successCount: number;
  errorCount: number;
  totalCount: number;
  latencies: number[];
  lastError?: Error;
  lastErrorTime?: Date;
}

export class HealthCheckSystem {
  private operationMetrics: Map<string, OperationMetrics> = new Map();
  private healthThresholds = {
    errorRate: 0.01, // 1% error rate threshold
    latencyP99: 2000, // 2 second P99 latency threshold
    minSampleSize: 100, // Minimum operations before health check
  };

  async performHealthCheck(operation: GraphQLOperation): Promise<HealthStatus> {
    const metrics = this.getMetrics(operation.id);

    if (metrics.totalCount < this.healthThresholds.minSampleSize) {
      return this.createHealthStatus('healthy', metrics, [
        {
          severity: 'low',
          message: `Insufficient data (${metrics.totalCount}/${this.healthThresholds.minSampleSize} samples)`,
          affectedOperations: [operation.id],
          timestamp: new Date(),
        },
      ]);
    }

    const errorRate = metrics.errorCount / metrics.totalCount;
    const latencyStats = this.calculateLatencyStats(metrics.latencies);
    const issues: HealthIssue[] = [];

    // Check error rate
    if (errorRate > this.healthThresholds.errorRate) {
      issues.push({
        severity: 'critical',
        message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${this.healthThresholds.errorRate * 100}%`,
        affectedOperations: [operation.id],
        timestamp: new Date(),
      });
    }

    // Check latency
    if (latencyStats.p99 > this.healthThresholds.latencyP99) {
      issues.push({
        severity: 'high',
        message: `P99 latency ${latencyStats.p99}ms exceeds threshold ${this.healthThresholds.latencyP99}ms`,
        affectedOperations: [operation.id],
        timestamp: new Date(),
      });
    }

    // Recent errors check
    if (metrics.lastErrorTime) {
      const timeSinceError = Date.now() - metrics.lastErrorTime.getTime();
      if (timeSinceError < 60000) {
        // Error in last minute
        issues.push({
          severity: 'medium',
          message: `Recent error: ${metrics.lastError?.message}`,
          affectedOperations: [operation.id],
          timestamp: metrics.lastErrorTime,
        });
      }
    }

    const status = this.determineStatus(issues);
    return this.createHealthStatus(status, metrics, issues, latencyStats);
  }

  recordSuccess(operationId: string, latency: number): void {
    const metrics = this.getMetrics(operationId);

    metrics.successCount++;
    metrics.totalCount++;
    metrics.latencies.push(latency);

    // Keep only last 1000 latency samples
    if (metrics.latencies.length > 1000) {
      metrics.latencies.shift();
    }
  }

  recordError(operationId: string, error: Error, latency?: number): void {
    const metrics = this.getMetrics(operationId);

    metrics.errorCount++;
    metrics.totalCount++;
    metrics.lastError = error;
    metrics.lastErrorTime = new Date();

    if (latency) {
      metrics.latencies.push(latency);
    }

    logger.error(`Operation ${operationId} error:`, error);
  }

  getOperationHealth(operationId: string): {
    successRate: number;
    errorRate: number;
    avgLatency: number;
  } | null {
    const metrics = this.operationMetrics.get(operationId);

    if (!metrics || metrics.totalCount === 0) {
      return null;
    }

    const avgLatency =
      metrics.latencies.length > 0
        ? metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length
        : 0;

    return {
      successRate: metrics.successCount / metrics.totalCount,
      errorRate: metrics.errorCount / metrics.totalCount,
      avgLatency,
    };
  }

  resetMetrics(operationId: string): void {
    this.operationMetrics.delete(operationId);
    logger.info(`Reset metrics for operation: ${operationId}`);
  }

  private getMetrics(operationId: string): OperationMetrics {
    if (!this.operationMetrics.has(operationId)) {
      this.operationMetrics.set(operationId, {
        successCount: 0,
        errorCount: 0,
        totalCount: 0,
        latencies: [],
      });
    }

    return this.operationMetrics.get(operationId)!;
  }

  private calculateLatencyStats(latencies: number[]): {
    p50: number;
    p95: number;
    p99: number;
  } {
    if (latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...latencies].sort((a, b) => a - b);

    return {
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  private determineStatus(issues: HealthIssue[]): 'healthy' | 'degraded' | 'unhealthy' {
    const hasCritical = issues.some((i) => i.severity === 'critical');
    const hasHigh = issues.some((i) => i.severity === 'high');

    if (hasCritical) return 'unhealthy';
    if (hasHigh) return 'degraded';

    return 'healthy';
  }

  private createHealthStatus(
    status: 'healthy' | 'degraded' | 'unhealthy',
    metrics: OperationMetrics,
    issues: HealthIssue[],
    latencyStats?: { p50: number; p95: number; p99: number },
  ): HealthStatus {
    const successRate = metrics.totalCount > 0 ? metrics.successCount / metrics.totalCount : 1;

    const errorRate = metrics.totalCount > 0 ? metrics.errorCount / metrics.totalCount : 0;

    return {
      status,
      successRate,
      errorRate,
      latency: latencyStats || { p50: 0, p95: 0, p99: 0 },
      issues,
    };
  }
}
