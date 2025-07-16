import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GraphQLMigrationTool,
  MigrationOptions,
  MigrationResult,
} from '../../core/GraphQLMigrationTool.js';
import { GraphQLExtractor } from '../../core/scanner/GraphQLExtractor.js';
import { SchemaAnalyzer } from '../../core/analyzer/SchemaAnalyzer.js';
import { PatternMatcher } from '../../core/analyzer/PatternMatcher.js';
import * as fs from 'fs/promises';

// Mock dependencies
vi.mock('../../core/scanner/GraphQLExtractor');
vi.mock('../../core/analyzer/SchemaAnalyzer');
vi.mock('../../core/analyzer/PatternMatcher');
vi.mock('../../core/config/ConfigValidator');
vi.mock('fs/promises');

describe('GraphQLMigrationTool', () => {
  const mockOptions: MigrationOptions = {
    schemaPath: '/path/to/schema.graphql',
    targetPath: '/path/to/target',
    configPath: '/path/to/config.json',
    dryRun: false,
    interactive: false,
    generateTypes: false,
  };

  let tool: GraphQLMigrationTool;
  let mockExtractor: any;
  let mockAnalyzer: any;
  let mockPatternMatcher: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    mockExtractor = {
      extractQueries: vi.fn(),
      extractFragments: vi.fn(),
    };
    mockAnalyzer = {
      analyze: vi.fn(),
      getDeprecatedFields: vi.fn(),
    };
    mockPatternMatcher = {
      findPatterns: vi.fn(),
      matchOperation: vi.fn(),
    };

    vi.mocked(GraphQLExtractor).mockImplementation(() => mockExtractor);
    vi.mocked(SchemaAnalyzer).mockImplementation(() => mockAnalyzer);
    vi.mocked(PatternMatcher).mockImplementation(() => mockPatternMatcher);

    // Mock file system
    vi.mocked(fs.readFile).mockResolvedValue('type Query { user: User }');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.access).mockResolvedValue(undefined);

    tool = new GraphQLMigrationTool(mockOptions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with correct options', () => {
      expect(tool).toBeDefined();
      expect(GraphQLExtractor).toHaveBeenCalled();
      expect(PatternMatcher).toHaveBeenCalled();
    });

    it('should initialize with default options when optional fields are missing', () => {
      const minimalOptions: MigrationOptions = {
        schemaPath: '/path/to/schema.graphql',
        targetPath: '/path/to/target',
      };

      const minimalTool = new GraphQLMigrationTool(minimalOptions);
      expect(minimalTool).toBeDefined();
    });
  });

  describe('run', () => {
    beforeEach(() => {
      // Setup successful mocks
      mockExtractor.extractQueries.mockResolvedValue([
        {
          id: 'query1',
          name: 'GetUser',
          type: 'query',
          source: 'query GetUser { user { id name } }',
          file: '/path/to/file.ts',
          line: 1,
          column: 1,
        },
      ]);

      mockAnalyzer.analyze.mockResolvedValue({
        deprecatedFields: ['user.oldField'],
        operations: [],
      });

      mockPatternMatcher.findPatterns.mockResolvedValue([
        {
          pattern: 'GetUser',
          confidence: 95,
          transformations: [],
        },
      ]);
    });

    it('should successfully run migration with valid inputs', async () => {
      const result = await tool.run();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.totalQueries).toBeGreaterThanOrEqual(0);
      expect(result.errors).toEqual([]);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should handle schema loading errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Schema file not found'));

      const result = await tool.run();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Schema file not found');
    });

    it('should handle extraction errors', async () => {
      mockExtractor.extractQueries.mockRejectedValue(new Error('Extraction failed'));

      const result = await tool.run();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Extraction failed');
    });

    it('should handle analysis errors', async () => {
      mockAnalyzer.analyze.mockRejectedValue(new Error('Analysis failed'));

      const result = await tool.run();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Analysis failed');
    });

    it('should track correct metrics', async () => {
      const mockQueries = [
        {
          id: 'q1',
          name: 'Query1',
          type: 'query',
          source: 'query Query1 { user { id } }',
          file: 'file1.ts',
          line: 1,
          column: 1,
        },
        {
          id: 'q2',
          name: 'Query2',
          type: 'query',
          source: 'query Query2 { posts { id } }',
          file: 'file2.ts',
          line: 1,
          column: 1,
        },
      ];

      mockExtractor.extractQueries.mockResolvedValue(mockQueries);

      const result = await tool.run();

      expect(result.totalQueries).toBe(2);
      expect(result.transformedQueries).toBeGreaterThanOrEqual(0);
    });

    it('should handle dry run mode', async () => {
      const dryRunOptions = { ...mockOptions, dryRun: true };
      const dryRunTool = new GraphQLMigrationTool(dryRunOptions);

      const result = await dryRunTool.run();

      expect(result.success).toBe(true);
      expect(vi.mocked(fs.writeFile)).not.toHaveBeenCalled();
    });

    it('should generate types when requested', async () => {
      const typeGenOptions = { ...mockOptions, generateTypes: true };
      const typeGenTool = new GraphQLMigrationTool(typeGenOptions);

      const result = await typeGenTool.run();

      expect(result.success).toBe(true);
      // Should have attempted to generate types
      expect(mockAnalyzer.analyze).toHaveBeenCalled();
    });

    it('should handle warnings correctly', async () => {
      mockAnalyzer.analyze.mockResolvedValue({
        deprecatedFields: ['user.oldField'],
        operations: [],
        warnings: ['Warning: Field will be deprecated soon'],
      });

      const result = await tool.run();

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Warning: Field will be deprecated soon');
    });

    it('should measure execution duration', async () => {
      const startTime = Date.now();

      const result = await tool.run();

      const endTime = Date.now();
      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThanOrEqual(endTime - startTime + 100); // Allow for some variance
    });
  });

  describe('error handling', () => {
    it('should handle file permission errors', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Permission denied'));

      const result = await tool.run();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Permission denied');
    });

    it('should handle invalid schema errors', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid schema');

      const result = await tool.run();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('schema');
    });

    it('should handle concurrent access errors', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('EBUSY: resource busy'));

      const result = await tool.run();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('EBUSY');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex nested queries', async () => {
      const complexQuery = {
        id: 'complex1',
        name: 'ComplexQuery',
        type: 'query' as const,
        source: `
          query ComplexQuery($id: ID!) {
            user(id: $id) {
              id
              name
              posts {
                id
                title
                comments {
                  id
                  text
                  author { name }
                }
              }
            }
          }
        `,
        file: 'complex.ts',
        line: 1,
        column: 1,
      };

      mockExtractor.extractQueries.mockResolvedValue([complexQuery]);

      const result = await tool.run();

      expect(result.success).toBe(true);
      expect(result.totalQueries).toBe(1);
    });

    it('should handle queries with fragments', async () => {
      const queryWithFragment = {
        id: 'fragment1',
        name: 'QueryWithFragment',
        type: 'query' as const,
        source: `
          query QueryWithFragment {
            user {
              ...UserFragment
            }
          }
          
          fragment UserFragment on User {
            id
            name
            email
          }
        `,
        file: 'fragment.ts',
        line: 1,
        column: 1,
      };

      mockExtractor.extractQueries.mockResolvedValue([queryWithFragment]);
      mockExtractor.extractFragments.mockResolvedValue([
        {
          name: 'UserFragment',
          type: 'User',
          source: 'fragment UserFragment on User { id name email }',
        },
      ]);

      const result = await tool.run();

      expect(result.success).toBe(true);
      expect(mockExtractor.extractFragments).toHaveBeenCalled();
    });

    it('should handle mutations and subscriptions', async () => {
      const operations = [
        {
          id: 'mutation1',
          name: 'CreateUser',
          type: 'mutation' as const,
          source:
            'mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id } }',
          file: 'mutations.ts',
          line: 1,
          column: 1,
        },
        {
          id: 'subscription1',
          name: 'UserUpdated',
          type: 'subscription' as const,
          source: 'subscription UserUpdated { userUpdated { id name } }',
          file: 'subscriptions.ts',
          line: 1,
          column: 1,
        },
      ];

      mockExtractor.extractQueries.mockResolvedValue(operations);

      const result = await tool.run();

      expect(result.success).toBe(true);
      expect(result.totalQueries).toBe(2);
    });
  });
});
