import { isEqual, get, set } from 'lodash-es';
// @ts-ignore - string-similarity doesn't have types
import stringSimilarity from 'string-similarity';
import { logger } from '../../utils/logger';
import {
  CapturedResponse,
  ComparisonResult,
  Difference,
  DifferenceType,
  BreakingChange,
  PerformanceImpact
} from './types';

export class ResponseComparator {
  constructor(
    private options: {
      strict?: boolean;
      ignorePaths?: string[];
      customComparators?: Record<string, (a: any, b: any) => boolean>;
      performanceThreshold?: number;
    } = {}
  ) {}

  compare(
    baseline: CapturedResponse,
    transformed: CapturedResponse
  ): ComparisonResult {
    const differences: Difference[] = [];
    const breakingChanges: BreakingChange[] = [];

    // Compare response data
    const dataDifferences = this.compareData(
      baseline.response.data,
      transformed.response.data,
      ['data']  // Start with 'data' prefix for consistency
    );
    differences.push(...dataDifferences);

    // Compare errors
    const errorDifferences = this.compareErrors(
      baseline.response.errors,
      transformed.response.errors
    );
    differences.push(...errorDifferences);

    // Identify breaking changes
    for (const diff of differences) {
      const breakingChange = this.classifyBreakingChange(diff);
      if (breakingChange) {
        breakingChanges.push(breakingChange);
      }
    }

    // Calculate similarity score
    const similarity = this.calculateSimilarityScore(baseline, transformed, differences);

    // Analyze performance impact
    const performanceImpact = this.analyzePerformanceImpact(baseline, transformed);

    // Determine recommendation
    const recommendation = this.determineRecommendation(
      differences,
      breakingChanges,
      similarity,
      performanceImpact
    );

    return {
      queryId: baseline.queryId,
      operationName: baseline.operationName,
      identical: differences.length === 0,
      differences,
      similarity,
      breakingChanges,
      performanceImpact,
      recommendation
    };
  }

  detectBreakingChanges(comparisons: ComparisonResult[]): BreakingChange[] {
    const allBreakingChanges: BreakingChange[] = [];

    for (const comparison of comparisons) {
      allBreakingChanges.push(...comparison.breakingChanges);
    }

    // Deduplicate and prioritize
    const uniqueChanges = this.deduplicateBreakingChanges(allBreakingChanges);
    return this.prioritizeBreakingChanges(uniqueChanges);
  }

  calculateSimilarityScore(
    baseline: CapturedResponse,
    transformed: CapturedResponse,
    differences: Difference[]
  ): number {
    if (differences.length === 0) return 1.0;

    // Calculate structural similarity
    const structuralScore = this.calculateStructuralSimilarity(
      baseline.response.data,
      transformed.response.data
    );

    // Calculate value similarity
    const valueScore = this.calculateValueSimilarity(
      baseline.response.data,
      transformed.response.data
    );

    // Weight the scores
    const weightedScore = structuralScore * 0.7 + valueScore * 0.3;

    // Apply penalty for breaking changes
    const breakingChangePenalty = differences.filter(d => d.severity === 'critical').length * 0.1;

    return Math.max(0, weightedScore - breakingChangePenalty);
  }

