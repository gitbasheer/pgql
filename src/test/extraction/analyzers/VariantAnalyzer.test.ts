import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VariantAnalyzer } from '../../../core/extraction/analyzers/VariantAnalyzer';
import { ExtractionContext } from '../../../core/extraction/engine/ExtractionContext';
import { ExtractedQuery, VariantAnalysisResult } from '../../../core/extraction/types/index';
import { logger } from '../../../utils/logger';
import * as fs from 'fs/promises';
import * as babel from '@babel/parser';

vi.mock('fs/promises');
vi.mock('../../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('VariantAnalyzer', () => {
  let analyzer: VariantAnalyzer;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {} as any;
    analyzer = new VariantAnalyzer(mockContext);
  });

  describe('analyze', () => {
    it('should analyze multiple queries', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: '1',
          name: 'Query1',
          content: 'query { user { id } }',
          type: 'query',
          filePath: '/src/query1.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        },
        {
          id: '2',
          name: 'Query2',
          content: 'query { user { id ...${isAdmin ? "AdminFields" : ""} } }',
          type: 'query',
          filePath: '/src/query2.ts',
          location: { line: 5, column: 1 },
          hash: 'hash2',
        },
      ];

      const results = await analyzer.analyze(queries);

      expect(results).toHaveLength(2);
      expect(results[0].isVariant).toBe(false);
      expect(results[1].isVariant).toBe(true);
    });
  });

  describe('analyzeContent', () => {
    it('should detect template literal placeholders', async () => {
      const query: ExtractedQuery = {
        id: '1',
        name: 'DynamicQuery',
        content: 'query { user { id ${includeEmail ? "email" : ""} } }',
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const result = results[0];

      expect(result.isVariant).toBe(true);
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0]).toMatchObject({
        type: 'ternary',
        // NOTE: can we classify patterns by type?
        pattern: '${includeEmail ? "email" : ""}',
        // NOTE: can we split between deciding variables (in this case includeEmail) and fragment variables (in this case either email or null) have the variables be exactly logically defined? in this case it's either email or nothing. so 2 variants. var
        variables: ['includeEmail ? "email" : ""'],
      });
      expect(result.possibleVariants).toBe(2);
    });

    it('should detect multiple placeholders', async () => {
      const query: ExtractedQuery = {
        id: '1',
        name: 'MultiVariantQuery',
        content: `query {
          user {
            id
            \${includeEmail ? "email" : ""}
            \${includeProfile ? "profile { name }" : ""}
          }
        }`,
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const result = results[0];

      expect(result.isVariant).toBe(true);
      expect(result.patterns).toHaveLength(2);
      expect(result.possibleVariants).toBe(4); // 2^2
    });

    it('should detect dynamic fragment spreads', async () => {
      const query: ExtractedQuery = {
        id: '1',
        name: 'FragmentQuery',
        content: 'query { user { id ...${fragmentName} } }',
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const result = results[0];

      expect(result.isVariant).toBe(true);
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0]).toMatchObject({
        type: 'ternary',
        pattern: '...${fragmentName}',
        variables: ['fragmentName'],
      });
    });

    it('should handle queries without variants', async () => {
      const query: ExtractedQuery = {
        id: '1',
        name: 'StaticQuery',
        content: 'query { user { id email ...UserFields } }',
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const result = results[0];

      expect(result.isVariant).toBe(false);
      expect(result.patterns).toHaveLength(0);
      expect(result.possibleVariants).toBe(0); // NOTE: should we make the default value 1? 
    });
  });

  describe('analyzeSourceFile', () => {
    it('should analyze source file for more context', async () => {
      const fileContent = `
        import { gql } from 'graphql-tag';
        
        const isAdmin = true;
        
        const query = gql\`
          query GetUser {
            user {
              id
              \${isAdmin ? 'role' : ''}
            }
          }
        \`;
      `;

      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const query: ExtractedQuery = {
        id: '1',
        name: 'GetUser',
        content: 'query GetUser { user { id ${isAdmin ? "role" : ""} } }',
        type: 'query',
        filePath: '/src/query.ts',
        location: { line: 6, column: 9 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const result = results[0];

      expect(result.isVariant).toBe(true);
      expect(fs.readFile).toHaveBeenCalledWith('/src/query.ts', 'utf-8');
      // NOTE: do we have to add more tests to check if the file content is parsed correctly?
    });

    it('should handle file read errors gracefully', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const query: ExtractedQuery = {
        id: '1',
        name: 'Query',
        content: 'query { user { id } }',
        type: 'query',
        filePath: '/src/missing.ts',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const result = results[0];

      expect(result.isVariant).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        'Could not analyze source file /src/missing.ts:',
        expect.any(Error)
      );
    });

    it('should handle parsing errors gracefully', async () => {
      const invalidContent = 'this is not valid javascript {{{';
      vi.mocked(fs.readFile).mockResolvedValue(invalidContent);

      const query: ExtractedQuery = {
        id: '1',
        name: 'Query',
        content: 'query { user { id } }',
        type: 'query',
        filePath: '/src/invalid.ts',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      
      expect(logger.debug).toHaveBeenCalledWith(
        'Could not analyze source file /src/invalid.ts:',
        expect.any(Error)
      );
    });
  });

  describe('patternToSwitch', () => {
    it('should convert ternary patterns to boolean switches', async () => {
      const query: ExtractedQuery = {
        id: '1',
        name: 'Query',
        content: 'query { user { ${isAdmin ? "role" : ""} } }',
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const result = results[0];

      expect(result.switches).toHaveLength(1);
      expect(result.switches[0]).toMatchObject({
        variable: 'isAdmin ? "role" : ""',
        type: 'boolean',
        possibleValues: [true, false],
        location: 'fragment', // NOTE: is this intended? should we specify the location?
      });
    });

    it('should handle patterns without variables', async () => {
      const query: ExtractedQuery = {
        id: '1',
        name: 'Query',
        content: 'query { user { id } }',
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const result = results[0];

      expect(result.switches).toHaveLength(0);
    });
  });

  describe('calculatePossibleVariants', () => {
    it('should calculate correct number of variants', async () => {
      const testCases = [
        {
          content: 'query { user { id } }',
          expectedVariants: 0,
        },
        {
          content: 'query { user { ${a ? "x" : ""} } }',
          expectedVariants: 2,
        },
        {
          content: 'query { user { ${a ? "x" : ""} ${b ? "y" : ""} } }',
          expectedVariants: 4,
        },
        {
          content: 'query { user { ${a ? "x" : ""} ${b ? "y" : ""} ${c ? "z" : ""} } }',
          expectedVariants: 8,
        },
      ];

      for (const { content, expectedVariants } of testCases) {
        const query: ExtractedQuery = {
          id: '1',
          name: 'Query',
          content,
          type: 'query',
          filePath: 'inline',
          location: { line: 1, column: 1 },
          hash: 'hash1',
        };

        const results = await analyzer.analyze([query]);
        expect(results[0].possibleVariants).toBe(expectedVariants);
      }
    });
  });

  describe('variantGenerationStrategy', () => {
    it('should use inline strategy for few variants', async () => {
      const query: ExtractedQuery = {
        id: '1',
        name: 'Query',
        content: 'query { user { ${a ? "x" : ""} } }',
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      expect(results[0].variantGenerationStrategy).toBe('inline');
    });

    it('should use separate strategy for many variants', async () => {
      // Create a query with 4 boolean conditions = 16 variants
      const content = `query {
        user {
          \${a ? "a" : ""}
          \${b ? "b" : ""}
          \${c ? "c" : ""}
          \${d ? "d" : ""}
        }
      }`;

      const query: ExtractedQuery = {
        id: '1',
        name: 'Query',
        content,
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      expect(results[0].possibleVariants).toBe(16);
      expect(results[0].variantGenerationStrategy).toBe('separate');
    });
  });

  describe('getLineNumber', () => {
    it('should calculate correct line numbers', async () => {
      const content = `line1
line2
line3 ${true ? "x" : ""}
line4`;

      const query: ExtractedQuery = {
        id: '1',
        name: 'Query',
        content,
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const pattern = results[0].patterns[0];

      expect(pattern.location.line).toBe(3);
    });
  });

  describe('validateOperation and analyzeOperation', () => { // Note: based on what? should we test for invalid?  
    it('should validate operations', () => {
      const operation = { query: 'test' };
      expect(analyzer.validateOperation(operation)).toBe(true);
    });

    it('should analyze operations', () => {
      const operation = { query: 'test' };
      expect(analyzer.analyzeOperation(operation)).toEqual({ valid: true });
    });
  });

  describe('complex scenarios', () => {
    it('should handle nested template expressions', async () => {
      const content = `query {
        user {
          id
          \${isAuthenticated ? \`
            email
            \${isAdmin ? "role" : ""}
          \` : ""}
        }
      }`;

      const query: ExtractedQuery = {
        id: '1',
        name: 'NestedQuery',
        content,
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const result = results[0];

      expect(result.isVariant).toBe(true);
      // NOTE: we should test for the nested patterns, number of variants, etc.
      expect(result.patterns.length).toBeGreaterThan(0);
    });

    it('should handle mixed static and dynamic fragments', async () => {
      const content = `query {
        user {
          id
          ...StaticFragment
          ...\${dynamicFragment}
          ...AnotherStaticFragment
        }
      }`;

      const query: ExtractedQuery = {
        id: '1',
        name: 'MixedFragmentsQuery',
        content,
        type: 'query',
        filePath: 'inline',
        location: { line: 1, column: 1 },
        hash: 'hash1',
      };

      const results = await analyzer.analyze([query]);
      const result = results[0];

      expect(result.isVariant).toBe(true);
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].pattern).toBe('...${dynamicFragment}');
    });
  });
});