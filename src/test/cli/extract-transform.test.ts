import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { UnifiedExtractor } from '../../core/extraction/index';
import { OptimizedSchemaTransformer } from '../../core/transformer/OptimizedSchemaTransformer';
import { SchemaDeprecationAnalyzer } from '../../core/analyzer/SchemaDeprecationAnalyzer';
import { SchemaValidator } from '../../core/validator/SchemaValidator';
import { ASTCodeApplicator } from '../../core/applicator/index';
import { logger } from '../../utils/logger';

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../core/extraction/index');
vi.mock('../../core/transformer/OptimizedSchemaTransformer');
vi.mock('../../core/analyzer/SchemaDeprecationAnalyzer');
vi.mock('../../core/validator/SchemaValidator');
vi.mock('../../core/applicator/index');
vi.mock('fs/promises');
vi.mock('../../utils/formatter', () => ({
  formatGraphQL: vi.fn((content) => Promise.resolve(content)),
}));

// Helper to run CLI commands
function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [path.join(__dirname, '../../cli/extract-transform.ts'), ...args]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });
  });
}

describe('extract-transform CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extract command', () => {
    const mockExtractResult = {
      queries: [
        {
          id: '1',
          filePath: '/src/queries.ts',
          name: 'GetUser',
          type: 'query',
          location: { line: 10, column: 5 },
          content: 'query GetUser { user { id name } }',
          resolvedContent: 'query GetUser { user { id name } }',
          hash: 'hash1',
          originalName: 'GetUser',
          sourceAST: { type: 'TaggedTemplateExpression' },
        },
        {
          id: '2',
          filePath: '/src/mutations.ts',
          name: 'CreateUser',
          type: 'mutation',
          location: { line: 20, column: 5 },
          content: 'mutation CreateUser { createUser { id } }',
          resolvedContent: 'mutation CreateUser { createUser { id } }',
          hash: 'hash2',
        },
      ],
      fragments: [],
      variants: [],
      errors: [],
      stats: {
        totalFiles: 2,
        totalQueries: 2,
        totalFragments: 0,
        totalVariants: 0,
        extractionTime: 100,
      },
    };

    beforeEach(() => {
      const mockExtractor = {
        extract: vi.fn().mockResolvedValue(mockExtractResult),
      };
      vi.mocked(UnifiedExtractor).mockImplementation(() => mockExtractor as any);
    });

    it('should extract queries from directory', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      const { code, stdout } = await runCLI(['extract', './src', '-o', 'queries.json']);

      expect(code).toBe(0);
      expect(stdout).toContain('Found 2 GraphQL operations');
      expect(stdout).toContain('query: 1');
      expect(stdout).toContain('mutation: 1');
      
      expect(UnifiedExtractor).toHaveBeenCalledWith({
        directory: './src',
        patterns: ['**/*.{js,jsx,ts,tsx}'],
        detectVariants: false,
        generateVariants: false,
        resolveFragments: true,
        normalizeNames: true,
        preserveSourceAST: true,
        reporters: [],
      });
    });

    it('should handle custom patterns', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      await runCLI(['extract', './src', '-p', '**/*.graphql', '**/*.gql']);

      expect(UnifiedExtractor).toHaveBeenCalledWith(
        expect.objectContaining({
          patterns: ['**/*.graphql', '**/*.gql'],
        })
      );
    });

    it('should extract dynamic variants when requested', async () => {
      const mockVariantResult = {
        ...mockExtractResult,
        variants: [
          { id: 'v1', queryId: '1', conditions: { includeEmail: true } },
          { id: 'v2', queryId: '1', conditions: { includeEmail: false } },
        ],
      };

      const mockExtractor = {
        extract: vi.fn().mockResolvedValue(mockVariantResult),
      };
      vi.mocked(UnifiedExtractor).mockImplementation(() => mockExtractor as any);
      vi.mocked(fs.writeFile).mockResolvedValue();

      const { code, stdout } = await runCLI(['extract', './src', '--dynamic']);

      expect(code).toBe(0);
      expect(stdout).toContain('Dynamic variants: 2');
      
      expect(UnifiedExtractor).toHaveBeenCalledWith(
        expect.objectContaining({
          detectVariants: true,
          generateVariants: true,
        })
      );
    });

    it('should skip fragment resolution when requested', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      await runCLI(['extract', './src', '--no-fragments']);

      expect(UnifiedExtractor).toHaveBeenCalledWith(
        expect.objectContaining({
          resolveFragments: false,
        })
      );
    });

    it('should save formatted output', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      await runCLI(['extract', './src', '-o', 'output.json']);

      expect(fs.writeFile).toHaveBeenCalledWith(
        'output.json',
        expect.stringContaining('"timestamp"')
      );
      
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const output = JSON.parse(writeCall[1] as string);
      
      expect(output).toMatchObject({
        directory: './src',
        totalQueries: 2,
        queries: expect.arrayContaining([
          expect.objectContaining({
            id: '1',
            name: 'GetUser',
            type: 'query',
          }),
        ]),
      });
    });

    it('should handle extraction errors', async () => {
      const mockExtractor = {
        extract: vi.fn().mockRejectedValue(new Error('Extraction failed')),
      };
      vi.mocked(UnifiedExtractor).mockImplementation(() => mockExtractor as any);

      const { code } = await runCLI(['extract', './src']);

      expect(code).toBe(1);
      expect(logger.error).toHaveBeenCalledWith('Error:', expect.any(Error));
    });
  });

  describe('transform command', () => {
    const mockInputData = {
      queries: [
        {
          id: '1',
          file: '/src/queries.ts',
          name: 'GetUser',
          content: 'query GetUser { user { id deprecatedField } }',
        },
      ],
    };

    const mockDeprecationRules = [
      {
        type: 'field',
        typeName: 'User',
        fieldName: 'deprecatedField',
        reason: 'Use newField instead',
        replacementField: 'newField',
      },
    ];

    beforeEach(() => {
      vi.mocked(fs.readFile).mockImplementation((filePath) => {
        if (filePath === './extracted-queries.json') {
          return Promise.resolve(JSON.stringify(mockInputData));
        }
        if (filePath === './schema.graphql') {
          return Promise.resolve('type User { id: ID! deprecatedField: String @deprecated(reason: "Use newField") newField: String }');
        }
        return Promise.reject(new Error('File not found'));
      });

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue();
    });

    it('should transform queries using schema deprecations', async () => {
      const mockAnalyzer = {
        analyzeSchemaFile: vi.fn().mockResolvedValue(mockDeprecationRules),
        getSummary: vi.fn().mockReturnValue({
          total: 1,
          replaceable: 1,
          vague: 0,
        }),
      };
      vi.mocked(SchemaDeprecationAnalyzer).mockImplementation(() => mockAnalyzer as any);

      const mockTransformer = {
        transform: vi.fn().mockResolvedValue({
          original: 'query GetUser { user { id deprecatedField } }',
          transformed: 'query GetUser { user { id newField } }',
          changes: [
            {
              type: 'field-replacement',
              from: 'deprecatedField',
              to: 'newField',
              reason: 'Field deprecated: Use newField instead',
            },
          ],
          warnings: [],
        }),
      };
      vi.mocked(OptimizedSchemaTransformer).mockImplementation(() => mockTransformer as any);

      const { code, stdout } = await runCLI(['transform', '-s', './schema.graphql']);

      expect(code).toBe(0);
      expect(stdout).toContain('Found 1 deprecations');
      expect(stdout).toContain('Transformed 1 queries');
      
      expect(mockTransformer.transform).toHaveBeenCalledWith(mockInputData.queries[0].content);
    });

    it('should validate queries when requested', async () => {
      const mockValidator = {
        validateQueries: vi.fn().mockResolvedValue(new Map([
          ['1', { valid: true, errors: [], warnings: [] }],
        ])),
        generateValidationReport: vi.fn().mockReturnValue({
          total: 1,
          valid: 1,
          invalid: 0,
          warnings: 0,
          summary: [],
        }),
      };
      vi.mocked(SchemaValidator).mockImplementation(() => mockValidator as any);

      const mockAnalyzer = {
        analyzeSchemaFile: vi.fn().mockResolvedValue(mockDeprecationRules),
        getSummary: vi.fn().mockReturnValue({ total: 1, replaceable: 1, vague: 0 }),
      };
      vi.mocked(SchemaDeprecationAnalyzer).mockImplementation(() => mockAnalyzer as any);

      const mockTransformer = {
        transform: vi.fn().mockResolvedValue({
          original: 'query GetUser { user { id } }',
          transformed: 'query GetUser { user { id } }',
          changes: [],
          warnings: [],
        }),
      };
      vi.mocked(OptimizedSchemaTransformer).mockImplementation(() => mockTransformer as any);

      const { code, stdout } = await runCLI(['transform', '-s', './schema.graphql', '--validate']);

      expect(code).toBe(0);
      expect(stdout).toContain('Validation Results:');
      expect(stdout).toContain('Valid: 1');
    });

    it('should skip invalid queries when requested', async () => {
      const mockValidator = {
        validateQueries: vi.fn().mockResolvedValue(new Map([
          ['1', { 
            valid: false, 
            errors: [{ message: 'Field does not exist' }], 
            warnings: [] 
          }],
        ])),
        generateValidationReport: vi.fn().mockReturnValue({
          total: 1,
          valid: 0,
          invalid: 1,
          warnings: 0,
          summary: [{
            id: '1',
            valid: false,
            errorCount: 1,
            errors: [{ message: 'Field does not exist' }],
          }],
        }),
      };
      vi.mocked(SchemaValidator).mockImplementation(() => mockValidator as any);

      const mockAnalyzer = {
        analyzeSchemaFile: vi.fn().mockResolvedValue(mockDeprecationRules),
        getSummary: vi.fn().mockReturnValue({ total: 1, replaceable: 1, vague: 0 }),
      };
      vi.mocked(SchemaDeprecationAnalyzer).mockImplementation(() => mockAnalyzer as any);

      vi.mocked(OptimizedSchemaTransformer).mockImplementation(() => ({} as any));

      const { code, stdout } = await runCLI(['transform', '-s', './schema.graphql', '--validate', '--skip-invalid']);

      expect(code).toBe(0);
      expect(stdout).toContain('Invalid queries found:');
      expect(stdout).toContain('Skipping invalid queries...');
    });

    it('should handle dry run mode', async () => {
      const mockAnalyzer = {
        analyzeSchemaFile: vi.fn().mockResolvedValue(mockDeprecationRules),
        getSummary: vi.fn().mockReturnValue({ total: 1, replaceable: 1, vague: 0 }),
      };
      vi.mocked(SchemaDeprecationAnalyzer).mockImplementation(() => mockAnalyzer as any);

      const mockTransformer = {
        transform: vi.fn().mockResolvedValue({
          original: 'query GetUser { user { id deprecatedField } }',
          transformed: 'query GetUser { user { id newField } }',
          changes: [],
          warnings: [],
        }),
      };
      vi.mocked(OptimizedSchemaTransformer).mockImplementation(() => mockTransformer as any);

      const { code, stdout } = await runCLI(['transform', '-s', './schema.graphql', '--dry-run']);

      expect(code).toBe(0);
      expect(stdout).toContain('Dry run mode - showing changes:');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('apply command', () => {
    const mockTransformedQueries = [
      {
        id: '1',
        file: '/src/queries.ts',
        content: 'query GetUser { user { id oldField } }',
        transformed: 'query GetUser { user { id newField } }',
        sourceAST: { type: 'TaggedTemplateExpression' },
        changes: [],
      },
    ];

    beforeEach(() => {
      vi.mocked(fs.readFile).mockImplementation((filePath) => {
        if (filePath === './transformed/transformed-queries.json') {
          return Promise.resolve(JSON.stringify(mockTransformedQueries));
        }
        if (filePath === '/src/queries.ts') {
          return Promise.resolve('const query = gql`query GetUser { user { id oldField } }`;');
        }
        return Promise.reject(new Error('File not found'));
      });

      const mockApplicator = {
        applyTransformations: vi.fn().mockResolvedValue({
          success: true,
          newContent: 'const query = gql`query GetUser { user { id newField } }`;',
          changes: [{
            reason: 'Updated deprecated field',
            originalText: 'oldField',
            newText: 'newField',
          }],
        }),
      };
      vi.mocked(ASTCodeApplicator).mockImplementation(() => mockApplicator as any);
    });

    it('should apply transformations to source files', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      const { code, stdout } = await runCLI(['apply', '-i', './transformed/transformed-queries.json']);

      expect(code).toBe(0);
      expect(stdout).toContain('Updated 1 files');
      
      expect(ASTCodeApplicator).toHaveBeenCalledWith({
        preserveFormatting: true,
        preserveComments: true,
        validateChanges: true,
        dryRun: false,
      });
    });

    it('should create backups when requested', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      const { code, stdout } = await runCLI(['apply', '-i', './transformed/transformed-queries.json', '--backup']);

      expect(code).toBe(0);
      expect(fs.writeFile).toHaveBeenCalledWith('/src/queries.ts.backup', expect.any(String));
      expect(stdout).toContain('Backups created with .backup extension');
    });

    it('should handle dry run mode', async () => {
      const { code, stdout } = await runCLI(['apply', '-i', './transformed/transformed-queries.json', '--dry-run']);

      expect(code).toBe(0);
      expect(stdout).toContain('Changes for /src/queries.ts:');
      expect(stdout).toContain('Updated deprecated field');
      expect(stdout).toContain('Dry run completed - no files were modified');
      
      expect(fs.writeFile).not.toHaveBeenCalledWith('/src/queries.ts', expect.any(String));
    });

    it('should re-extract missing source AST', async () => {
      const queriesWithoutAST = [{
        ...mockTransformedQueries[0],
        sourceAST: undefined,
      }];

      vi.mocked(fs.readFile).mockImplementation((filePath) => {
        if (filePath === './transformed/transformed-queries.json') {
          return Promise.resolve(JSON.stringify(queriesWithoutAST));
        }
        return Promise.reject(new Error('File not found'));
      });

      const mockExtractor = {
        extract: vi.fn().mockResolvedValue({
          queries: [{
            content: queriesWithoutAST[0].content,
            sourceAST: { type: 'TaggedTemplateExpression' },
          }],
        }),
      };
      vi.mocked(UnifiedExtractor).mockImplementation(() => mockExtractor as any);

      const { code } = await runCLI(['apply', '-i', './transformed/transformed-queries.json']);

      expect(code).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('missing source AST'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully re-extracted'));
    });
  });

  describe('validate command', () => {
    const mockQueries = {
      queries: [
        { id: '1', content: 'query GetUser { user { id } }' },
        { id: '2', content: 'query GetPosts { posts { title } }' },
      ],
    };

    beforeEach(() => {
      vi.mocked(fs.readFile).mockImplementation((filePath) => {
        if (filePath === './extracted-queries.json') {
          return Promise.resolve(JSON.stringify(mockQueries));
        }
        return Promise.reject(new Error('File not found'));
      });

      vi.mocked(fs.writeFile).mockResolvedValue();
    });

    it('should validate queries against schema', async () => {
      const mockValidator = {
        validateQueries: vi.fn().mockResolvedValue(new Map([
          ['1', { valid: true, errors: [], warnings: [] }],
          ['2', { valid: true, errors: [], warnings: [] }],
        ])),
        generateValidationReport: vi.fn().mockReturnValue({
          total: 2,
          valid: 2,
          invalid: 0,
          warnings: 0,
          summary: [],
        }),
      };
      vi.mocked(SchemaValidator).mockImplementation(() => mockValidator as any);

      const { code, stdout } = await runCLI(['validate', './schema.graphql']);

      expect(code).toBe(0);
      expect(stdout).toContain('Validated 2 queries');
      expect(stdout).toContain('Valid: 2');
      expect(stdout).toContain('Invalid: 0');
    });

    it('should show validation errors', async () => {
      const mockValidator = {
        validateQueries: vi.fn().mockResolvedValue(new Map([
          ['1', { 
            valid: false, 
            errors: [{
              message: 'Field "unknown" not found',
              locations: [{ line: 1, column: 15 }],
              suggestion: 'Did you mean "id"?',
            }],
            warnings: [],
          }],
          ['2', { valid: true, errors: [], warnings: [] }],
        ])),
        generateValidationReport: vi.fn().mockReturnValue({
          total: 2,
          valid: 1,
          invalid: 1,
          warnings: 0,
          summary: [{
            id: '1',
            valid: false,
            errorCount: 1,
            errors: [{
              message: 'Field "unknown" not found',
              locations: [{ line: 1, column: 15 }],
              suggestion: 'Did you mean "id"?',
            }],
          }],
        }),
      };
      vi.mocked(SchemaValidator).mockImplementation(() => mockValidator as any);

      const { code, stdout } = await runCLI(['validate', './schema.graphql']);

      expect(code).toBe(1);
      expect(stdout).toContain('Invalid Queries:');
      expect(stdout).toContain('Field "unknown" not found');
      expect(stdout).toContain('Did you mean "id"?');
      expect(stdout).toContain('at line 1, column 15');
    });

    it('should validate transformed queries when requested', async () => {
      const transformedData = [
        { id: '1', transformed: 'query GetUser { user { id name } }' },
      ];

      vi.mocked(fs.readFile).mockImplementation((filePath) => {
        if (filePath === './transformed.json') {
          return Promise.resolve(JSON.stringify(transformedData));
        }
        return Promise.reject(new Error('File not found'));
      });

      const mockValidator = {
        validateQueries: vi.fn().mockResolvedValue(new Map()),
        generateValidationReport: vi.fn().mockReturnValue({
          total: 1,
          valid: 1,
          invalid: 0,
          warnings: 0,
          summary: [],
        }),
      };
      vi.mocked(SchemaValidator).mockImplementation(() => mockValidator as any);

      await runCLI(['validate', './schema.graphql', '-i', './transformed.json', '--transformed']);

      expect(mockValidator.validateQueries).toHaveBeenCalledWith(
        [{ id: '1', content: 'query GetUser { user { id name } }' }],
        './schema.graphql'
      );
    });

    it('should save validation report', async () => {
      const mockValidator = {
        validateQueries: vi.fn().mockResolvedValue(new Map()),
        generateValidationReport: vi.fn().mockReturnValue({
          total: 2,
          valid: 2,
          invalid: 0,
          warnings: 0,
          summary: [],
        }),
      };
      vi.mocked(SchemaValidator).mockImplementation(() => mockValidator as any);

      await runCLI(['validate', './schema.graphql']);

      expect(fs.writeFile).toHaveBeenCalledWith(
        './extracted-queries-validation.json',
        expect.stringContaining('"total": 2')
      );
    });
  });
});