  private compareData(
    baseline: any,
    transformed: any,
    path: string[]
  ): Difference[] {
    const differences: Difference[] = [];

    // Check if should ignore this path
    if (this.shouldIgnorePath(path)) {
      return differences;
    }

    // Use custom comparator if available
    const customComparator = this.getCustomComparator(path);
    if (customComparator) {
      if (!customComparator(baseline, transformed)) {
        differences.push(this.createDifference(
          path,
          'value-change',
          baseline,
          transformed,
          'Custom comparison failed'
        ));
      }
      return differences;
    }

    // Handle null/undefined
    if (baseline === null || baseline === undefined ||
        transformed === null || transformed === undefined) {
      // In non-strict mode, treat null and undefined as equivalent
      if (!this.options.strict &&
          ((baseline === null || baseline === undefined) &&
           (transformed === null || transformed === undefined))) {
        return differences;
      }

      if (baseline !== transformed) {
        differences.push(this.createDifference(
          path,
          'null-mismatch',
          baseline,
          transformed,
          `Value changed from ${baseline} to ${transformed}`
        ));
      }
      return differences;
    }

    // Compare types
    const baselineType = Array.isArray(baseline) ? 'array' : typeof baseline;
    const transformedType = Array.isArray(transformed) ? 'array' : typeof transformed;

    if (baselineType !== transformedType) {
      differences.push(this.createDifference(
        path,
        'type-mismatch',
        baseline,
        transformed,
        `Type changed from ${baselineType} to ${transformedType}`
      ));
      return differences;
    }

    // Compare based on type
    switch (baselineType) {
      case 'object':
        differences.push(...this.compareObjects(baseline, transformed, path));
        break;
      case 'array':
        differences.push(...this.compareArrays(baseline, transformed, path));
        break;
      default:
        if (baseline !== transformed) {
          differences.push(this.createDifference(
            path,
            'value-change',
            baseline,
            transformed,
            `Value changed from ${baseline} to ${transformed}`
          ));
        }
    }

    return differences;
  }

  private compareObjects(
    baseline: Record<string, any>,
    transformed: Record<string, any>,
    path: string[]
  ): Difference[] {
    const differences: Difference[] = [];
    const baselineKeys = Object.keys(baseline);
    const transformedKeys = Object.keys(transformed);

    // Check for missing fields
    for (const key of baselineKeys) {
      if (!(key in transformed)) {
        differences.push(this.createDifference(
          [...path, key],
          'missing-field',
          baseline[key],
          undefined,
          `Field '${key}' was removed`
        ));
      }
    }

    // Check for extra fields
    for (const key of transformedKeys) {
      if (!(key in baseline)) {
        differences.push(this.createDifference(
          [...path, key],
          'extra-field',
          undefined,
          transformed[key],
          `Field '${key}' was added`
        ));
      }
    }

    // Compare common fields
    for (const key of baselineKeys) {
      if (key in transformed) {
        differences.push(...this.compareData(
          baseline[key],
          transformed[key],
          [...path, key]
        ));
      }
    }

    return differences;
  }

  private compareArrays(
    baseline: any[],
    transformed: any[],
    path: string[]
  ): Difference[] {
    const differences: Difference[] = [];

    // Check length
    if (baseline.length !== transformed.length) {
      differences.push(this.createDifference(
        path,
        'array-length',
        baseline.length,
        transformed.length,
        `Array length changed from ${baseline.length} to ${transformed.length}`
      ));
    }

    // Compare elements
    const maxLength = Math.max(baseline.length, transformed.length);
    for (let i = 0; i < maxLength; i++) {
      if (i < baseline.length && i < transformed.length) {
        differences.push(...this.compareData(
          baseline[i],
          transformed[i],
          [...path, i.toString()]
        ));
      }
    }

    // Check for reordering if strict mode is off
    if (!this.options.strict && differences.length > 0) {
      const reordered = this.checkArrayReordering(baseline, transformed);
      if (reordered) {
        // Clear differences and add order change
        differences.length = 0;
        differences.push(this.createDifference(
          path,
          'array-order',
          baseline,
          transformed,
          'Array elements were reordered but content is the same'
        ));
      }
    }

    return differences;
  }

  private compareErrors(
    baseline?: any[],
    transformed?: any[]
  ): Difference[] {
    const differences: Difference[] = [];

    if (!baseline && !transformed) return differences;

    if (!baseline && transformed) {
      differences.push(this.createDifference(
        ['errors'],
        'extra-field',
        undefined,
        transformed,
        'Errors were introduced in transformed response'
      ));
    } else if (baseline && !transformed) {
      differences.push(this.createDifference(
        ['errors'],
        'missing-field',
        baseline,
        undefined,
        'Errors were removed in transformed response'
      ));
    } else if (baseline && transformed) {
      // Compare error arrays
      differences.push(...this.compareData(baseline, transformed, ['errors']));
    }

    return differences;
  }

