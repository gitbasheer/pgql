import { nanoid } from 'nanoid';
import { logger } from '../../utils/logger.js';
import {
  ABTestConfig,
  ABTestMetrics,
  VariantMetrics,
  RolloutStrategy,
  RolloutStage,
  AutoRollbackConfig,
  CapturedResponse,
} from './types.js';

export class ABTestingFramework {
  private activeTests: Map<string, ABTestRuntime> = new Map();
  private metricsStore: Map<string, ABTestMetrics> = new Map();
  private rollbackHandlers: Map<string, () => Promise<void>> = new Map();

  constructor(
    private options: {
      defaultSplit?: number;
      monitoring?: {
        provider: 'datadog' | 'prometheus' | 'custom';
        config: Record<string, any>;
      };
      storage?: {
        type: 'memory' | 'redis' | 'database';
        config?: Record<string, any>;
      };
    } = {},
  ) {}

  async createTest(config: Partial<ABTestConfig>): Promise<ABTestConfig> {
    const testConfig: ABTestConfig = {
      id: config.id || nanoid(),
      name: config.name || `AB Test ${new Date().toISOString()}`,
      startDate: config.startDate || new Date(),
      endDate: config.endDate,
      splitPercentage: config.splitPercentage || this.options.defaultSplit || 10,
      targetQueries: config.targetQueries,
      excludeQueries: config.excludeQueries,
      rolloutStrategy: config.rolloutStrategy || {
        type: 'gradual',
        stages: this.getDefaultRolloutStages(),
      },
      metrics: this.initializeMetrics(),
      autoRollback: config.autoRollback || this.getDefaultRollbackConfig(),
    };

    const runtime = new ABTestRuntime(testConfig);
    this.activeTests.set(testConfig.id, runtime);
    this.metricsStore.set(testConfig.id, testConfig.metrics);

    logger.info(`Created A/B test: ${testConfig.name} with ${testConfig.splitPercentage}% split`);

    // Start monitoring
    this.startMonitoring(testConfig.id);

    return testConfig;
  }

  configureSplit(testId: string, percentage: number): void {
    const runtime = this.activeTests.get(testId);
    if (!runtime) {
      throw new Error(`Test ${testId} not found`);
    }

    runtime.updateSplitPercentage(percentage);
    logger.info(`Updated split percentage for test ${testId} to ${percentage}%`);
  }

  routeQuery(queryId: string, testId?: string): 'control' | 'variant' {
    // If specific test ID provided, use that test
    if (testId) {
      const runtime = this.activeTests.get(testId);
      if (!runtime) {
        logger.warn(`Test ${testId} not found, routing to control`);
        return 'control';
      }
      return runtime.routeQuery(queryId);
    }

    // Otherwise, check all active tests
    for (const [id, runtime] of this.activeTests) {
      if (runtime.shouldIncludeQuery(queryId)) {
        return runtime.routeQuery(queryId);
      }
    }

    return 'control';
  }

  recordMetric(
    testId: string,
    variant: 'control' | 'variant',
    metric: {
      success: boolean;
      latency: number;
      error?: string;
    },
  ): void {
    const metrics = this.metricsStore.get(testId);
    if (!metrics) return;

    const variantMetrics = metrics[variant];
    variantMetrics.requests++;

    if (metric.success) {
      variantMetrics.successes++;
    } else {
      variantMetrics.errors++;
      if (metric.error) {
        variantMetrics.errorTypes[metric.error] =
          (variantMetrics.errorTypes[metric.error] || 0) + 1;
      }
    }

    // Update latency metrics
    this.updateLatencyMetrics(variantMetrics, metric.latency);

    // Check for auto-rollback conditions
    this.checkAutoRollback(testId);
  }

  async collectMetrics(testId: string): Promise<ABTestMetrics> {
    const metrics = this.metricsStore.get(testId);
    if (!metrics) {
      throw new Error(`Metrics not found for test ${testId}`);
    }

    // Calculate summary
    const summary = this.calculateSummary(metrics);
    metrics.summary = summary;

    return metrics;
  }

  async autoRollback(testId: string, reason: string): Promise<void> {
    logger.warn(`Auto-rollback triggered for test ${testId}: ${reason}`);

    const runtime = this.activeTests.get(testId);
    if (!runtime) return;

    // Set split to 0% (all traffic to control)
    runtime.updateSplitPercentage(0);

    // Execute custom rollback handler if provided
    const handler = this.rollbackHandlers.get(testId);
    if (handler) {
      await handler();
    }

    // Record rollback event
    this.recordRollbackEvent(testId, reason);
  }

