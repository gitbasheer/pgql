// @ts-nocheck
/**
 * Predefined comparator types for response validation
 * These replace unsafe embedded JavaScript functions in YAML
 */

export type ComparatorType =
  | 'date-tolerance'
  | 'case-insensitive'
  | 'numeric-tolerance'
  | 'array-unordered'
  | 'ignore-whitespace'
  | 'type-coercion'
  | 'deep-partial'
  | 'custom';

export interface ComparatorConfig {
  type: ComparatorType;
  options?: Record<string, any>;
}

export type ComparatorFunction = (baseline: any, transformed: any) => boolean;

/**
 * Registry of predefined comparators
 */
export class ComparatorRegistry {
  private static comparators: Map<ComparatorType, (options?: any) => ComparatorFunction> = new Map([
    ['date-tolerance', createDateToleranceComparator],
    ['case-insensitive', createCaseInsensitiveComparator],
    ['numeric-tolerance', createNumericToleranceComparator],
    ['array-unordered', createArrayUnorderedComparator],
    ['ignore-whitespace', createIgnoreWhitespaceComparator],
    ['type-coercion', createTypeCoercionComparator],
    ['deep-partial', createDeepPartialComparator],
  ]);

  /**
   * Get a comparator function by type
   */
  static getComparator(config: ComparatorConfig): ComparatorFunction {
    const factory = this.comparators.get(config.type);
    if (!factory) {
      throw new Error(`Unknown comparator type: ${config.type}`);
    }
    return factory(config.options);
  }

  /**
   * Register a custom comparator (for extensibility)
   */
  static registerComparator(type: string, factory: (options?: any) => ComparatorFunction): void {
    if (this.comparators.has(type as ComparatorType)) {
      throw new Error(`Comparator type '${type}' already exists`);
    }
    this.comparators.set(type as ComparatorType, factory);
  }
}

/**
 * Date tolerance comparator
 * Options: { tolerance: number } - tolerance in milliseconds (default: 60000 = 1 minute)
 */
function createDateToleranceComparator(options?: { tolerance?: number }): ComparatorFunction {
  const tolerance = options?.tolerance || 60000; // 1 minute default

  return (baseline: any, transformed: any): boolean => {
    // Handle null/undefined
    if (baseline == null && transformed == null) return true;
    if (baseline == null || transformed == null) return false;

    // Try to parse as dates
    const date1 = new Date(baseline);
    const date2 = new Date(transformed);

    // Check if both are valid dates
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      return baseline === transformed; // Fall back to exact comparison
    }

    // Compare within tolerance
    return Math.abs(date1.getTime() - date2.getTime()) <= tolerance;
  };
}

/**
 * Case-insensitive string comparator
 */
function createCaseInsensitiveComparator(): ComparatorFunction {
  return (baseline: any, transformed: any): boolean => {
    if (typeof baseline !== 'string' || typeof transformed !== 'string') {
      return baseline === transformed;
    }
    return baseline.toLowerCase() === transformed.toLowerCase();
  };
}

/**
 * Numeric tolerance comparator
 * Options: { tolerance: number, relative: boolean }
 * - tolerance: absolute or relative tolerance (default: 0.01)
 * - relative: if true, tolerance is percentage (default: false)
 */
function createNumericToleranceComparator(options?: {
  tolerance?: number;
  relative?: boolean;
}): ComparatorFunction {
  const tolerance = options?.tolerance || 0.01;
  const relative = options?.relative || false;

  return (baseline: any, transformed: any): boolean => {
    const num1 = Number(baseline);
    const num2 = Number(transformed);

    if (isNaN(num1) || isNaN(num2)) {
      return baseline === transformed;
    }

    if (relative) {
      const maxVal = Math.max(Math.abs(num1), Math.abs(num2));
      return maxVal === 0 ? true : Math.abs(num1 - num2) / maxVal <= tolerance;
    }

    return Math.abs(num1 - num2) <= tolerance;
  };
}

/**
 * Array unordered comparator - compares arrays regardless of order
 */
function createArrayUnorderedComparator(): ComparatorFunction {
  return (baseline: any, transformed: any): boolean => {
    if (!Array.isArray(baseline) || !Array.isArray(transformed)) {
      return baseline === transformed;
    }

    if (baseline.length !== transformed.length) {
      return false;
    }

    // Simple implementation for primitive values
    const baselineSorted = [...baseline].sort();
    const transformedSorted = [...transformed].sort();

    return JSON.stringify(baselineSorted) === JSON.stringify(transformedSorted);
  };
}

/**
 * Ignore whitespace comparator
 */
function createIgnoreWhitespaceComparator(): ComparatorFunction {
  return (baseline: any, transformed: any): boolean => {
    if (typeof baseline !== 'string' || typeof transformed !== 'string') {
      return baseline === transformed;
    }

    const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();
    return normalize(baseline) === normalize(transformed);
  };
}

/**
 * Type coercion comparator - allows common type conversions
 */
function createTypeCoercionComparator(): ComparatorFunction {
  return (baseline: any, transformed: any): boolean => {
    // Exact match
    if (baseline === transformed) return true;

    // Null/undefined handling
    if (baseline == null && transformed == null) return true;
    if (baseline == null || transformed == null) return false;

    // String to number
    if (typeof baseline === 'string' && typeof transformed === 'number') {
      return Number(baseline) === transformed;
    }
    if (typeof baseline === 'number' && typeof transformed === 'string') {
      return baseline === Number(transformed);
    }

    // String to boolean
    if (typeof baseline === 'string' && typeof transformed === 'boolean') {
      return (
        (baseline === 'true' && transformed === true) ||
        (baseline === 'false' && transformed === false)
      );
    }
    if (typeof baseline === 'boolean' && typeof transformed === 'string') {
      return (
        (baseline === true && transformed === 'true') ||
        (baseline === false && transformed === 'false')
      );
    }

    // Default to false for other type mismatches
    return false;
  };
}

/**
 * Deep partial comparator - checks if transformed is a subset of baseline
 */
function createDeepPartialComparator(): ComparatorFunction {
  const isSubset = (subset: any, superset: any): boolean => {
    if (subset === superset) return true;
    if (subset == null || superset == null) return subset === superset;
    if (typeof subset !== 'object' || typeof superset !== 'object') return subset === superset;

    if (Array.isArray(subset)) {
      if (!Array.isArray(superset)) return false;
      return subset.every((item, index) => isSubset(item, superset[index]));
    }

    for (const key in subset) {
      if (!(key in superset)) return false;
      if (!isSubset(subset[key], superset[key])) return false;
    }

    return true;
  };

  return (baseline: any, transformed: any): boolean => {
    return isSubset(transformed, baseline);
  };
}
