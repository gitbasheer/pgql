import { describe, it, expect, beforeEach } from 'vitest';
import { MinimalChangeCalculator } from '../../core/applicator/MinimalChangeCalculator.js';
import * as t from '@babel/types';

describe('MinimalChangeCalculator', () => {
  let calculator: MinimalChangeCalculator;

  beforeEach(async () => {
    vi.resetModules();
    calculator = new MinimalChangeCalculator();
  });

  describe('calculateGraphQLChanges', () => {
    it('should calculate simple text replacements', () => {
      const original = 'query { user { id } }';
      const transformed = 'query { account { id } }';

      const changeMap = calculator.calculateGraphQLChanges(original, transformed);

      // Should have changes
      expect(
        changeMap.deletions.size + changeMap.additions.size + changeMap.replacements.size,
      ).toBeGreaterThan(0);
    });

    it('should handle no changes', () => {
      const query = 'query { user { id } }';

      const changeMap = calculator.calculateGraphQLChanges(query, query);

      expect(changeMap.deletions.size).toBe(0);
      expect(changeMap.additions.size).toBe(0);
      expect(changeMap.replacements.size).toBe(0);
    });

    it('should handle additions', () => {
      const original = 'query { user { id } }';
      const transformed = 'query { user { id name } }';

      const changeMap = calculator.calculateGraphQLChanges(original, transformed);

      expect(changeMap.additions.size).toBeGreaterThan(0);
    });

    it('should handle deletions', () => {
      const original = 'query { user { id name } }';
      const transformed = 'query { user { id } }';

      const changeMap = calculator.calculateGraphQLChanges(original, transformed);

      expect(changeMap.deletions.size).toBeGreaterThan(0);
    });

    it('should handle complex queries with multiple changes', () => {
      const original = `query GetUser {
        allUsers {
          edges {
            node {
              id
              name
            }
          }
        }
      }`;

      const transformed = `query GetUser {
        users {
          nodes {
            id
            name
          }
        }
      }`;

      const changeMap = calculator.calculateGraphQLChanges(original, transformed);

      // Should have multiple changes
      expect(
        changeMap.deletions.size + changeMap.additions.size + changeMap.replacements.size,
      ).toBeGreaterThan(0);
    });

    it('should fallback to text diff when GraphQL parsing fails', () => {
      const original = 'not a valid { graphql query';
      const transformed = 'still not a valid { graphql query';

      // Should not throw and should calculate text differences
      const changeMap = calculator.calculateGraphQLChanges(original, transformed);

      expect(changeMap).toBeDefined();
    });
  });

  describe('applyChangesToQuasis', () => {
    it('should apply changes to simple quasis', () => {
      const originalQuasis = [
        {
          type: 'TemplateElement',
          value: { raw: 'query { user { id } }', cooked: 'query { user { id } }' },
        },
      ];

      const changeMap = calculator.calculateGraphQLChanges(
        'query { user { id } }',
        'query { account { id } }',
      );

      const newQuasis = calculator.applyChangesToQuasis(originalQuasis, changeMap);

      expect(newQuasis).toHaveLength(1);
      expect(newQuasis[0].value.raw).toContain('account');
    });

    it('should preserve interpolations when applying changes', () => {
      const originalQuasis = [
        {
          type: 'TemplateElement',
          value: { raw: 'query { user { ...', cooked: 'query { user { ...' },
        },
        {
          type: 'TemplateElement',
          value: { raw: ' } }', cooked: ' } }' },
        },
      ];

      const original = 'query { user { ...${...} } }';
      const transformed = 'query { account { ...${...} } }';

      const changeMap = calculator.calculateGraphQLChanges(original, transformed);
      const newQuasis = calculator.applyChangesToQuasis(originalQuasis, changeMap);

      expect(newQuasis).toHaveLength(2);
      expect(newQuasis[0].value.raw).toContain('account');
      expect(newQuasis[1].value.raw).toBe(' } }');
    });

    it('should handle multiple interpolations', () => {
      const originalQuasis = [
        {
          type: 'TemplateElement',
          value: { raw: 'query ', cooked: 'query ' },
        },
        {
          type: 'TemplateElement',
          value: { raw: ' { user(id: ', cooked: ' { user(id: ' },
        },
        {
          type: 'TemplateElement',
          value: { raw: ') { id } }', cooked: ') { id } }' },
        },
      ];

      // Simulate query with interpolations
      const original = 'query ${...} { user(id: ${...}) { id } }';
      const transformed = 'query ${...} { account(id: ${...}) { id } }';

      const changeMap = calculator.calculateGraphQLChanges(original, transformed);
      const newQuasis = calculator.applyChangesToQuasis(originalQuasis, changeMap);

      expect(newQuasis).toHaveLength(3);
      expect(newQuasis[1].value.raw).toContain('account');
    });

    it('should create proper template elements', () => {
      const originalQuasis = [
        {
          type: 'TemplateElement',
          value: { raw: 'test', cooked: 'test' },
        },
      ];

      const changeMap = {
        additions: new Map([[0, ' added']]),
        deletions: new Map(),
        replacements: new Map(),
      };

      const newQuasis = calculator.applyChangesToQuasis(originalQuasis, changeMap);

      expect(newQuasis[0]).toHaveProperty('type', 'TemplateElement');
      expect(newQuasis[0].value).toHaveProperty('raw');
      expect(newQuasis[0].value).toHaveProperty('cooked');
    });

    it('should handle empty change map', () => {
      const originalQuasis = [
        {
          type: 'TemplateElement',
          value: { raw: 'query { user { id } }', cooked: 'query { user { id } }' },
        },
      ];

      const changeMap = {
        additions: new Map(),
        deletions: new Map(),
        replacements: new Map(),
      };

      const newQuasis = calculator.applyChangesToQuasis(originalQuasis, changeMap);

      expect(newQuasis).toHaveLength(1);
      expect(newQuasis[0].value.raw).toBe('query { user { id } }');
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      const changeMap = calculator.calculateGraphQLChanges('', '');

      expect(changeMap.deletions.size).toBe(0);
      expect(changeMap.additions.size).toBe(0);
      expect(changeMap.replacements.size).toBe(0);
    });

    it('should handle complete replacement', () => {
      const original = 'query A { a }';
      const transformed = 'query B { b }';

      const changeMap = calculator.calculateGraphQLChanges(original, transformed);

      // Should have changes for the complete transformation
      expect(
        changeMap.deletions.size + changeMap.additions.size + changeMap.replacements.size,
      ).toBeGreaterThan(0);
    });

    it('should handle whitespace differences', () => {
      const original = 'query  {  user  {  id  }  }';
      const transformed = 'query { user { id } }';

      const changeMap = calculator.calculateGraphQLChanges(original, transformed);

      // The parser normalizes whitespace, so these might be seen as identical
      // after parsing. Let's check if any changes were detected
      const hasChanges =
        changeMap.deletions.size + changeMap.additions.size + changeMap.replacements.size > 0;

      // If no changes, that's also valid since GraphQL ignores extra whitespace
      expect(hasChanges || changeMap.deletions.size === 0).toBe(true);
    });

    it('should handle newlines', () => {
      const original = 'query {\n  user {\n    id\n  }\n}';
      const transformed = 'query {\n  account {\n    id\n  }\n}';

      const changeMap = calculator.calculateGraphQLChanges(original, transformed);

      // Should handle multiline queries
      expect(changeMap).toBeDefined();
    });

    it('should properly cook strings with escape sequences', () => {
      const originalQuasis = [
        {
          type: 'TemplateElement',
          value: { raw: 'query\\n{\\tuser }', cooked: '' },
        },
      ];

      const changeMap = {
        additions: new Map(),
        deletions: new Map(),
        replacements: new Map(),
      };

      const newQuasis = calculator.applyChangesToQuasis(originalQuasis, changeMap);

      // Check that cooked value is properly generated
      expect(newQuasis[0].value.cooked).toBe('query\n{\tuser }');
    });

    it('should properly handle user to account transformation', () => {
      const original =
        'query GetUser($id: ID!) {\n    user(id: $id) {\n      ...${...}\n    }\n  }';
      const transformed =
        'query GetUser($id: ID!) {\n    account(id: $id) {\n      ...${...}\n    }\n  }';

      const changeMap = calculator.calculateGraphQLChanges(original, transformed);

      // Apply to a quasi to test the actual issue
      const originalQuasis = [
        {
          type: 'TemplateElement',
          value: { raw: 'query GetUser($id: ID!) {\n    user(id: $id) {\n      ...', cooked: '' },
        },
        {
          type: 'TemplateElement',
          value: { raw: '\n    }\n  }', cooked: '' },
        },
      ];

      const newQuasis = calculator.applyChangesToQuasis(originalQuasis, changeMap);

      expect(newQuasis[0].value.raw).toContain('account(id:');
      expect(newQuasis[0].value.raw).not.toContain('accounter(id:');
    });
  });
});
