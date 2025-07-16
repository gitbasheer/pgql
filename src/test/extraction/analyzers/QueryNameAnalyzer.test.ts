import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryNameAnalyzer } from '../../../core/extraction/analyzers/QueryNameAnalyzer.js';
import { ExtractionContext } from '../../../core/extraction/engine/ExtractionContext.js';
import { ExtractedQuery, QueryContext } from '../../../core/extraction/types/index.js';
import { logger } from '../../../utils/logger.js';

vi.mock('../../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('QueryNameAnalyzer', () => {
  let analyzer: QueryNameAnalyzer;
  let mockContext: any;
  let mockNamingService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockNamingService = {
      processQueries: vi.fn((queries) => queries.map((q: any) => ({ ...q, namePattern: null }))),
    };

    mockContext = {
      getQueryNamingService: vi.fn().mockReturnValue(mockNamingService),
    } as any;

    analyzer = new QueryNameAnalyzer(mockContext);
  });

  describe('analyze', () => {
    it('should process queries through naming service', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: 'query1',
          content: 'query GetUser { user { id } }',
          type: 'query',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
      ];

      await analyzer.analyze(queries);

      expect(mockNamingService.processQueries).toHaveBeenCalledWith(queries);
    });

    it('should enhance query names when no pattern and no name', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: undefined,
          content: 'query GetUser { user { id } }',
          type: 'query',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
      ];

      mockNamingService.processQueries.mockReturnValueOnce([
        { ...queries[0], namePattern: null, name: undefined },
      ]);

      const result = await analyzer.analyze(queries);

      expect(result[0].name).toBe('GetUser');
      expect(logger.debug).toHaveBeenCalledWith("Enhanced static query name to 'GetUser'");
    });

    it('should not enhance names that already have patterns', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: undefined,
          content: 'query { user { id } }',
          type: 'query',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
      ];

      mockNamingService.processQueries.mockReturnValueOnce([
        { ...queries[0], namePattern: 'getUserQuery', name: undefined },
      ]);

      const result = await analyzer.analyze(queries);

      expect(result[0].name).toBeUndefined();
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe('enhanceQueryName', () => {
    it('should keep existing good names', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: 'ExistingGoodName',
          content: 'query { user { id } }',
          type: 'query',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
      ];

      mockNamingService.processQueries.mockReturnValueOnce([{ ...queries[0], namePattern: null }]);

      const result = await analyzer.analyze(queries);
      expect(result[0].name).toBe('ExistingGoodName');
    });

    it('should replace poor names starting with $', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: '$badName',
          content: 'query GetUser { user { id } }',
          type: 'query',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
      ];

      mockNamingService.processQueries.mockReturnValueOnce([{ ...queries[0], namePattern: null }]);

      const result = await analyzer.analyze(queries);
      expect(result[0].name).toBe('GetUser');
    });

    it('should replace "unnamed" names', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: 'unnamed',
          content: 'mutation CreateUser { createUser { id } }',
          type: 'mutation',
          filePath: '/src/mutations.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
      ];

      mockNamingService.processQueries.mockReturnValueOnce([{ ...queries[0], namePattern: null }]);

      const result = await analyzer.analyze(queries);
      expect(result[0].name).toBe('CreateUser');
    });
  });

  describe('extractNameFromContent', () => {
    const testCases = [
      {
        content: 'query GetUser { user { id } }',
        expectedName: 'GetUser',
        type: 'query',
      },
      {
        content: 'mutation CreateUser($input: UserInput!) { createUser(input: $input) { id } }',
        expectedName: 'CreateUser',
        type: 'mutation',
      },
      {
        content: 'subscription OnUserUpdate { userUpdated { id } }',
        expectedName: 'OnUserUpdate',
        type: 'subscription',
      },
      {
        content: 'fragment UserFields on User { id name email }',
        expectedName: 'UserFields',
        type: 'fragment',
      },
      {
        content: '{ user { id } }', // Anonymous query
        expectedName: undefined,
        type: 'query',
      },
      {
        content: `
          # Comment before
          query GetUserWithComments {
            user {
              id
            }
          }
        `,
        expectedName: 'GetUserWithComments',
        type: 'query',
      },
    ];

    testCases.forEach(({ content, expectedName, type }) => {
      it(`should extract name from ${type} content`, async () => {
        const queries: ExtractedQuery[] = [
          {
            id: '1',
            name: undefined,
            content,
            type,
            filePath: '/src/queries.ts',
            location: { line: 1, column: 1 },
            hash: 'hash1',
          },
        ];

        mockNamingService.processQueries.mockReturnValueOnce([
          { ...queries[0], namePattern: null },
        ]);

        const result = await analyzer.analyze(queries);

        if (expectedName) {
          expect(result[0].name).toBe(expectedName);
        } else {
          expect(result[0].name).toBeUndefined();
        }
      });
    });
  });

  describe('inferNameFromContext', () => {
    it('should infer name from function name', async () => {
      const context: QueryContext = {
        functionName: 'getUserData',
      };

      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: undefined,
          content: '{ user { id } }',
          type: 'query',
          context,
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
      ];

      mockNamingService.processQueries.mockReturnValueOnce([{ ...queries[0], namePattern: null }]);

      const result = await analyzer.analyze(queries);
      expect(result[0].name).toBe('GetUserData');
    });

    it('should infer name from component name', async () => {
      const context: QueryContext = {
        componentName: 'UserProfile',
      };

      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: undefined,
          content: '{ user { id } }',
          type: 'query',
          context,
          filePath: '/src/components/UserProfile.tsx',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
      ];

      mockNamingService.processQueries.mockReturnValueOnce([{ ...queries[0], namePattern: null }]);

      const result = await analyzer.analyze(queries);
      expect(result[0].name).toBe('UserProfileQuery');
    });

    it('should infer name from export name', async () => {
      const context: QueryContext = {
        exportName: 'USER_QUERY',
      };

      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: undefined,
          content: '{ user { id } }',
          type: 'query',
          context,
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
      ];

      mockNamingService.processQueries.mockReturnValueOnce([{ ...queries[0], namePattern: null }]);

      const result = await analyzer.analyze(queries);
      expect(result[0].name).toBe('USER_QUERY');
    });
  });

  describe('inferNameFromPath', () => {
    it('should infer name from file path', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: undefined,
          content: '{ user { id } }',
          type: 'query',
          filePath: '/src/UserProfile.tsx',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
      ];

      mockNamingService.processQueries.mockReturnValueOnce([{ ...queries[0], namePattern: null }]);

      const result = await analyzer.analyze(queries);
      expect(result[0].name).toBe('QueryUserProfile');
    });

    it('should skip generic file names', async () => {
      const genericNames = ['index', 'queries', 'graphql'];

      for (const genericName of genericNames) {
        const queries: ExtractedQuery[] = [
          {
            id: '1',
            name: undefined,
            content: '{ user { id } }',
            type: 'query',
            filePath: `/src/${genericName}.ts`,
            location: { line: 1, column: 1 },
            hash: 'hash1',
          },
        ];

        mockNamingService.processQueries.mockReturnValueOnce([
          { ...queries[0], namePattern: null },
        ]);

        const result = await analyzer.analyze(queries);
        expect(result[0].name).toBeUndefined();
      }
    });
  });

  describe('formatName', () => {
    it('should format names correctly', async () => {
      const testCases = [
        {
          baseName: 'getUserQuery',
          type: 'query',
          expected: 'GetUserQuery',
        },
        {
          baseName: 'createUserMutation',
          type: 'mutation',
          expected: 'CreateUserMutation',
        },
        {
          baseName: 'userProfile',
          type: 'query',
          expected: 'QueryUserProfile',
        },
        {
          baseName: 'UserFragment',
          type: 'fragment',
          expected: 'UserFragment',
        },
      ];

      for (const { baseName, type, expected } of testCases) {
        const queries: ExtractedQuery[] = [
          {
            id: '1',
            name: undefined,
            content: '{ user { id } }',
            type,
            context: { functionName: baseName },
            filePath: '/src/queries.ts',
            location: { line: 1, column: 1 },
            hash: 'hash1',
          },
        ];

        mockNamingService.processQueries.mockReturnValueOnce([
          { ...queries[0], namePattern: null },
        ]);

        const result = await analyzer.analyze(queries);
        expect(result[0].name).toBe(expected);
      }
    });
  });

  describe('validateOperation and analyzeOperation', () => {
    it('should validate operations', () => {
      const operation = { query: 'test' };
      expect(analyzer.validateOperation(operation)).toBe(true);
    });

    it('should analyze operations', () => {
      const operation = { query: 'test' };
      expect(analyzer.analyzeOperation(operation)).toEqual({ valid: true });
    });
  });
});