  async graduateStage(testId: string): Promise<boolean> {
    const runtime = this.activeTests.get(testId);
    if (!runtime) return false;

    const config = runtime.getConfig();
    if (config.rolloutStrategy.type !== 'gradual') return false;

    const currentStage = runtime.getCurrentStage();
    const stages = config.rolloutStrategy.stages || [];
    const nextStageIndex = stages.findIndex((s) => s === currentStage) + 1;

    if (nextStageIndex >= stages.length) {
      logger.info(`Test ${testId} has completed all rollout stages`);
      return false;
    }

    const nextStage = stages[nextStageIndex];
    const canGraduate = await this.evaluateGraduationCriteria(testId, nextStage);

    if (canGraduate) {
      runtime.updateSplitPercentage(nextStage.percentage);
      runtime.setCurrentStage(nextStage);
      logger.info(`Test ${testId} graduated to ${nextStage.percentage}% split`);
      return true;
    }

    logger.warn(`Test ${testId} did not meet graduation criteria`);
    return false;
  }

  pauseTest(testId: string): void {
    const runtime = this.activeTests.get(testId);
    if (runtime) {
      runtime.pause();
      logger.info(`Paused A/B test ${testId}`);
    }
  }

  resumeTest(testId: string): void {
    const runtime = this.activeTests.get(testId);
    if (runtime) {
      runtime.resume();
      logger.info(`Resumed A/B test ${testId}`);
    }
  }

  endTest(testId: string): ABTestMetrics | null {
    const runtime = this.activeTests.get(testId);
    if (!runtime) return null;

    const metrics = this.collectMetrics(testId);
    this.activeTests.delete(testId);
    this.metricsStore.delete(testId);
    this.rollbackHandlers.delete(testId);

    logger.info(`Ended A/B test ${testId}`);
    return metrics as any;
  }

  registerRollbackHandler(testId: string, handler: () => Promise<void>): void {
    this.rollbackHandlers.set(testId, handler);
  }

  private initializeMetrics(): ABTestMetrics {
    return {
      control: this.createEmptyVariantMetrics(),
      variant: this.createEmptyVariantMetrics(),
      summary: {
        confidence: 0,
        recommendation: 'Continue testing',
      },
    };
  }

  private createEmptyVariantMetrics(): VariantMetrics {
    return {
      requests: 0,
      successes: 0,
      errors: 0,
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      errorTypes: {},
    };
  }

  private getDefaultRolloutStages(): RolloutStage[] {
    return [
      {
        percentage: 1,
        duration: '1h',
        criteria: {
          minSuccessRate: 0.99,
          maxErrorRate: 0.01,
          minSampleSize: 100,
        },
      },
      {
        percentage: 5,
        duration: '2h',
        criteria: {
          minSuccessRate: 0.98,
          maxErrorRate: 0.02,
          minSampleSize: 500,
        },
      },
      {
        percentage: 25,
        duration: '12h',
        criteria: {
          minSuccessRate: 0.98,
          maxErrorRate: 0.02,
          minSampleSize: 2500,
        },
      },
      {
        percentage: 50,
        duration: '24h',
        criteria: {
          minSuccessRate: 0.98,
          maxErrorRate: 0.02,
          minSampleSize: 5000,
        },
      },
      {
        percentage: 100,
        duration: 'unlimited',
        criteria: {
          minSuccessRate: 0.98,
          maxErrorRate: 0.02,
          minSampleSize: 10000,
        },
      },
    ];
  }

  private getDefaultRollbackConfig(): AutoRollbackConfig {
    return {
      enabled: true,
      errorThreshold: 0.05, // 5% error rate
      latencyThreshold: 2.0, // 2x latency increase
      evaluationWindow: '5m',
      cooldownPeriod: '30m',
    };
  }

