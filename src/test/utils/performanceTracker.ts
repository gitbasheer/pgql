import { beforeEach, afterEach } from 'vitest';
import { performance } from 'perf_hooks';

interface TestMetrics {
  name: string;
  duration: number;
  memory: {
    before: number;
    after: number;
    delta: number;
  };
  timestamp: number;
}

interface PerformanceReport {
  totalDuration: number;
  averageDuration: number;
  slowestTests: TestMetrics[];
  memoryLeaks: TestMetrics[];
  summary: {
    totalTests: number;
    fastTests: number;
    slowTests: number;
    memoryIntensive: number;
  };
}

class TestPerformanceTracker {
  private metrics: TestMetrics[] = [];
  private currentTest: { name: string; startTime: number; startMemory: number } | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.TRACK_TEST_PERFORMANCE === 'true';
  }

  /**
   * Start tracking a test
   */
  startTest(name: string) {
    if (!this.enabled) return;

    this.currentTest = {
      name,
      startTime: performance.now(),
      startMemory: process.memoryUsage().heapUsed,
    };
  }

  /**
   * End tracking the current test
   */
  endTest() {
    if (!this.enabled || !this.currentTest) return;

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const metrics: TestMetrics = {
      name: this.currentTest.name,
      duration: endTime - this.currentTest.startTime,
      memory: {
        before: this.currentTest.startMemory,
        after: endMemory,
        delta: endMemory - this.currentTest.startMemory,
      },
      timestamp: Date.now(),
    };

    this.metrics.push(metrics);
    this.currentTest = null;

    // Log slow tests immediately
    if (metrics.duration > 100) {
      console.warn(`⚠️  Slow test detected: ${metrics.name} took ${metrics.duration.toFixed(2)}ms`);
    }

    // Log memory intensive tests
    if (metrics.memory.delta > 10 * 1024 * 1024) { // 10MB
      console.warn(
        `⚠️  Memory intensive test: ${metrics.name} used ${(metrics.memory.delta / 1024 / 1024).toFixed(2)}MB`
      );
    }
  }

  /**
   * Generate a performance report
   */
  generateReport(): PerformanceReport {
    if (this.metrics.length === 0) {
      return {
        totalDuration: 0,
        averageDuration: 0,
        slowestTests: [],
        memoryLeaks: [],
        summary: {
          totalTests: 0,
          fastTests: 0,
          slowTests: 0,
          memoryIntensive: 0,
        },
      };
    }

    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const averageDuration = totalDuration / this.metrics.length;

    const slowestTests = [...this.metrics]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    const memoryLeaks = [...this.metrics]
      .filter(m => m.memory.delta > 5 * 1024 * 1024) // Tests using > 5MB
      .sort((a, b) => b.memory.delta - a.memory.delta);

    const summary = {
      totalTests: this.metrics.length,
      fastTests: this.metrics.filter(m => m.duration < 50).length,
      slowTests: this.metrics.filter(m => m.duration > 100).length,
      memoryIntensive: this.metrics.filter(m => m.memory.delta > 10 * 1024 * 1024).length,
    };

    return {
      totalDuration,
      averageDuration,
      slowestTests,
      memoryLeaks,
      summary,
    };
  }

  /**
   * Save metrics to a file for trend analysis
   */
  async saveMetrics(filePath: string) {
    if (!this.enabled || this.metrics.length === 0) return;

    const { writeFile } = await import('fs/promises');
    const data = {
      timestamp: Date.now(),
      metrics: this.metrics,
      report: this.generateReport(),
    };

    await writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = [];
    this.currentTest = null;
  }
}

// Global instance
export const performanceTracker = new TestPerformanceTracker();

/**
 * Setup automatic performance tracking for tests
 */
export function setupPerformanceTracking() {
  beforeEach(({ task }) => {
    performanceTracker.startTest(task.name);
  });

  afterEach(() => {
    performanceTracker.endTest();
  });
}

/**
 * Decorator for tracking individual function performance
 */
export function trackPerformance(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const start = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      const result = await originalMethod.apply(this, args);
      
      const duration = performance.now() - start;
      const memoryDelta = process.memoryUsage().heapUsed - startMemory;

      if (process.env.DEBUG_PERFORMANCE === 'true') {
        console.log(
          `[Performance] ${propertyKey}: ${duration.toFixed(2)}ms, Memory: ${(memoryDelta / 1024).toFixed(2)}KB`
        );
      }

      return result;
    } catch (error) {
      throw error;
    }
  };

  return descriptor;
}

/**
 * Utility to measure async operation performance
 */
export async function measurePerformance<T>(
  name: string,
  operation: () => Promise<T>
): Promise<{ result: T; duration: number; memory: number }> {
  const start = performance.now();
  const startMemory = process.memoryUsage().heapUsed;

  const result = await operation();

  const duration = performance.now() - start;
  const memory = process.memoryUsage().heapUsed - startMemory;

  return { result, duration, memory };
}

/**
 * Generate a performance benchmark report
 */
export function generateBenchmarkReport(metrics: TestMetrics[]): string {
  const report = performanceTracker.generateReport();

  const lines = [
    '# Test Performance Report',
    '',
    `Total Duration: ${report.totalDuration.toFixed(2)}ms`,
    `Average Duration: ${report.averageDuration.toFixed(2)}ms`,
    '',
    '## Summary',
    `- Total Tests: ${report.summary.totalTests}`,
    `- Fast Tests (<50ms): ${report.summary.fastTests}`,
    `- Slow Tests (>100ms): ${report.summary.slowTests}`,
    `- Memory Intensive: ${report.summary.memoryIntensive}`,
    '',
    '## Slowest Tests',
    ...report.slowestTests.map(
      (test, i) => `${i + 1}. ${test.name}: ${test.duration.toFixed(2)}ms`
    ),
  ];

  if (report.memoryLeaks.length > 0) {
    lines.push(
      '',
      '## Memory Intensive Tests',
      ...report.memoryLeaks.map(
        (test, i) =>
          `${i + 1}. ${test.name}: ${(test.memory.delta / 1024 / 1024).toFixed(2)}MB`
      )
    );
  }

  return lines.join('\n');
} 