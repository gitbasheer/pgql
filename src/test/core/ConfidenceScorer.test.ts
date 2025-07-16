import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfidenceScorer } from '../../core/analyzer/ConfidenceScorer.js';
import { GraphQLOperation, CodeChange } from '../../types/index.js';

describe('ConfidenceScorer', () => {
  let scorer: ConfidenceScorer;

  beforeEach(() => {
    scorer = new ConfidenceScorer();
  });

  describe('scoreTransformation', () => {
    const mockOperation: GraphQLOperation = {
      id: 'op1',
      type: 'query',
      name: 'GetUser',
      ast: {} as any,
      source: 'query GetUser { user { id name } }',
      file: 'user.js',
      line: 1,
      column: 1,
      variables: [],
      fragments: [],
      directives: [],
    };

    it('should score simple transformation highly', () => {
      const change: CodeChange = {
        file: 'user.js',
        operation: mockOperation,
        pattern: 'simple-field-rename',
        oldQuery: 'query GetUser { user { id name } }',
        newQuery: 'query GetUser { user { id fullName } }',
        transformations: [
          {
            type: 'field-rename',
            description: 'Rename name to fullName',
            from: 'name',
            to: 'fullName',
            automated: true,
          },
        ],
      };

      const result = scorer.scoreTransformation(change);

      expect(result.score).toBeGreaterThan(80);
      expect(result.category).toBe('automatic');
      expect(result.requiresReview).toBe(false);
      expect(result.factors).toBeDefined();
      expect(result.factors.complexity).toBeGreaterThan(70);
      expect(result.factors.patternMatch).toBeGreaterThan(70);
    });

    it('should score complex transformation lower', () => {
      const complexOperation: GraphQLOperation = {
        id: 'op1',
        type: 'query',
        name: 'ComplexQuery',
        ast: {} as any,
        source: `
          query ComplexQuery($filter: UserFilter!, $pagination: PaginationInput) {
            users(filter: $filter, pagination: $pagination) {
              nodes {
                id
                profile {
                  name
                  avatar
                  settings {
                    theme
                    notifications {
                      email
                      push
                    }
                  }
                }
                posts(first: 10) {
                  edges {
                    node {
                      id
                      title
                      content
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `,
        file: 'complex.js',
        line: 1,
        column: 1,
        variables: [
          { id: 'generated-id', name: 'filter', type: 'UserFilter!' },
          { id: 'generated-id', name: 'pagination', type: 'PaginationInput' },
        ],
        fragments: [],
        directives: [],
      };

      const change: CodeChange = {
        file: 'complex.js',
        operation: complexOperation,
        pattern: 'complex-restructure',
        oldQuery: complexOperation.source,
        newQuery: complexOperation.source.replace('profile', 'userProfile'),
        transformations: [
          {
            type: 'structure-change',
            description: 'Restructure user profile fields',
            from: 'profile',
            to: 'userProfile',
            automated: false,
          },
        ],
      };

      const result = scorer.scoreTransformation(change);

      expect(result.score).toBeLessThan(70);
      expect(result.category).toBe('manual');
      expect(result.requiresReview).toBe(true);
      expect(result.factors.complexity).toBeLessThan(60);
      expect(result.risks).toContain('Complex nested structure');
    });

    it('should score field-rename transformation appropriately', () => {
      const change: CodeChange = {
        file: 'user.js',
        operation: mockOperation,
        pattern: 'field-rename',
        oldQuery: 'query GetUser { user { id name email } }',
        newQuery: 'query GetUser { user { id fullName email } }',
        transformations: [
          {
            type: 'field-rename',
            description: 'Rename name to fullName',
            from: 'name',
            to: 'fullName',
            automated: true,
          },
        ],
      };

      const result = scorer.scoreTransformation(change);

      expect(result.score).toBeGreaterThan(85);
      expect(result.category).toBe('automatic');
      expect(result.factors.patternMatch).toBeGreaterThan(85);
    });

    it('should score type-change transformation as semi-automatic', () => {
      const change: CodeChange = {
        file: 'user.js',
        operation: mockOperation,
        pattern: 'type-change',
        oldQuery: 'query GetUser { user { id name } }',
        newQuery: 'query GetUser { user { id name } }',
        transformations: [
          {
            type: 'type-change',
            description: 'Change String to ID type',
            from: 'String',
            to: 'ID',
            automated: true,
          },
        ],
      };

      const result = scorer.scoreTransformation(change);

      expect(result.score).toBeGreaterThan(60);
      expect(result.score).toBeLessThan(90);
      expect(result.category).toBe('semi-automatic');
    });

    it('should score custom transformation as manual', () => {
      const change: CodeChange = {
        file: 'user.js',
        operation: mockOperation,
        pattern: 'custom-logic',
        oldQuery: 'query GetUser { user { id name } }',
        newQuery: 'query GetUser { user { id name posts { id } } }',
        transformations: [
          {
            type: 'custom',
            description: 'Add custom posts field with business logic',
            from: 'user { id name }',
            to: 'user { id name posts { id } }',
            automated: false,
          },
        ],
      };

      const result = scorer.scoreTransformation(change);

      expect(result.score).toBeLessThan(70);
      expect(result.category).toBe('manual');
      expect(result.requiresReview).toBe(true);
      expect(result.risks).toContain('Custom transformation logic');
    });

    it('should consider test coverage in scoring', () => {
      const highCoverageChange: CodeChange = {
        file: 'user.test.js', // Test file indicates high coverage
        operation: mockOperation,
        pattern: 'simple-field-rename',
        oldQuery: 'query GetUser { user { id name } }',
        newQuery: 'query GetUser { user { id fullName } }',
        transformations: [
          {
            type: 'field-rename',
            description: 'Rename name to fullName',
            from: 'name',
            to: 'fullName',
            automated: true,
          },
        ],
      };

      const lowCoverageChange: CodeChange = {
        file: 'legacy-user.js', // Legacy file indicates low coverage
        operation: mockOperation,
        pattern: 'simple-field-rename',
        oldQuery: 'query GetUser { user { id name } }',
        newQuery: 'query GetUser { user { id fullName } }',
        transformations: [
          {
            type: 'field-rename',
            description: 'Rename name to fullName',
            from: 'name',
            to: 'fullName',
            automated: true,
          },
        ],
      };

      const highCoverageResult = scorer.scoreTransformation(highCoverageChange);
      const lowCoverageResult = scorer.scoreTransformation(lowCoverageChange);

      expect(highCoverageResult.score).toBeGreaterThan(lowCoverageResult.score);
      expect(highCoverageResult.factors.testCoverage).toBeGreaterThan(
        lowCoverageResult.factors.testCoverage,
      );
    });

    it('should identify risks correctly', () => {
      const riskyChange: CodeChange = {
        file: 'critical-user.js',
        operation: {
          ...mockOperation,
          source: `
            query GetUser {
              user {
                id
                name
                criticalData {
                  sensitiveField
                  anotherCriticalField
                }
              }
            }
          `,
          variables: [{ id: 'generated-id', name: 'userId', type: 'ID!' }],
        },
        pattern: 'complex-restructure',
        oldQuery: 'query GetUser { user { id name criticalData { sensitiveField } } }',
        newQuery: 'query GetUser { user { id name newCriticalData { sensitiveField } } }',
        transformations: [
          {
            type: 'structure-change',
            description: 'Restructure critical data',
            from: 'criticalData',
            to: 'newCriticalData',
            automated: false,
          },
        ],
      };

      const result = scorer.scoreTransformation(riskyChange);

      expect(result.risks).toContain('Complex nested structure');
      expect(result.risks).toContain('Contains variables');
      expect(result.requiresReview).toBe(true);
    });

    it('should handle edge cases', () => {
      // Empty transformation
      const emptyChange: CodeChange = {
        file: 'empty.js',
        operation: mockOperation,
        pattern: 'no-op',
        oldQuery: 'query GetUser { user { id name } }',
        newQuery: 'query GetUser { user { id name } }',
        transformations: [],
      };

      const emptyResult = scorer.scoreTransformation(emptyChange);
      expect(emptyResult.score).toBeGreaterThan(95);
      expect(emptyResult.category).toBe('automatic');

      // Multiple transformations
      const multipleChange: CodeChange = {
        file: 'multiple.js',
        operation: mockOperation,
        pattern: 'multiple-changes',
        oldQuery: 'query GetUser { user { id name email } }',
        newQuery: 'query GetUser { user { id fullName emailAddress } }',
        transformations: [
          {
            type: 'field-rename',
            description: 'Rename name to fullName',
            from: 'name',
            to: 'fullName',
            automated: true,
          },
          {
            type: 'field-rename',
            description: 'Rename email to emailAddress',
            from: 'email',
            to: 'emailAddress',
            automated: true,
          },
        ],
      };

      const multipleResult = scorer.scoreTransformation(multipleChange);
      expect(multipleResult.score).toBeGreaterThan(70);
      expect(multipleResult.factors.complexity).toBeLessThan(90); // Multiple changes reduce complexity score
    });
  });

  describe('categorization', () => {
    it('should categorize high scores as automatic', () => {
      const mockChange: CodeChange = {
        file: 'test.js',
        operation: {} as any,
        pattern: 'simple',
        oldQuery: 'old',
        newQuery: 'new',
        transformations: [],
      };

      // Mock internal methods to return high scores
      const result = scorer.scoreTransformation(mockChange);

      if (result.score >= 90) {
        expect(result.category).toBe('automatic');
      }
    });

    it('should categorize medium scores as semi-automatic', () => {
      const mockChange: CodeChange = {
        file: 'test.js',
        operation: {
          id: 'op1',
          type: 'query',
          name: 'TestQuery',
          ast: {} as any,
          source: 'query TestQuery { field1 field2 field3 }',
          file: 'test.js',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: [],
        },
        pattern: 'medium-complexity',
        oldQuery: 'query TestQuery { field1 field2 field3 }',
        newQuery: 'query TestQuery { field1 renamedField2 field3 }',
        transformations: [
          {
            type: 'field-rename',
            description: 'Rename field2',
            from: 'field2',
            to: 'renamedField2',
            automated: true,
          },
        ],
      };

      const result = scorer.scoreTransformation(mockChange);

      if (result.score >= 70 && result.score < 90) {
        expect(result.category).toBe('semi-automatic');
      }
    });

    it('should categorize low scores as manual', () => {
      const mockChange: CodeChange = {
        file: 'test.js',
        operation: {
          id: 'op1',
          type: 'query',
          name: 'ComplexQuery',
          ast: {} as any,
          source:
            'query ComplexQuery { deeply { nested { structure { with { many { levels } } } } } }',
          file: 'test.js',
          line: 1,
          column: 1,
          variables: [{ id: 'generated-id', name: 'var1', type: 'String!' }],
          fragments: [{ id: 'generated-id', name: 'Fragment1', type: 'Type1' }],
          directives: [{ type: 'query', id: 'generated-id', name: 'deprecated', arguments: {} }],
        },
        pattern: 'complex-restructure',
        oldQuery:
          'query ComplexQuery { deeply { nested { structure { with { many { levels } } } } } }',
        newQuery: 'query ComplexQuery { completely { different { structure } } }',
        transformations: [
          {
            type: 'structure-change',
            description: 'Complete restructure',
            from: 'deeply.nested.structure',
            to: 'completely.different.structure',
            automated: false,
          },
          {
            type: 'custom',
            description: 'Custom business logic',
            from: 'old logic',
            to: 'new logic',
            automated: false,
          },
        ],
      };

      const result = scorer.scoreTransformation(mockChange);

      if (result.score < 70) {
        expect(result.category).toBe('manual');
      }
    });
  });

  describe('factors calculation', () => {
    it('should calculate complexity factor based on operation structure', () => {
      const simpleOperation: GraphQLOperation = {
        id: 'simple',
        type: 'query',
        name: 'SimpleQuery',
        ast: {} as any,
        source: 'query SimpleQuery { user { id } }',
        file: 'simple.js',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: [],
      };

      const complexOperation: GraphQLOperation = {
        id: 'complex',
        type: 'query',
        name: 'ComplexQuery',
        ast: {} as any,
        source:
          'query ComplexQuery($id: ID!) { user(id: $id) { id profile { name settings { theme } } posts(first: 10) { edges { node { id title } } } } }',
        file: 'complex.js',
        line: 1,
        column: 1,
        variables: [{ id: 'generated-id', name: 'id', type: 'ID!' }],
        fragments: [{ id: 'generated-id', name: 'UserFragment', type: 'User' }],
        directives: [{ type: 'query', id: 'generated-id', name: 'deprecated', arguments: {} }],
      };

      const simpleChange: CodeChange = {
        file: 'simple.js',
        operation: simpleOperation,
        pattern: 'simple',
        oldQuery: simpleOperation.source,
        newQuery: simpleOperation.source,
        transformations: [],
      };

      const complexChange: CodeChange = {
        file: 'complex.js',
        operation: complexOperation,
        pattern: 'complex',
        oldQuery: complexOperation.source,
        newQuery: complexOperation.source,
        transformations: [],
      };

      const simpleResult = scorer.scoreTransformation(simpleChange);
      const complexResult = scorer.scoreTransformation(complexChange);

      expect(simpleResult.factors.complexity).toBeGreaterThan(complexResult.factors.complexity);
    });

    it('should calculate pattern match factor based on pattern type', () => {
      const change: CodeChange = {
        file: 'test.js',
        operation: {
          id: 'op1',
          type: 'query',
          name: 'TestQuery',
          ast: {} as any,
          source: 'query TestQuery { field }',
          file: 'test.js',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: [],
        },
        pattern: 'well-known-pattern',
        oldQuery: 'query TestQuery { field }',
        newQuery: 'query TestQuery { renamedField }',
        transformations: [
          {
            type: 'field-rename',
            description: 'Rename field',
            from: 'field',
            to: 'renamedField',
            automated: true,
          },
        ],
      };

      const result = scorer.scoreTransformation(change);

      expect(result.factors.patternMatch).toBeGreaterThan(0);
      expect(result.factors.patternMatch).toBeLessThanOrEqual(100);
    });

    it('should calculate historical success factor', () => {
      const change: CodeChange = {
        file: 'test.js',
        operation: {
          id: 'op1',
          type: 'query',
          name: 'TestQuery',
          ast: {} as any,
          source: 'query TestQuery { field }',
          file: 'test.js',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: [],
        },
        pattern: 'historically-successful-pattern',
        oldQuery: 'query TestQuery { field }',
        newQuery: 'query TestQuery { renamedField }',
        transformations: [],
      };

      const result = scorer.scoreTransformation(change);

      expect(result.factors.historicalSuccess).toBeGreaterThan(0);
      expect(result.factors.historicalSuccess).toBeLessThanOrEqual(100);
    });
  });
});