  private createDifference(
    path: string[],
    type: DifferenceType,
    baseline: any,
    transformed: any,
    description: string
  ): Difference {
    const severity = this.calculateSeverity(type, path);
    const fixable = this.isFixable(type, baseline, transformed);

    // Format path as string for consistency with test expectations
    const pathString = path.map((segment, index) => {
      // Handle array indices
      if (index > 0 && /^\d+$/.test(segment)) {
        return `[${segment}]`;
      }
      return index === 0 ? segment : `.${segment}`;
    }).join('');

    return {
      path: pathString as any, // Keep as string for backward compatibility
      type,
      baseline,
      transformed,
      severity,
      description,
      fixable
    };
  }

  private calculateSeverity(
    type: DifferenceType,
    path: string[]
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Critical: Missing required fields or type changes
    if (type === 'missing-field' || type === 'type-mismatch') {
      return 'critical';
    }

    // High: Structural changes
    if (type === 'structure-change') {
      return 'high';
    }

    // Medium: Value changes in important fields
    if (type === 'value-change' && this.isImportantField(path)) {
      return 'medium';
    }

    // Low: Everything else
    return 'low';
  }

  private isFixable(
    type: DifferenceType,
    baseline: any,
    transformed: any
  ): boolean {
    switch (type) {
      case 'extra-field':
      case 'array-order':
      case 'null-mismatch':
        return true;
      case 'value-change':
        // Check if values are convertible
        return this.areValuesConvertible(baseline, transformed);
      default:
        return false;
    }
  }

  private areValuesConvertible(a: any, b: any): boolean {
    // Check number/string conversions
    if (typeof a === 'number' && typeof b === 'string') {
      return !isNaN(Number(b));
    }
    if (typeof a === 'string' && typeof b === 'number') {
      return !isNaN(Number(a));
    }

    // Check boolean/string conversions
    if (typeof a === 'boolean' && typeof b === 'string') {
      return b === 'true' || b === 'false';
    }

    return false;
  }

  private classifyBreakingChange(diff: Difference): BreakingChange | null {
    switch (diff.type) {
      case 'missing-field':
        return {
          type: 'removed-field',
          path: diff.path,
          description: diff.description,
          impact: 'high',
          migrationStrategy: 'Add field mapping or provide default value'
        };

      case 'type-mismatch':
        return {
          type: 'type-change',
          path: diff.path,
          description: diff.description,
          impact: 'high',
          migrationStrategy: 'Add type conversion in alignment function'
        };

      case 'structure-change':
        return {
          type: 'semantic-change',
          path: diff.path,
          description: diff.description,
          impact: 'medium',
          migrationStrategy: 'Restructure data in alignment function'
        };

      default:
        return null;
    }
  }

  private analyzePerformanceImpact(
    baseline: CapturedResponse,
    transformed: CapturedResponse
  ): PerformanceImpact {
    let latencyChange: number;

    // Handle zero baseline duration
    if (baseline.metadata.duration === 0) {
      latencyChange = transformed.metadata.duration > 0 ? Infinity : 0;
    } else {
      latencyChange =
        ((transformed.metadata.duration - baseline.metadata.duration) /
         baseline.metadata.duration) * 100;
    }

    let sizeChange: number;

    // Handle zero baseline size
    if (baseline.metadata.size === 0) {
      sizeChange = transformed.metadata.size > 0 ? Infinity : 0;
    } else {
      sizeChange =
        ((transformed.metadata.size - baseline.metadata.size) /
         baseline.metadata.size) * 100;
    }

    let recommendation = 'Performance impact is acceptable';

    if (Math.abs(latencyChange) > 50 && isFinite(latencyChange)) {
      recommendation = latencyChange > 0
        ? 'Significant latency increase detected. Consider optimization.'
        : 'Significant latency improvement detected.';
    }

    if (Math.abs(sizeChange) > 50 && isFinite(sizeChange)) {
      recommendation += sizeChange > 0
        ? ' Response size increased significantly.'
        : ' Response size decreased significantly.';
    }

    return {
      latencyChange,
      sizeChange,
      recommendation
    };
  }