  private updateLatencyMetrics(metrics: VariantMetrics, latency: number): void {
    // Simple implementation - in production, use proper percentile calculation
    const latencies = this.getLatencyBuffer(metrics);
    latencies.push(latency);

    // Keep only last 1000 measurements
    if (latencies.length > 1000) {
      latencies.shift();
    }

    // Calculate metrics
    metrics.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    const sorted = [...latencies].sort((a, b) => a - b);
    metrics.p95Latency = sorted[Math.floor(sorted.length * 0.95)] || 0;
    metrics.p99Latency = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  private getLatencyBuffer(metrics: any): number[] {
    if (!metrics._latencyBuffer) {
      metrics._latencyBuffer = [];
    }
    return metrics._latencyBuffer;
  }

  private calculateSummary(metrics: ABTestMetrics): ABTestMetrics['summary'] {
    const controlSuccess = metrics.control.successes / metrics.control.requests || 0;
    const variantSuccess = metrics.variant.successes / metrics.variant.requests || 0;

    // Simple statistical significance check
    const sampleSize = Math.min(metrics.control.requests, metrics.variant.requests);
    const confidence = this.calculateConfidence(controlSuccess, variantSuccess, sampleSize);

    let winner: 'control' | 'variant' | 'tie' | undefined;
    if (confidence > 0.95) {
      winner = variantSuccess > controlSuccess ? 'variant' : 'control';
    } else if (Math.abs(variantSuccess - controlSuccess) < 0.001) {
      winner = 'tie';
    }

    let recommendation = 'Continue testing';
    if (winner === 'variant' && variantSuccess > 0.98) {
      recommendation = 'Safe to migrate - variant performing better';
    } else if (winner === 'control') {
      recommendation = 'Do not migrate - control performing better';
    } else if (winner === 'tie') {
      recommendation = 'Safe to migrate - no performance difference';
    }

    return {
      winner,
      confidence,
      recommendation,
    };
  }

  private calculateConfidence(
    controlRate: number,
    variantRate: number,
    sampleSize: number,
  ): number {
    // Simplified confidence calculation
    // In production, use proper statistical tests (z-test, t-test, etc.)
    if (sampleSize < 30) return 0;

    const pooledRate = (controlRate + variantRate) / 2;
    const standardError = Math.sqrt(pooledRate * (1 - pooledRate) * (2 / sampleSize));

    const zScore = Math.abs(variantRate - controlRate) / standardError;

    // Convert z-score to confidence (simplified)
    if (zScore > 2.58) return 0.99;
    if (zScore > 1.96) return 0.95;
    if (zScore > 1.64) return 0.9;
    return zScore / 2.58;
  }

  private async evaluateGraduationCriteria(testId: string, stage: RolloutStage): Promise<boolean> {
    const metrics = await this.collectMetrics(testId);
    const variantMetrics = metrics.variant;

    if (!stage.criteria) return true;

    const successRate = variantMetrics.successes / variantMetrics.requests || 0;
    const errorRate = variantMetrics.errors / variantMetrics.requests || 0;

    return (
      successRate >= stage.criteria.minSuccessRate &&
      errorRate <= stage.criteria.maxErrorRate &&
      variantMetrics.requests >= stage.criteria.minSampleSize
    );
  }

  private checkAutoRollback(testId: string): void {
    const runtime = this.activeTests.get(testId);
    if (!runtime) return;

    const config = runtime.getConfig();
    if (!config.autoRollback.enabled) return;

    const metrics = this.metricsStore.get(testId);
    if (!metrics) return;

    const variantMetrics = metrics.variant;
    const controlMetrics = metrics.control;

    // Check error threshold
    const errorRate = variantMetrics.errors / variantMetrics.requests || 0;
    if (errorRate > config.autoRollback.errorThreshold) {
      this.autoRollback(testId, `Error rate ${errorRate} exceeds threshold`);
      return;
    }

    // Check latency threshold
    const latencyIncrease = variantMetrics.averageLatency / controlMetrics.averageLatency;
    if (latencyIncrease > config.autoRollback.latencyThreshold) {
      this.autoRollback(testId, `Latency increase ${latencyIncrease}x exceeds threshold`);
    }
  }

  private startMonitoring(testId: string): void {
    // In production, integrate with real monitoring services
    logger.info(`Started monitoring for A/B test ${testId}`);
  }

  private recordRollbackEvent(testId: string, reason: string): void {
    logger.error(`A/B test ${testId} rolled back: ${reason}`);
    // In production, send alerts and record in monitoring system
  }
}

class ABTestRuntime {
  private paused = false;
  private currentStage?: RolloutStage;
  private queryAssignments: Map<string, 'control' | 'variant'> = new Map();

  constructor(private config: ABTestConfig) {
    if (config.rolloutStrategy.stages && config.rolloutStrategy.stages.length > 0) {
      this.currentStage = config.rolloutStrategy.stages[0];
      this.config.splitPercentage = this.currentStage.percentage;
    }
  }

  shouldIncludeQuery(queryId: string): boolean {
    // Check if query is explicitly targeted or excluded
    if (this.config.excludeQueries?.includes(queryId)) {
      return false;
    }
    if (this.config.targetQueries) {
      return this.config.targetQueries.includes(queryId);
    }
    return true;
  }

  routeQuery(queryId: string): 'control' | 'variant' {
    if (this.paused) return 'control';

    // Check if we've already assigned this query
    const existing = this.queryAssignments.get(queryId);
    if (existing) return existing;

    // Use consistent hashing for assignment
    const hash = this.hashString(queryId);
    const assignment = hash % 100 < this.config.splitPercentage ? 'variant' : 'control';

    this.queryAssignments.set(queryId, assignment);
    return assignment;
  }

  updateSplitPercentage(percentage: number): void {
    this.config.splitPercentage = percentage;
    // Clear assignments to re-route queries
    this.queryAssignments.clear();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  getConfig(): ABTestConfig {
    return this.config;
  }

  getCurrentStage(): RolloutStage | undefined {
    return this.currentStage;
  }

  setCurrentStage(stage: RolloutStage): void {
    this.currentStage = stage;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
