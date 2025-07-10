import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedMigrationPipeline } from '../../../core/pipeline/UnifiedMigrationPipeline';
import { MigrationConfig } from '../../../types';
import * as fs from 'fs/promises';
import { parse } from 'graphql';
// Mock modules
vi.mock('graphql', () => ({
  parse: vi.fn().mockReturnValue({ kind: 'Document' })
}))

// Mock modules


// Mock modules



// Mock dependencies
vi.mock('../../../core/extraction/engine/UnifiedExtractor');
vi.mock('../../../core/validator/SchemaValidator');
vi.mock('../../../core/analyzer/SchemaDeprecationAnalyzer');
vi.mock('../../../core/analyzer/ConfidenceScorer');
vi.mock('../../../core/safety/ProgressiveMigration');
vi.mock('../../../core/safety/HealthCheck');
vi.mock('../../../core/safety/Rollback');
vi.mock('../../../core/applicator/ASTCodeApplicator');
vi.mock('../../../core/extraction/utils/SourceMapper');
vi.mock('../../../utils/logger');
vi.mock('fs/promises');
;

vi.mock('../../../core/transformer/QueryTransformer', () => {
  // Create a proper mock for QueryTransformer inside the mock call
  const createMockQueryTransformer = () => ({
    transform: vi.fn().mockReturnValue({
      original: 'query TestQuery { test }',
      transformed: 'query TestQuery { newTest }',
      ast: { kind: 'Document' },
      changes: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
      rules: [{ type: 'field-rename', from: 'test', to: 'newTest' }]
    })
  });

  return {
    QueryTransformer: vi.fn().mockImplementation(createMockQueryTransformer)
  };
});

