import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseComparator } from '../../core/validator/ResponseComparator';
import { CapturedResponse, ComparisonResult } from '../../core/validator/types';

describe('ResponseComparator', () => {
  let comparator: ResponseComparator;

  const createMockResponse = (data: any, queryId = 'test-query'): CapturedResponse => ({
    queryId,
    operationName: 'TestQuery',
    variables: {},
    response: { data },
    metadata: {
      duration: 100,
      statusCode: 200,
      headers: {},
      size: 100,
      endpoint: 'https://api.example.com/graphql',
      environment: 'production'
    },
    timestamp: new Date(),
    version: 'baseline'
  });

  beforeEach(async () => {
    vi.resetModules();
    // Fixed comparator setup
    // Initialize comparator with proper config
    comparator = new ResponseComparator({
      strict: false,
      ignorePaths: []
    });
  });

  describe('identical responses', () => {
    it('should detect identical responses', () => {
      const baseline = createMockResponse({ user: { id: '123', name: 'John' } });
      const transformed = createMockResponse({ user: { id: '123', name: 'John' } });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(true);
      expect(result.similarity).toBe(1.0);
      expect(result.differences).toHaveLength(0);
      expect(result.breakingChanges).toHaveLength(0);
    });

    it('should ignore specified paths', () => {
      comparator = new ResponseComparator({
        strict: false,
        ignorePaths: ['data.user.timestamp', 'data.user.version']
      });

      const baseline = createMockResponse({
        user: {
          id: '123',
          name: 'John',
          timestamp: '2024-01-01',
          version: 1
        }
      });

      const transformed = createMockResponse({
        user: {
          id: '123',
          name: 'John',
          timestamp: '2024-01-02',
          version: 2
        }
      });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(true);
      expect(result.differences).toHaveLength(0);
    });
  });

  describe('different responses', () => {
    it('should detect value changes', () => {
      const baseline = createMockResponse({ user: { id: '123', name: 'John' } });
      const transformed = createMockResponse({ user: { id: '123', name: 'Jane' } });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(false);
      expect(result.similarity).toBeLessThan(1.0);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0]).toMatchObject({
        path: 'data.user.name',
        type: 'value-change',
        baseline: 'John',
        transformed: 'Jane',
        severity: 'medium'
      });
    });

    it('should detect missing fields', () => {
      const baseline = createMockResponse({ user: { id: '123', name: 'John', email: 'john@example.com' } });
      const transformed = createMockResponse({ user: { id: '123', name: 'John' } });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0]).toMatchObject({
        path: 'data.user.email',
        type: 'missing-field',
        baseline: 'john@example.com',
        transformed: undefined,
        severity: 'critical'
      });
      expect(result.breakingChanges).toHaveLength(1);
    });

    it('should detect added fields', () => {
      const baseline = createMockResponse({ user: { id: '123', name: 'John' } });
      const transformed = createMockResponse({ user: { id: '123', name: 'John', email: 'john@example.com' } });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0]).toMatchObject({
        path: 'data.user.email',
        type: 'extra-field',
        baseline: undefined,
        transformed: 'john@example.com',
        severity: 'low'
      });
    });

    it('should detect type changes', () => {
      const baseline = createMockResponse({ count: '123' });
      const transformed = createMockResponse({ count: 123 });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0]).toMatchObject({
        path: 'data.count',
        type: 'type-mismatch',
        baseline: '123',
        transformed: 123,
        severity: 'critical'
      });
      expect(result.breakingChanges).toHaveLength(1);
    });
  });

  describe('array handling', () => {
    it('should compare arrays order-sensitively by default', () => {
      const baseline = createMockResponse({ items: ['a', 'b', 'c'] });
      const transformed = createMockResponse({ items: ['c', 'b', 'a'] });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
    });

    it('should handle array length differences', () => {
      const baseline = createMockResponse({ items: ['a', 'b', 'c'] });
      const transformed = createMockResponse({ items: ['a', 'b'] });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(false);
      expect(result.differences).toContainEqual(
        expect.objectContaining({
          type: 'array-length',
          baseline: 3,
          transformed: 2
        })
      );
    });

    it('should compare array elements deeply', () => {
      const baseline = createMockResponse({
        users: [
          { id: '1', name: 'John' },
          { id: '2', name: 'Jane' }
        ]
      });

      const transformed = createMockResponse({
        users: [
          { id: '1', name: 'John' },
          { id: '2', name: 'Janet' }
        ]
      });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(false);
      expect(result.differences).toContainEqual(
        expect.objectContaining({
          path: 'data.users[1].name',
          type: 'value-change',
          baseline: 'Jane',
          transformed: 'Janet'
        })
      );
    });
  });

  describe('null and undefined handling', () => {
    it('should differentiate between null and undefined', () => {
      const baseline = createMockResponse({ value: null });
      const transformed = createMockResponse({ value: undefined });

      comparator = new ResponseComparator({ strict: true });
      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(false);
      expect(result.differences).toHaveLength(1);
    });

    it('should treat null and undefined as equivalent in non-strict mode', () => {
      const baseline = createMockResponse({ value: null });
      const transformed = createMockResponse({ value: undefined });

      comparator = new ResponseComparator({ strict: false });
      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(true);
    });
  });

  describe('performance impact', () => {
    it('should calculate performance impact', () => {
      const baseline = createMockResponse({ user: { id: '123' } });
      baseline.metadata.duration = 100;

      const transformed = createMockResponse({ user: { id: '123' } });
      transformed.metadata.duration = 150;

      const result = comparator.compare(baseline, transformed);

      expect(result.performanceImpact).toMatchObject({
        latencyChange: 50,
        sizeChange: 0
      });
    });

    it('should handle zero baseline duration', () => {
      const baseline = createMockResponse({ user: { id: '123' } });
      baseline.metadata.duration = 0;

      const transformed = createMockResponse({ user: { id: '123' } });
      transformed.metadata.duration = 100;

      const result = comparator.compare(baseline, transformed);

      expect(result.performanceImpact.latencyChange).toBe(Infinity);
    });
  });

  describe('error responses', () => {
    it('should compare error responses', () => {
      const baseline = createMockResponse(null);
      baseline.response = {
        errors: [{ message: 'Not found', extensions: { code: 'NOT_FOUND' } }]
      };

      const transformed = createMockResponse(null);
      transformed.response = {
        errors: [{ message: 'Not found', extensions: { code: 'NOT_FOUND' } }]
      };

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(true);
    });

    it('should detect different error messages', () => {
      const baseline = createMockResponse(null);
      baseline.response = {
        errors: [{ message: 'Not found' }]
      };

      const transformed = createMockResponse(null);
      transformed.response = {
        errors: [{ message: 'Forbidden' }]
      };

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
    });
  });

  describe('similarity calculation', () => {
    it('should calculate similarity based on differences', () => {
      const baseline = createMockResponse({
        user: {
          id: '123',
          name: 'John',
          email: 'john@example.com',
          age: 30,
          active: true
        }
      });

      const transformed = createMockResponse({
        user: {
          id: '123',
          name: 'Jane', // changed
          email: 'john@example.com',
          age: 30,
          active: false // changed
        }
      });

      const result = comparator.compare(baseline, transformed);

      expect(result.similarity).toBeGreaterThan(0.5); // 3/5 fields match
      expect(result.similarity).toBeLessThan(1.0);
    });
  });

  describe('custom comparators', () => {
    it('should use custom comparator for specific fields', () => {
      comparator = new ResponseComparator({
        strict: false,
        customComparators: {
          'data.timestamp': {
            type: 'date-tolerance',
            options: { tolerance: 60000 }  // 1 minute tolerance
          }
        }
      });

      const baseline = createMockResponse({ timestamp: '2024-01-01T00:00:00Z' });
      const transformed = createMockResponse({ timestamp: '2024-01-01T00:00:30Z' }); // 30 seconds later

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(true);
    });

    it('should support multiple comparator types', () => {
      comparator = new ResponseComparator({
        strict: false,
        customComparators: {
          'data.name': { type: 'case-insensitive' },
          'data.score': {
            type: 'numeric-tolerance',
            options: { tolerance: 0.1 }
          },
          'data.tags': { type: 'array-unordered' }
        }
      });

      const baseline = createMockResponse({
        name: 'JOHN',
        score: 95.0,
        tags: ['a', 'b', 'c']
      });

      const transformed = createMockResponse({
        name: 'john',
        score: 95.05,
        tags: ['c', 'a', 'b']
      });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(true);
    });

    it('should handle type coercion comparator', () => {
      comparator = new ResponseComparator({
        strict: false,
        customComparators: {
          'data.id': { type: 'type-coercion' },
          'data.enabled': { type: 'type-coercion' }
        }
      });

      const baseline = createMockResponse({ id: '123', enabled: 'true' });
      const transformed = createMockResponse({ id: 123, enabled: true });

      const result = comparator.compare(baseline, transformed);

      expect(result.identical).toBe(true);
    });
  });

  describe('breaking changes detection', () => {
    it('should identify breaking changes', () => {
      const baseline = createMockResponse({
        user: {
          id: '123',
          name: 'John',
          required_field: 'value'
        }
      });

      const transformed = createMockResponse({
        user: {
          id: 123, // type change
          name: 'John',
          // missing required_field
        }
      });

      const result = comparator.compare(baseline, transformed);

      expect(result.breakingChanges).toHaveLength(2);
      expect(result.breakingChanges).toContainEqual(
        expect.objectContaining({
          path: 'data.user.id',
          type: 'type-change'
        })
      );
      expect(result.breakingChanges).toContainEqual(
        expect.objectContaining({
          path: 'data.user.required_field',
          type: 'removed-field'
        })
      );
    });
  });
});
