import { describe, it, expect } from 'vitest';
import { ComparatorRegistry } from '../../core/validator/comparators.js';

describe('ComparatorRegistry', () => {
  describe('date-tolerance comparator', () => {
    it('should compare dates within tolerance', () => {
      const comparator = ComparatorRegistry.getComparator({
        type: 'date-tolerance',
        options: { tolerance: 60000 } // 1 minute
      });

      expect(comparator('2024-01-01T00:00:00Z', '2024-01-01T00:00:30Z')).toBe(true);
      expect(comparator('2024-01-01T00:00:00Z', '2024-01-01T00:02:00Z')).toBe(false);
    });

    it('should handle different date formats', () => {
      const comparator = ComparatorRegistry.getComparator({
        type: 'date-tolerance',
        options: { tolerance: 1000 }
      });

      expect(comparator('2024-01-01', '2024-01-01')).toBe(true);
      expect(comparator(1704067200000, 1704067200500)).toBe(true); // timestamps
      expect(comparator(new Date('2024-01-01'), new Date('2024-01-01'))).toBe(true);
    });

    it('should handle null/undefined values', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'date-tolerance' });

      expect(comparator(null, null)).toBe(true);
      expect(comparator(undefined, undefined)).toBe(true);
      expect(comparator(null, '2024-01-01')).toBe(false);
    });

    it('should handle invalid dates', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'date-tolerance' });

      expect(comparator('invalid-date', 'invalid-date')).toBe(true);
      expect(comparator('invalid-date', '2024-01-01')).toBe(false);
    });
  });

  describe('case-insensitive comparator', () => {
    it('should compare strings ignoring case', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'case-insensitive' });

      expect(comparator('Hello', 'hello')).toBe(true);
      expect(comparator('HELLO', 'hello')).toBe(true);
      expect(comparator('HeLLo', 'hElLo')).toBe(true);
      expect(comparator('Hello', 'World')).toBe(false);
    });

    it('should handle non-string values', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'case-insensitive' });

      expect(comparator(123, 123)).toBe(true);
      expect(comparator(123, '123')).toBe(false);
      expect(comparator(true, true)).toBe(true);
    });
  });

  describe('numeric-tolerance comparator', () => {
    it('should compare numbers with absolute tolerance', () => {
      const comparator = ComparatorRegistry.getComparator({
        type: 'numeric-tolerance',
        options: { tolerance: 0.1, relative: false }
      });

      expect(comparator(10, 10.05)).toBe(true);
      expect(comparator(10, 10.15)).toBe(false);
      expect(comparator(-5, -5.05)).toBe(true);
    });

    it('should compare numbers with relative tolerance', () => {
      const comparator = ComparatorRegistry.getComparator({
        type: 'numeric-tolerance',
        options: { tolerance: 0.1, relative: true } // 10%
      });

      expect(comparator(100, 105)).toBe(true);
      expect(comparator(100, 115)).toBe(false);
      expect(comparator(1000, 1050)).toBe(true);
    });

    it('should handle string numbers', () => {
      const comparator = ComparatorRegistry.getComparator({
        type: 'numeric-tolerance',
        options: { tolerance: 0.01 }
      });

      expect(comparator('10.0', 10.005)).toBe(true);
      expect(comparator(10, '10.005')).toBe(true);
    });

    it('should handle non-numeric values', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'numeric-tolerance' });

      expect(comparator('not-a-number', 'not-a-number')).toBe(true);
      expect(comparator('not-a-number', 10)).toBe(false);
    });
  });

  describe('array-unordered comparator', () => {
    it('should compare arrays ignoring order', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'array-unordered' });

      expect(comparator(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(true);
      expect(comparator([1, 2, 3], [3, 1, 2])).toBe(true);
      expect(comparator(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
    });

    it('should handle empty arrays', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'array-unordered' });

      expect(comparator([], [])).toBe(true);
      expect(comparator([], ['a'])).toBe(false);
    });

    it('should handle non-array values', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'array-unordered' });

      expect(comparator('not-array', 'not-array')).toBe(true);
      expect(comparator(['a'], 'a')).toBe(false);
    });
  });

  describe('ignore-whitespace comparator', () => {
    it('should compare strings ignoring whitespace', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'ignore-whitespace' });

      expect(comparator('hello world', 'hello   world')).toBe(true);
      expect(comparator('  hello  ', 'hello')).toBe(true);
      expect(comparator('hello\nworld', 'hello world')).toBe(true);
      expect(comparator('hello\tworld', 'hello world')).toBe(true);
    });

    it('should handle non-string values', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'ignore-whitespace' });

      expect(comparator(123, 123)).toBe(true);
      expect(comparator(123, '123')).toBe(false);
    });
  });

  describe('type-coercion comparator', () => {
    it('should allow string to number conversion', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'type-coercion' });

      expect(comparator('123', 123)).toBe(true);
      expect(comparator(123, '123')).toBe(true);
      expect(comparator('123.45', 123.45)).toBe(true);
    });

    it('should allow string to boolean conversion', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'type-coercion' });

      expect(comparator('true', true)).toBe(true);
      expect(comparator('false', false)).toBe(true);
      expect(comparator(true, 'true')).toBe(true);
      expect(comparator(false, 'false')).toBe(true);
      expect(comparator('yes', true)).toBe(false);
    });

    it('should handle null/undefined', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'type-coercion' });

      expect(comparator(null, null)).toBe(true);
      expect(comparator(undefined, undefined)).toBe(true);
      expect(comparator(null, undefined)).toBe(true);
      expect(comparator(null, 0)).toBe(false);
    });
  });

  describe('deep-partial comparator', () => {
    it('should check if transformed is subset of baseline', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'deep-partial' });

      const baseline = { a: 1, b: { c: 2, d: 3 }, e: [1, 2, 3] };

      expect(comparator(baseline, { a: 1 })).toBe(true);
      expect(comparator(baseline, { b: { c: 2 } })).toBe(true);
      expect(comparator(baseline, { a: 1, b: { c: 2 } })).toBe(true);
      expect(comparator(baseline, { a: 2 })).toBe(false);
      expect(comparator(baseline, { f: 1 })).toBe(false);
    });

    it('should handle arrays', () => {
      const comparator = ComparatorRegistry.getComparator({ type: 'deep-partial' });

      expect(comparator([1, 2, 3], [1, 2])).toBe(true);
      expect(comparator([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(comparator([1, 2, 3], [1, 2, 4])).toBe(false);
    });
  });

  describe('registry management', () => {
    it('should throw error for unknown comparator type', () => {
      expect(() => {
        ComparatorRegistry.getComparator({ type: 'unknown' as any });
      }).toThrow('Unknown comparator type: unknown');
    });

    it('should allow registering custom comparators', () => {
      const customComparator = () => (a: any, b: any) => a === b * 2;

      ComparatorRegistry.registerComparator('double-check', customComparator);

      const comparator = ComparatorRegistry.getComparator({ type: 'double-check' as any });
      expect(comparator(10, 5)).toBe(true);
      expect(comparator(10, 6)).toBe(false);
    });

    it('should prevent overriding existing comparators', () => {
      expect(() => {
        ComparatorRegistry.registerComparator('date-tolerance', () => () => true);
      }).toThrow("Comparator type 'date-tolerance' already exists");
    });
  });
});