describe('UnifiedMigrationPipeline', () => {
  let pipeline: any;
  let mockConfig: MigrationConfig;
  let mockOptions: any;
  let mockExtractor: any;
  let mockValidator: any;
  let mockDeprecationAnalyzer: any;
  let mockConfidenceScorer: any;
  let mockProgressiveMigration: any;
  let mockHealthCheck: any;
  let mockRollbackSystem: any;
  let mockApplicator: any;
  let mockSourceMapper: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockConfig = {
      source: {
        include: ['./src'],
        exclude: []
      },
      confidence: {
        automatic: 90,
        semiAutomatic: 70,
        manual: 0
      },
      rollout: {
        initial: 1,
        increment: 10,
        interval: '1h',
        maxErrors: 5
      },
      safety: {
        requireApproval: false,
        autoRollback: true,
        healthCheckInterval: 60
      }
    };

    mockOptions = {
      minConfidence: 90,
      dryRun: false,
      interactive: false,
      enableSafety: true,
      rolloutPercentage: 1
    };

    // Mock file system
    (fs.readFile as any).mockResolvedValue('schema content');
    (fs.writeFile as any).mockResolvedValue(undefined);

    // Setup mock implementations
    mockExtractor = {
      extract: vi.fn().mockResolvedValue({
        queries: [
          {
            id: 'q1',
            name: 'TestQuery',
            type: 'query',
            content: 'query TestQuery { test }',
            filePath: 'test.ts',
            sourceAST: { node: {}, start: 0, end: 10 },
            location: { line: 1, column: 1 },
            fragments: []
          }
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {}
      })
    };

    mockValidator = {
      loadSchema: vi.fn().mockResolvedValue({ schema: 'mock' }),
      validateOperation: vi.fn().mockReturnValue({
          isValid: true,
          errors: [],
          warnings: [],
          hasDeprecations: false
        }).mockResolvedValue([])
    };

    mockDeprecationAnalyzer = {
      analyzeOperation: vi.fn().mockResolvedValue([])
    };

    mockConfidenceScorer = {
      scoreTransformation: vi.fn().mockReturnValue({
        score: 95,
        category: 'automatic',
        factors: {},
        risks: [],
        requiresReview: false
      })
    };

    mockProgressiveMigration = {
      createFeatureFlag: vi.fn(),
      startRollout: vi.fn().mockResolvedValue(undefined)
    };

    mockHealthCheck = {};

    mockRollbackSystem = {
      createRollbackPlan: vi.fn().mockResolvedValue({})
    };

    mockApplicator = {
      applyTransformation: vi.fn().mockResolvedValue({
        code: 'modified code',
        linesAdded: 5,
        linesRemoved: 3
      })
    };

    mockSourceMapper = {
      register: vi.fn(),
      getMapping: vi.fn().mockReturnValue({ node: {}, start: 0, end: 10 })
    };

    // Mock the modules using vi.doMock
    vi.doMock('../../../core/extraction/engine/UnifiedExtractor', () => ({
      UnifiedExtractor: vi.fn(() => mockExtractor)
    }));

    vi.doMock('../../../core/validator/SchemaValidator', () => ({
      SchemaValidator: vi.fn(() => mockValidator)
    }));

    vi.doMock('../../../core/analyzer/SchemaDeprecationAnalyzer', () => ({
      SchemaDeprecationAnalyzer: vi.fn(() => mockDeprecationAnalyzer)
    }));

    vi.doMock('../../../core/analyzer/ConfidenceScorer', () => ({
      ConfidenceScorer: vi.fn(() => mockConfidenceScorer)
    }));

    vi.doMock('../../../core/safety/ProgressiveMigration', () => ({
      ProgressiveMigration: vi.fn(() => mockProgressiveMigration)
    }));

    vi.doMock('../../../core/safety/HealthCheck', () => ({
      HealthCheckSystem: vi.fn(() => mockHealthCheck)
    }));

    vi.doMock('../../../core/safety/Rollback', () => ({
      RollbackSystem: vi.fn(() => mockRollbackSystem)
    }));

    vi.doMock('../../../core/applicator/ASTCodeApplicator', () => ({
      ASTCodeApplicator: vi.fn(() => mockApplicator)
    }));

    vi.doMock('../../../core/extraction/utils/SourceMapper', () => ({
      SourceMapper: vi.fn(() => mockSourceMapper)
    }));

    pipeline = new UnifiedMigrationPipeline(mockConfig, mockOptions);
  });

  describe('extract()', () => {
    it('should extract operations and build source mapping', async () => {
      const result = await pipeline.extract();

      expect(mockExtractor.extract).toHaveBeenCalled();
      expect(mockSourceMapper.register).toHaveBeenCalledWith('q1', expect.any(Object));
      expect(result).toEqual({
        operations: expect.any(Array),
        files: ['test.ts'],
        summary: {
          queries: 1,
          mutations: 0,
          subscriptions: 0
        }
      });
    });

    it('should handle operations without sourceAST', async () => {
      mockExtractor.extract.mockResolvedValue({
        queries: [
          {
            id: 'q1',
            name: 'TestQuery',
            type: 'query',
            content: 'query TestQuery { test }',
            filePath: 'test.ts'
          }
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {}
      });

      await pipeline.extract();

      expect(mockSourceMapper.register).not.toHaveBeenCalled();
    });

    it('should correctly categorize operation types', async () => {
      mockExtractor.extract.mockResolvedValue({
        queries: [
          { id: 'q1', type: 'query', filePath: 'file1.ts' },
          { id: 'm1', type: 'mutation', filePath: 'file2.ts' },
          { id: 's1', type: 'subscription', filePath: 'file3.ts' }
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {}
      });

      const result = await pipeline.extract();

      expect(result.summary).toEqual({
        queries: 1,
        mutations: 1,
        subscriptions: 1
      });
    });
  });

  describe('validate()', () => {
    beforeEach(async () => {
      await pipeline.extract();
    });

    it('should validate all operations successfully', async () => {
      const result = await pipeline.validate();

      expect(mockValidator.loadSchema).toHaveBeenCalledWith('schema content');
      expect(mockValidator.validateOperation).toHaveBeenCalled();
      expect(result).toEqual({
        hasErrors: false,
        errors: [],
        warnings: []
      });
    });

    it('should handle validation errors', async () => {
      mockValidator.validateOperation.mockResolvedValue([
        { message: 'Invalid field' }
      ]);

      const result = await pipeline.validate();

      expect(result.hasErrors).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        operation: 'TestQuery',
        message: 'Invalid field',
        severity: 'error'
      });
    });

    it('should handle deprecation warnings', async () => {
      mockDeprecationAnalyzer.analyzeOperation.mockResolvedValue([
        { field: 'oldField', reason: 'Use newField instead' }
      ]);

      const result = await pipeline.validate();

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toEqual({
        operation: 'TestQuery',
        message: 'Using deprecated field: oldField - Use newField instead'
      });
    });

    it('should handle parse errors', async () => {
      (parse as any).mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = await pipeline.validate();

      expect(result.hasErrors).toBe(true);
      expect(result.errors[0].message).toContain('Failed to parse operation');
    });

    it('should use custom schema path from config', async () => {
      (mockConfig as any).schemaPath = './custom-schema.graphql';

      await pipeline.validate();

      expect(fs.readFile).toHaveBeenCalledWith('./custom-schema.graphql', 'utf-8');
    });
  });

  describe('transform()', () => {
    beforeEach(async () => {
      await pipeline.extract();
    });

    it('should transform operations with high confidence', async () => {
      const result = await pipeline.transform();

      expect(result.transformed).toHaveLength(1);
      expect(result.automatic).toBe(1);
      expect(result.semiAutomatic).toBe(0);
      expect(result.manual).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should categorize transformations by confidence', async () => {
      const imported = await import('../../../core/transformer/QueryTransformer');
    const { QueryTransformer } = imported;

      // Create two different mock transformers for the two queries
      let callCount = 0;
      (QueryTransformer as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            transform: vi.fn().mockReturnValue({
              original: 'query Q1 { test }',
              transformed: 'query Q1 { newTest }',
              ast: { kind: 'Document' },
              changes: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
              rules: [{ type: 'field-rename', from: 'test', to: 'newTest' }]
            })
          };
        } else {
          return {
            transform: vi.fn().mockReturnValue({
              original: 'query Q2 { test }',
              transformed: 'query Q2 { newTest }',
              ast: { kind: 'Document' },
              changes: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
              rules: [{ type: 'field-rename', from: 'test', to: 'newTest' }]
            })
          };
        }
      });

      mockConfidenceScorer.scoreTransformation
        .mockReturnValueOnce({ score: 95, category: 'automatic' })
        .mockReturnValueOnce({ score: 75, category: 'semi-automatic' });

      mockExtractor.extract.mockResolvedValue({
        queries: [
          { id: 'q1', content: 'query Q1 { test }', filePath: 'f1.ts' },
          { id: 'q2', content: 'query Q2 { test }', filePath: 'f2.ts' }
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {}
      });

      await pipeline.extract();
      const result = await pipeline.transform();

      expect(result.automatic).toBe(1);
      expect(result.semiAutomatic).toBe(1);
    });

    it('should skip unchanged operations', async () => {
      const imported = await import('../../../core/transformer/QueryTransformer');
    const { QueryTransformer } = imported;
      (QueryTransformer as any).mockImplementation(() => ({
        transform: vi.fn().mockReturnValue({
          original: 'query TestQuery { test }',
          transformed: 'query TestQuery { test }', // Same - no change
          ast: { kind: 'Document' },
          changes: [],
          rules: []
        })
      }));

      const result = await pipeline.transform();

      expect(result.transformed).toHaveLength(0);
      expect(mockConfidenceScorer.scoreTransformation).not.toHaveBeenCalled();
    });

    it('should handle transformation errors', async () => {
      const imported = await import('../../../core/transformer/QueryTransformer');
    const { QueryTransformer } = imported;
      (QueryTransformer as any).mockImplementation(() => ({
        transform: vi.fn().mockImplementation(() => {
          throw new Error('Transform error');
        })
      }));

      const result = await pipeline.transform();

      expect(result.skipped).toBe(1);
      expect(result.transformed).toHaveLength(0);
    });

    it('should load deprecation rules', async () => {
      (fs.readFile as any).mockResolvedValueOnce(JSON.stringify({
        Query: [
          { name: 'oldField', deprecationReason: 'Use `newField` instead' }
        ]
      }));

      await pipeline.transform();

      expect(fs.readFile).toHaveBeenCalledWith('./deprecations.json', 'utf-8');
    });

    it('should handle missing deprecation file', async () => {
      (fs.readFile as any).mockRejectedValueOnce(new Error('File not found'));

      const result = await pipeline.transform();

      // Should continue without deprecation rules
      expect(result).toBeDefined();
    });
  });

  describe('apply()', () => {
    beforeEach(async () => {
      await pipeline.extract();
      await pipeline.transform();
    });

    it('should apply transformations to files', async () => {
      const result = await pipeline.apply();

      expect(mockApplicator.applyTransformation).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith('test.ts', 'modified code', 'utf-8');
      expect(result).toEqual({
        modifiedFiles: ['test.ts'],
        operationsUpdated: 1,
        linesAdded: 5,
        linesRemoved: 3
      });
    });

    it('should skip application in dry-run mode', async () => {
      pipeline = new UnifiedMigrationPipeline(mockConfig, { ...mockOptions, dryRun: true });
      await pipeline.extract();
      await pipeline.transform();

      const result = await pipeline.apply();

      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(result.modifiedFiles).toHaveLength(1); // Still tracks what would be modified
    });

    it('should skip low confidence transformations', async () => {
      mockConfidenceScorer.scoreTransformation.mockReturnValue({
        score: 50, // Below minConfidence
        category: 'manual'
      });

      await pipeline.extract();
      await pipeline.transform();
      const result = await pipeline.apply();

      expect(mockApplicator.applyTransformation).not.toHaveBeenCalled();
      expect(result.operationsUpdated).toBe(0);
    });

    it('should handle multiple transformations per file', async () => {
      mockExtractor.extract.mockResolvedValue({
        queries: [
          { id: 'q1', content: 'query Q1 { test }', filePath: 'same.ts', sourceAST: { start: 0 } },
          { id: 'q2', content: 'query Q2 { test }', filePath: 'same.ts', sourceAST: { start: 100 } }
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {}
      });

      await pipeline.extract();
      await pipeline.transform();
      const result = await pipeline.apply();

      expect(result.operationsUpdated).toBe(2);
      expect(result.modifiedFiles).toHaveLength(1);
    });

    it('should handle application errors gracefully', async () => {
      mockApplicator.applyTransformation.mockRejectedValue(new Error('Apply error'));

      const result = await pipeline.apply();

      // Should continue despite error
      expect(result.modifiedFiles).toHaveLength(0);
      expect(result.operationsUpdated).toBe(0);
    });
  });

  describe('setupProgressiveRollout()', () => {
    beforeEach(async () => {
      await pipeline.extract();
      await pipeline.transform();
    });

    it('should setup progressive rollout for transformed operations', async () => {
      const result = await pipeline.setupProgressiveRollout();

      expect(mockRollbackSystem.createRollbackPlan).toHaveBeenCalled();
      expect(mockProgressiveMigration.createFeatureFlag).toHaveBeenCalled();
      expect(mockProgressiveMigration.startRollout).toHaveBeenCalledWith('q1', 1);
      expect(result.operations).toEqual(['q1']);
    });

    it('should skip rollout when safety is disabled', async () => {
      pipeline = new UnifiedMigrationPipeline(mockConfig, { ...mockOptions, enableSafety: false });

      const result = await pipeline.setupProgressiveRollout();

      expect(mockProgressiveMigration.createFeatureFlag).not.toHaveBeenCalled();
      expect(result.operations).toEqual([]);
    });

    it('should use custom rollout percentage', async () => {
      pipeline = new UnifiedMigrationPipeline(mockConfig, { ...mockOptions, rolloutPercentage: 10 });
      await pipeline.extract();
      await pipeline.transform();

      await pipeline.setupProgressiveRollout();

      expect(mockProgressiveMigration.startRollout).toHaveBeenCalledWith('q1', 10);
    });
  });

  describe('generatePRDescription()', () => {
    beforeEach(async () => {
      await pipeline.extract();
      await pipeline.transform();
    });

    it('should generate comprehensive PR description', async () => {
      const description = pipeline.generatePRDescription();

      expect(description).toContain('GraphQL Migration Summary');
      expect(description).toContain('Operations Processed: 1');
      expect(description).toContain('Successful Transformations: 1');
      expect(description).toContain('Average Confidence: 95.0%');
      expect(description).toContain('Progressive rollout enabled at 1%');
    });

    it('should include transformation details', async () => {
      const description = pipeline.generatePRDescription();

      expect(description).toContain('TestQuery');
      expect(description).toContain('field-rename: `test` → `newTest`');
    });

    it('should handle operations without names', async () => {
      mockExtractor.extract.mockResolvedValue({
        queries: [
          { id: 'q1', content: 'query { test }', filePath: 'test.ts' }
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {}
      });

      await pipeline.extract();
      await pipeline.transform();

      const description = pipeline.generatePRDescription();

      expect(description).toContain('q1'); // Uses ID when name is missing
    });
  });

  describe('getSummary()', () => {
    it('should return accurate summary with risks', async () => {
      mockConfidenceScorer.scoreTransformation.mockReturnValue({
        score: 85,
        category: 'automatic',
        risks: ['High complexity', 'Low test coverage'],
        requiresReview: false
      });

      await pipeline.extract();
      await pipeline.transform();

      const summary = pipeline.getSummary();

      expect(summary).toEqual({
        totalOperations: 1,
        successfulTransformations: 1,
        filesModified: 1,
        averageConfidence: 85,
        risks: ['High complexity', 'Low test coverage']
      });
    });

    it('should handle empty transformations', async () => {
      const summary = pipeline.getSummary();

      expect(summary).toEqual({
        totalOperations: 0,
        successfulTransformations: 0,
        filesModified: 0,
        averageConfidence: 0,
        risks: []
      });
    });

    it('should deduplicate risks', async () => {
      mockExtractor.extract.mockResolvedValue({
        queries: [
          { id: 'q1', content: 'query Q1 { test }', filePath: 'f1.ts' },
          { id: 'q2', content: 'query Q2 { test }', filePath: 'f2.ts' }
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {}
      });

      mockConfidenceScorer.scoreTransformation.mockReturnValue({
        score: 85,
        category: 'automatic',
        risks: ['Same risk', 'Same risk'],
        requiresReview: false
      });

      await pipeline.extract();
      await pipeline.transform();

      const summary = pipeline.getSummary();

      expect(summary.risks).toEqual(['Same risk']); // Deduplicated
    });
  });

  describe('private methods', () => {
    it('should convert deprecations to rules correctly', async () => {
      (fs.readFile as any).mockImplementation((path: string) => {
        if (path === './deprecations.json') {
          return JSON.stringify({
            Query: [
              { name: 'oldField', deprecationReason: 'Use `newField` instead' }
            ],
            User: [
              { name: 'email', deprecationReason: 'Use `emailAddress` instead' }
            ]
          });
        }
        return 'schema content';
      });

      await pipeline.transform();

      const { QueryTransformer } = require('../../../core/transformer/QueryTransformer');
      const constructorCall = QueryTransformer.mock.calls[0];
      const rules = constructorCall[0];

      expect(rules).toContainEqual({
        type: 'field-rename',
        from: 'oldField',
        to: 'newField',
        parent: undefined
      });
      expect(rules).toContainEqual({
        type: 'field-rename',
        from: 'email',
        to: 'emailAddress',
        parent: 'User'
      });
    });

    it('should detect transformation patterns', async () => {
      const imported = await import('../../../core/transformer/QueryTransformer');
    const { QueryTransformer } = imported;
      (QueryTransformer as any).mockImplementation(() => ({
        transform: vi.fn().mockReturnValue({
          original: 'query { test }',
          transformed: 'query { newTest }',
          ast: { kind: 'Document' },
          changes: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
          rules: [
            { type: 'field-rename', from: 'a', to: 'b' },
            { type: 'field-rename', from: 'c', to: 'd' }
          ]
        })
      }));

      // Pattern detection is tested through transform method
      await pipeline.extract();
      await pipeline.transform();

      expect(mockConfidenceScorer.scoreTransformation).toHaveBeenCalledWith(
        expect.objectContaining({
          pattern: 'simple-field-rename'
        })
      );
    });
  });
});
