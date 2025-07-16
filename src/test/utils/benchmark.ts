import { performance } from 'perf_hooks';

export interface BenchmarkResult {
  name: string;
  runs: number;
  average: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number;
}

export class Benchmark {
  private results: Map<string, number[]> = new Map();

  async run<T>(
    name: string,
    fn: () => T | Promise<T>,
    options: { runs?: number; warmup?: number } = {},
  ): Promise<BenchmarkResult> {
    const runs = options.runs || 100;
    const warmup = options.warmup || 5;

    // Warmup runs
    for (let i = 0; i < warmup; i++) {
      await fn();
    }

    // Actual benchmark runs
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }

    this.results.set(name, times);

    // Calculate statistics
    const sorted = [...times].sort((a, b) => a - b);
    const average = times.reduce((a, b) => a + b, 0) / times.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    const variance =
      times.reduce((acc, time) => acc + Math.pow(time - average, 2), 0) / times.length;
    const standardDeviation = Math.sqrt(variance);

    return {
      name,
      runs,
      average,
      median,
      min,
      max,
      standardDeviation,
    };
  }

  compare(
    baseline: string,
    candidate: string,
  ): {
    speedup: number;
    significant: boolean;
  } | null {
    const baselineResults = this.results.get(baseline);
    const candidateResults = this.results.get(candidate);

    if (!baselineResults || !candidateResults) return null;

    const baselineAvg = baselineResults.reduce((a, b) => a + b, 0) / baselineResults.length;
    const candidateAvg = candidateResults.reduce((a, b) => a + b, 0) / candidateResults.length;

    const speedup = baselineAvg / candidateAvg;

    // Simple t-test for significance
    const pooledStdDev = Math.sqrt(
      (this.variance(baselineResults) + this.variance(candidateResults)) / 2,
    );
    const tScore =
      Math.abs(baselineAvg - candidateAvg) / (pooledStdDev * Math.sqrt(2 / baselineResults.length));

    // Significance at 95% confidence level
    const significant = tScore > 1.96;

    return { speedup, significant };
  }

  private variance(values: number[]): number {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
  }

  generateReport(): string {
    const results = Array.from(this.results.entries()).map(([name, times]) => {
      const sorted = [...times].sort((a, b) => a - b);
      const average = times.reduce((a, b) => a + b, 0) / times.length;
      const median = sorted[Math.floor(sorted.length / 2)];

      return `${name}:
  Average: ${average.toFixed(2)}ms
  Median: ${median.toFixed(2)}ms
  Min: ${sorted[0].toFixed(2)}ms
  Max: ${sorted[sorted.length - 1].toFixed(2)}ms`;
    });

    return results.join('\n\n');
  }
}