  private determineRecommendation(
    differences: Difference[],
    breakingChanges: BreakingChange[],
    similarity: number,
    performanceImpact: PerformanceImpact
  ): 'safe' | 'review' | 'unsafe' {
    // Unsafe if any breaking changes
    if (breakingChanges.length > 0) {
      return 'unsafe';
    }

    // Unsafe if similarity too low
    if (similarity < 0.8) {
      return 'unsafe';
    }

    // Review if significant performance impact
    if (Math.abs(performanceImpact.latencyChange) > 30 ||
        Math.abs(performanceImpact.sizeChange) > 30) {
      return 'review';
    }

    // Review if medium severity differences
    if (differences.some(d => d.severity === 'medium')) {
      return 'review';
    }

    // Safe otherwise
    return 'safe';
  }

  private calculateStructuralSimilarity(baseline: any, transformed: any): number {
    const baselineStructure = this.extractStructure(baseline);
    const transformedStructure = this.extractStructure(transformed);

    return stringSimilarity.compareTwoStrings(
      JSON.stringify(baselineStructure),
      JSON.stringify(transformedStructure)
    );
  }

  private calculateValueSimilarity(baseline: any, transformed: any): number {
    const baselineValues = this.extractValues(baseline);
    const transformedValues = this.extractValues(transformed);

    if (baselineValues.length === 0) return 1.0;

    let matchingValues = 0;
    for (let i = 0; i < baselineValues.length; i++) {
      if (i < transformedValues.length && baselineValues[i] === transformedValues[i]) {
        matchingValues++;
      }
    }

    return matchingValues / Math.max(baselineValues.length, transformedValues.length);
  }

  private extractStructure(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.length > 0 ? [this.extractStructure(obj[0])] : [];
    if (typeof obj !== 'object') return typeof obj;

    const structure: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      structure[key] = this.extractStructure(obj[key]);
    }
    return structure;
  }

  private extractValues(obj: any): any[] {
    const values: any[] = [];

    const extract = (val: any): void => {
      if (val === null || val === undefined) return;
      if (Array.isArray(val)) {
        val.forEach(extract);
      } else if (typeof val === 'object') {
        Object.values(val).forEach(extract);
      } else {
        values.push(val);
      }
    };

    extract(obj);
    return values;
  }

  private shouldIgnorePath(path: string[]): boolean {
    if (!this.options.ignorePaths) return false;

    const pathString = path.join('.');
    return this.options.ignorePaths.some(ignorePath =>
      pathString.startsWith(ignorePath) ||
      new RegExp(ignorePath).test(pathString)
    );
  }

  private getCustomComparator(path: string[]): ((a: any, b: any) => boolean) | undefined {
    if (!this.options.customComparators) return undefined;

    const pathString = path.join('.');
    return this.options.customComparators[pathString];
  }

  private isImportantField(path: string[]): boolean {
    const importantPatterns = ['id', 'key', 'name', 'type', 'status'];
    const lastSegment = path[path.length - 1]?.toLowerCase() || '';

    return importantPatterns.some(pattern => lastSegment.includes(pattern));
  }

  private checkArrayReordering(baseline: any[], transformed: any[]): boolean {
    if (baseline.length !== transformed.length) return false;

    // Create a map of stringified elements to count
    const baselineMap = new Map<string, number>();
    const transformedMap = new Map<string, number>();

    for (const item of baseline) {
      const key = JSON.stringify(item);
      baselineMap.set(key, (baselineMap.get(key) || 0) + 1);
    }

    for (const item of transformed) {
      const key = JSON.stringify(item);
      transformedMap.set(key, (transformedMap.get(key) || 0) + 1);
    }

    // Check if maps are equal
    if (baselineMap.size !== transformedMap.size) return false;

    for (const [key, count] of baselineMap) {
      if (transformedMap.get(key) !== count) return false;
    }

    return true;
  }

  private deduplicateBreakingChanges(changes: BreakingChange[]): BreakingChange[] {
    const seen = new Set<string>();
    const unique: BreakingChange[] = [];

    for (const change of changes) {
      const key = `${change.type}:${change.path.join('.')}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(change);
      }
    }

    return unique;
  }

  private prioritizeBreakingChanges(changes: BreakingChange[]): BreakingChange[] {
    return changes.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    });
  }
}
