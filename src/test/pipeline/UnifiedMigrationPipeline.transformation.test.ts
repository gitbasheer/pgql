import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedMigrationPipeline } from '../../core/pipeline/UnifiedMigrationPipeline.js';
import { MigrationConfig } from '../../types/index.js';
import * as fs from 'fs/promises';
import { parse } from 'graphql';
// Mock modules
vi.mock('graphql', () => ({
  parse: vi.fn().mockReturnValue({ kind: 'Document' }),
}));
vi.mock('../../core/extraction/engine/UnifiedExtractor', () => ({
  UnifiedExtractor: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('../../core/validator/SchemaValidator', () => ({
  SchemaValidator: vi.fn(),
}));
vi.mock('../../core/analyzer/SchemaDeprecationAnalyzer', () => ({
  SchemaDeprecationAnalyzer: vi.fn(),
}));
vi.mock('../../core/analyzer/ConfidenceScorer', () => ({
  ConfidenceScorer: vi.fn(),
}));
vi.mock('../../core/safety/ProgressiveMigration', () => ({
  ProgressiveMigration: vi.fn(),
}));
vi.mock('../../core/safety/HealthCheck', () => ({
  HealthCheckSystem: vi.fn(),
}));
vi.mock('../../core/safety/Rollback', () => ({
  RollbackSystem: vi.fn(),
}));
vi.mock('../../core/applicator/ASTCodeApplicator', () => ({
  ASTCodeApplicator: vi.fn(),
}));
vi.mock('../../core/extraction/utils/SourceMapper', () => ({
  SourceMapper: vi.fn(),
}));
vi.mock('../../core/transformer/QueryTransformer', () => ({
  QueryTransformer: vi.fn(),
}));

// Mock modules

// Mock modules

// Mock all dependencies before any imports that might use them
vi.mock('fs/promises');
vi.mock('../../utils/logger');

// Mock all core modules before UnifiedMigrationPipeline is imported
describe('UnifiedMigrationPipeline - Transformation', () => {
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
    vi.resetModules();
    vi.clearAllMocks();

    mockConfig = {
      source: {
        include: ['./src'],
        exclude: [],
      },
      confidence: {
        automatic: 90,
        semiAutomatic: 70,
        manual: 0,
      },
      rollout: {
        initial: 1,
        increment: 10,
        interval: '1h',
        maxErrors: 5,
      },
      safety: {
        requireApproval: false,
        autoRollback: true,
        healthCheckInterval: 60,
      },
    };

    mockOptions = {
      minConfidence: 90,
      dryRun: false,
      interactive: false,
      enableSafety: true,
      rolloutPercentage: 1,
    };

    // Mock file system
    (vi.mocked(fs.readFile) as any).mockResolvedValue('schema content');
    (vi.mocked(fs.writeFile) as any).mockResolvedValue(undefined);

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
            fragments: [],
          },
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {},
      }),
    };

    mockValidator = {
      loadSchema: vi.fn().mockResolvedValue({ schema: 'mock' }),
      validateOperation: vi.fn().mockResolvedValue([]),
    };

    mockDeprecationAnalyzer = {
      analyzeOperation: vi.fn().mockResolvedValue([]),
    };

    mockConfidenceScorer = {
      scoreTransformation: vi.fn().mockReturnValue({
        score: 95,
        category: 'automatic',
        factors: {},
        risks: [],
        requiresReview: false,
      }),
    };

    mockProgressiveMigration = {
      createFeatureFlag: vi.fn(),
      startRollout: vi.fn().mockResolvedValue(undefined),
    };

    mockHealthCheck = {};

    mockRollbackSystem = {
      createRollbackPlan: vi.fn().mockResolvedValue({}),
    };

    mockApplicator = {
      applyTransformation: vi.fn().mockResolvedValue({
        code: 'modified code',
        linesAdded: 5,
        linesRemoved: 3,
      }),
    };

    mockSourceMapper = {
      register: vi.fn(),
      getMapping: vi.fn().mockReturnValue({ node: {}, start: 0, end: 10 }),
    };

    // Set up mocked implementations
    const extractorImport = await import('../../core/extraction/engine/UnifiedExtractor.js');
    const { UnifiedExtractor } = extractorImport;
    (UnifiedExtractor as any).mockImplementation(() => mockExtractor as any);

    const validatorImport = await import('../../core/validator/SchemaValidator.js');
    const { SchemaValidator } = validatorImport;
    (SchemaValidator as any).mockImplementation(() => mockValidator as any);

    const analyzerImport = await import('../../core/analyzer/SchemaDeprecationAnalyzer.js');
    const { SchemaDeprecationAnalyzer } = analyzerImport;
    (SchemaDeprecationAnalyzer as any).mockImplementation(() => mockDeprecationAnalyzer as any);

    const scorerImport = await import('../../core/analyzer/ConfidenceScorer.js');
    const { ConfidenceScorer } = scorerImport;
    (ConfidenceScorer as any).mockImplementation(() => mockConfidenceScorer as any);

    const migrationImport = await import('../../core/safety/ProgressiveMigration.js');
    const { ProgressiveMigration } = migrationImport;
    (ProgressiveMigration as any).mockImplementation(() => mockProgressiveMigration as any);

    const healthImport = await import('../../core/safety/HealthCheck.js');
    const { HealthCheckSystem } = healthImport;
    (HealthCheckSystem as any).mockImplementation(() => mockHealthCheck as any);

    const rollbackImport = await import('../../core/safety/Rollback.js');
    const { RollbackSystem } = rollbackImport;
    (RollbackSystem as any).mockImplementation(() => mockRollbackSystem as any);

    const applicatorImport = await import('../../core/applicator/ASTCodeApplicator.js');
    const { ASTCodeApplicator } = applicatorImport;
    (ASTCodeApplicator as any).mockImplementation(() => mockApplicator as any);

    const sourceMapperImport = await import('../../core/extraction/utils/SourceMapper.js');
    const { SourceMapper } = sourceMapperImport;
    (SourceMapper as any).mockImplementation(() => mockSourceMapper as any);

    // Create a proper mock for QueryTransformer
    const transformerImport = await import('../../core/transformer/QueryTransformer.js');
    const { QueryTransformer } = transformerImport;
    (QueryTransformer as any).mockImplementation(() => {
      return {
        transform: vi.fn().mockReturnValue({
          original: 'query { user { name } }',
          transformed: 'query { user { name } }', // Keep same to test edge case
          changes: [],
          warnings: [],
        }),
        getStats: vi.fn().mockReturnValue({ transformCount: 0 }),
      };
    });

    pipeline = new UnifiedMigrationPipeline(mockConfig, mockOptions);
  });

  describe('transform()', () => {
    beforeEach(async () => {
      vi.resetModules();
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
      const transformerImport = await import('../../core/transformer/QueryTransformer.js');
      const { QueryTransformer } = transformerImport;

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
              rules: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
            }),
          } as any;
        } else {
          return {
            transform: vi.fn().mockReturnValue({
              original: 'query Q2 { test }',
              transformed: 'query Q2 { newTest }',
              ast: { kind: 'Document' },
              changes: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
              rules: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
            }),
          } as any;
        }
      });

      mockConfidenceScorer.scoreTransformation
        .mockReturnValueOnce({ score: 95, category: 'automatic' })
        .mockReturnValueOnce({ score: 75, category: 'semi-automatic' });

      mockExtractor.extract.mockResolvedValue({
        queries: [
          { id: 'q1', content: 'query Q1 { test }', filePath: 'f1.ts' },
          { id: 'q2', content: 'query Q2 { test }', filePath: 'f2.ts' },
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {},
      });

      await pipeline.extract();
      const result = await pipeline.transform();

      expect(result.automatic).toBe(1);
      expect(result.semiAutomatic).toBe(1);
    });

    it('should skip unchanged operations', async () => {
      const transformerImport = await import('../../core/transformer/QueryTransformer.js');
      const { QueryTransformer } = transformerImport;
      (QueryTransformer as any).mockImplementation(
        () =>
          ({
            transform: vi.fn().mockReturnValue({
              original: 'query TestQuery { test }',
              transformed: 'query TestQuery { test }', // Same - no change
              ast: { kind: 'Document' },
              changes: [],
              rules: [],
            }),
          }) as any,
      );

      const result = await pipeline.transform();

      expect(result.transformed).toHaveLength(0);
      expect(mockConfidenceScorer.scoreTransformation).not.toHaveBeenCalled();
    });

    it('should handle transformation errors', async () => {
      const transformerImport = await import('../../core/transformer/QueryTransformer.js');
      const { QueryTransformer } = transformerImport;
      (QueryTransformer as any).mockImplementation(
        () =>
          ({
            transform: vi.fn().mockImplementation(() => {
              throw new Error('Transform error');
            }),
          }) as any,
      );

      const result = await pipeline.transform();

      expect(result.skipped).toBe(1);
      expect(result.transformed).toHaveLength(0);
    });

    it('should load deprecation rules', async () => {
      (vi.mocked(fs.readFile) as any).mockResolvedValueOnce(
        JSON.stringify({
          Query: [{ name: 'oldField', deprecationReason: 'Use `newField` instead' }],
        }),
      );

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

  describe('private methods - transformation', () => {
    it('should convert deprecations to rules correctly', async () => {
      (fs.readFile as any).mockImplementation((path: any) => {
        if (path === './deprecations.json') {
          return Promise.resolve(
            JSON.stringify({
              Query: [{ name: 'oldField', deprecationReason: 'Use `newField` instead' }],
              User: [{ name: 'email', deprecationReason: 'Use `emailAddress` instead' }],
            }),
          );
        }
        return Promise.resolve('schema content');
      });

      await pipeline.transform();

      const transformerImport = await import('../../core/transformer/QueryTransformer.js');
      const { QueryTransformer } = transformerImport;
      const constructorCall = (QueryTransformer as any).mock.calls[0];
      const rules = constructorCall[0];

      expect(rules).toContainEqual({
        type: 'field-rename',
        from: 'oldField',
        to: 'newField',
        parent: undefined,
      });
      expect(rules).toContainEqual({
        type: 'field-rename',
        from: 'email',
        to: 'emailAddress',
        parent: 'User',
      });
    });

    it('should detect transformation patterns', async () => {
      const transformerImport = await import('../../core/transformer/QueryTransformer.js');
      const { QueryTransformer } = transformerImport;
      (QueryTransformer as any).mockImplementation(
        () =>
          ({
            transform: vi.fn().mockReturnValue({
              original: 'query { test }',
              transformed: 'query { newTest }',
              ast: { kind: 'Document' },
              changes: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
              rules: [
                { type: 'field-rename', from: 'a', to: 'b' },
                { type: 'field-rename', from: 'c', to: 'd' },
              ],
            }),
          }) as any,
      );

      // Pattern detection is tested through transform method
      await pipeline.extract();
      await pipeline.transform();

      expect(mockConfidenceScorer.scoreTransformation).toHaveBeenCalledWith(
        expect.objectContaining({
          pattern: 'simple-field-rename',
        }),
      );
    });
  });
});
