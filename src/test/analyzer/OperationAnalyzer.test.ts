import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OperationAnalyzer } from '../../core/analyzer/OperationAnalyzer';
import { parse } from 'graphql';
import { logger } from '../../utils/logger';

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('OperationAnalyzer', () => {
  let analyzer: OperationAnalyzer;

  beforeEach(() => {
    vi.clearAllMocks();
    analyzer = new OperationAnalyzer();
  });

  describe('analyzeOperations', () => {
    it('should analyze and group named operations', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/queries1.ts',
          content: 'query GetUser { user { id name } }',
          name: 'GetUser',
          type: 'query',
        },
        {
          id: '2',
          filePath: '/src/queries2.ts',
          content: 'query GetUser { user { id name email } }',
          name: 'GetUser',
          type: 'query',
        },
      ];

      const groups = analyzer.analyzeOperations(queries);

      expect(groups.size).toBe(1);
      expect(groups.has('GetUser')).toBe(true);
      
      const group = groups.get('GetUser')!;
      expect(group.type).toBe('query');
      expect(group.variants).toHaveLength(2);
      expect(group.commonSelections).toContain('user');
      expect(group.commonSelections).toContain('user.id');
      expect(group.commonSelections).toContain('user.name');
      expect(group.differingSelections).toContain('user.email');
    });

    it('should handle operations with variables', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/queries.ts',
          content: 'query GetUser($id: ID!) { user(id: $id) { id name } }',
          name: 'GetUser',
          type: 'query',
        },
        {
          id: '2',
          filePath: '/src/queries2.ts',
          content: 'query GetUser($id: ID!, $includeEmail: Boolean!) { user(id: $id) { id name email @include(if: $includeEmail) } }',
          name: 'GetUser',
          type: 'query',
        },
      ];

      const groups = analyzer.analyzeOperations(queries);
      const group = groups.get('GetUser')!;

      expect(group.commonVariables).toEqual(['id']);
      expect(group.variants[0].signature.variables).toEqual(['id']);
      expect(group.variants[1].signature.variables).toEqual(['id', 'includeEmail']);
    });

    it('should group unnamed operations by similarity', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/q1.ts',
          content: '{ user { id name } }',
          type: 'query',
        },
        {
          id: '2',
          filePath: '/src/q2.ts',
          content: '{ user { id name email } }',
          type: 'query',
        },
        {
          id: '3',
          filePath: '/src/q3.ts',
          content: '{ posts { title content } }',
          type: 'query',
        },
      ];

      const groups = analyzer.analyzeOperations(queries);

      expect(groups.size).toBe(2);
      
      // Should have grouped the similar user queries
      const userGroup = Array.from(groups.values()).find(g => 
        g.commonSelections.includes('user')
      );
      expect(userGroup).toBeDefined();
      expect(userGroup!.variants).toHaveLength(2);
      expect(userGroup!.canonicalName).toMatch(/^unnamed_query_\d+$/);

      // Posts query should be in its own group
      const postsGroup = Array.from(groups.values()).find(g => 
        g.commonSelections.includes('posts')
      );
      expect(postsGroup).toBeDefined();
      expect(postsGroup!.variants).toHaveLength(1);
    });

    it('should handle operations with fragments', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/queries.ts',
          content: `
            query GetUser {
              user {
                id
                ...UserFields
              }
            }
          `,
          name: 'GetUser',
          type: 'query',
        },
        {
          id: '2',
          filePath: '/src/queries2.ts',
          content: `
            query GetUser {
              user {
                id
                ...UserFields
                ...ProfileFields
              }
            }
          `,
          name: 'GetUser',
          type: 'query',
        },
      ];

      const groups = analyzer.analyzeOperations(queries);
      const group = groups.get('GetUser')!;

      expect(group.commonSelections).toContain('...UserFields');
      expect(group.differingSelections).toContain('...ProfileFields');
      
      expect(group.variants[0].signature.fragments).toEqual(['UserFields']);
      expect(group.variants[1].signature.fragments).toEqual(['ProfileFields', 'UserFields']);
    });

    it('should handle mutations and subscriptions', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/mutations.ts',
          content: 'mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }',
          name: 'CreateUser',
          type: 'mutation',
          ast: parse('mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }'),
        },
        {
          id: '2',
          filePath: '/src/subscriptions.ts',
          content: 'subscription OnUserUpdate { userUpdated { id name } }',
          name: 'OnUserUpdate',
          type: 'subscription',
          ast: parse('subscription OnUserUpdate { userUpdated { id name } }'),
        },
      ];

      const groups = analyzer.analyzeOperations(queries);

      expect(groups.size).toBe(2);
      expect(groups.get('CreateUser')!.type).toBe('mutation');
      expect(groups.get('OnUserUpdate')!.type).toBe('subscription');
    });

    it('should handle invalid operations gracefully', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/invalid.ts',
          content: 'invalid graphql syntax { ',
          type: 'query',
        },
        {
          id: '2',
          filePath: '/src/valid.ts',
          content: 'query Valid { user { id } }',
          name: 'Valid',
          type: 'query',
        },
      ];

      const groups = analyzer.analyzeOperations(queries);

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to analyze operation 1:',
        expect.any(Error)
      );
      expect(groups.size).toBe(1);
      expect(groups.has('Valid')).toBe(true);
    });

    it('should extract nested selections up to 2 levels', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/nested.ts',
          content: `
            query DeepQuery {
              user {
                id
                profile {
                  name
                  settings {
                    theme
                    notifications {
                      email
                    }
                  }
                }
              }
            }
          `,
          name: 'DeepQuery',
          type: 'query',
        },
      ];

      const groups = analyzer.analyzeOperations(queries);
      const group = groups.get('DeepQuery')!;

      expect(group.commonSelections).toContain('user');
      expect(group.commonSelections).toContain('user.id');
      expect(group.commonSelections).toContain('user.profile');
      expect(group.commonSelections).toContain('user.profile.name');
      expect(group.commonSelections).toContain('user.profile.settings');
      // Should not include deeper levels
      expect(group.commonSelections).not.toContain('user.profile.settings.theme');
    });
  });

  describe('generateOperationReport', () => {
    beforeEach(() => {
      const queries = [
        {
          id: '1',
          filePath: '/src/q1.ts',
          content: 'query GetUser { user { id ...UserFields } }',
          name: 'GetUser',
          type: 'query',
        },
        {
          id: '2',
          filePath: '/src/q2.ts',
          content: 'query GetUser { user { id name ...UserFields } }',
          name: 'GetUser',
          type: 'query',
        },
        {
          id: '3',
          filePath: '/src/q3.ts',
          content: 'mutation CreateUser { createUser { id } }',
          name: 'CreateUser',
          type: 'mutation',
        },
        {
          id: '4',
          filePath: '/src/q4.ts',
          content: '{ posts { title } }',
          type: 'query',
        },
      ];

      analyzer.analyzeOperations(queries);
    });

    it('should generate comprehensive operation report', () => {
      const report = analyzer.generateOperationReport();

      expect(report.totalOperations).toBe(4);
      expect(report.uniqueOperations).toBe(3); // GetUser, CreateUser, unnamed
      expect(report.operationsByType).toEqual({
        query: 2,
        mutation: 1,
        subscription: 0,
      });
    });

    it('should identify duplicate operations', () => {
      const report = analyzer.generateOperationReport();

      expect(report.duplicateOperations).toHaveLength(1);
      expect(report.duplicateOperations[0]).toMatchObject({
        name: 'GetUser',
        variantCount: 2,
        files: expect.arrayContaining(['/src/q1.ts', '/src/q2.ts']),
      });
    });

    it('should count unnamed operations', () => {
      const report = analyzer.generateOperationReport();
      expect(report.unnamedOperations).toBe(1);
    });

    it('should track fragment usage', () => {
      const report = analyzer.generateOperationReport();

      expect(report.fragmentUsage).toHaveLength(1);
      expect(report.fragmentUsage[0]).toMatchObject({
        fragment: 'UserFields',
        usageCount: 1,
        operations: ['GetUser'],
      });
    });
  });

  describe('getSuggestedNames', () => {
    it('should suggest names for unnamed operations', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/q1.ts',
          content: '{ user { id name } posts { title } }',
          type: 'query',
        },
        {
          id: '2',
          filePath: '/src/q2.ts',
          content: '{ profile { avatar bio } }',
          type: 'query',
        },
      ];

      analyzer.analyzeOperations(queries);
      const suggestions = analyzer.getSuggestedNames();

      expect(suggestions.size).toBe(2);
      
      // Should suggest based on main selections
      const values = Array.from(suggestions.values());
      expect(values).toContain('GetUserPosts');
      expect(values).toContain('GetProfile');
    });

    it('should not suggest names for already named operations', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/q1.ts',
          content: 'query NamedQuery { user { id } }',
          name: 'NamedQuery',
          type: 'query',
        },
      ];

      analyzer.analyzeOperations(queries);
      const suggestions = analyzer.getSuggestedNames();

      expect(suggestions.size).toBe(0);
    });

    it('should handle operations with only fragment spreads', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/q1.ts',
          content: '{ ...UserFragment }',
          type: 'query',
        },
      ];

      analyzer.analyzeOperations(queries);
      const suggestions = analyzer.getSuggestedNames();

      // Should not suggest a name when only fragments are present
      expect(suggestions.size).toBe(0);
    });
  });

  describe('areSimilarOperations', () => {
    it('should consider operations with 70%+ overlap as similar', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/q1.ts',
          content: '{ user { id name email } }',
          type: 'query',
        },
        {
          id: '2',
          filePath: '/src/q2.ts',
          content: '{ user { id name email avatar } }',
          type: 'query',
        },
        {
          id: '3',
          filePath: '/src/q3.ts',
          content: '{ posts { title } }',
          type: 'query',
        },
      ];

      const groups = analyzer.analyzeOperations(queries);

      // First two queries should be grouped together (75% similarity)
      // Third query should be separate
      expect(groups.size).toBe(2);
    });

    it('should not group operations of different types', () => {
      const queries = [
        {
          id: '1',
          filePath: '/src/q1.ts',
          content: '{ user { id } }',
          type: 'query',
        },
        {
          id: '2',
          filePath: '/src/m1.ts',
          content: 'mutation { user { id } }',
          type: 'mutation',
          ast: parse('mutation { createUser { id } }'),
        },
      ];

      const groups = analyzer.analyzeOperations(queries);

      expect(groups.size).toBe(2);
    });
  });

  describe('validateOperation', () => {
    it('should validate operations', () => {
      const operation = { query: 'test' };
      expect(analyzer.validateOperation(operation)).toBe(true);
    });
  });
});