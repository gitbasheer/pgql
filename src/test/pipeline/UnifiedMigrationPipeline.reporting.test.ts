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
describe('UnifiedMigrationPipeline - Reporting', () => {
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
    (QueryTransformer as any).mockImplementation(
      () =>
        ({
          transform: vi.fn().mockReturnValue({
            original: 'query TestQuery { test }',
            transformed: 'query TestQuery { newTest }',
            ast: { kind: 'Document' },
            changes: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
            rules: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
          }),
        }) as any,
    );

    pipeline = new UnifiedMigrationPipeline(mockConfig, mockOptions);
  });

  describe('generatePRDescription()', () => {
    beforeEach(async () => {
      vi.resetModules();
      await pipeline.extract();
      await pipeline.transform();
    });

    it('should generate comprehensive PR description', async () => {
      const description = pipeline.generatePRDescription();

      expect(description).toContain('GraphQL Migration Summary');
      expect(description).toContain('**Operations Processed**: 1');
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
        queries: [{ id: 'q1', content: 'query { test }', filePath: 'test.ts' }],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {},
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
        requiresReview: false,
      });

      await pipeline.extract();
      await pipeline.transform();

      const summary = pipeline.getSummary();

      expect(summary).toEqual({
        totalOperations: 1,
        successfulTransformations: 1,
        filesModified: 1,
        averageConfidence: 85,
        risks: ['High complexity', 'Low test coverage'],
      });
    });

    it('should handle empty transformations', async () => {
      const summary = pipeline.getSummary();

      expect(summary).toEqual({
        totalOperations: 0,
        successfulTransformations: 0,
        filesModified: 0,
        averageConfidence: 0,
        risks: [],
      });
    });

    it('should deduplicate risks', async () => {
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

      mockConfidenceScorer.scoreTransformation.mockReturnValue({
        score: 85,
        category: 'automatic',
        risks: ['Same risk', 'Same risk'],
        requiresReview: false,
      });

      await pipeline.extract();
      await pipeline.transform();

      const summary = pipeline.getSummary();

      expect(summary.risks).toEqual(['Same risk']); // Deduplicated
    });
  });
});
