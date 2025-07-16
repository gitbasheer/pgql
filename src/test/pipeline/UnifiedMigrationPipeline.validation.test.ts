import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedMigrationPipeline } from '../../core/pipeline/UnifiedMigrationPipeline.js';
import { MigrationConfig } from '../../types/index.js';
import * as fs from 'fs/promises';
import { parse } from 'graphql';
// Mock modules
vi.mock('graphql', () => ({
  parse: vi.fn(),
}));
vi.mock('../../core/extraction/engine/UnifiedExtractor', () => ({
  UnifiedExtractor: vi.fn(() => {
    mockExtractor = createMockExtractor();
    return mockExtractor;
  }),
}));
vi.mock('../../core/validator/SchemaValidator', () => ({
  SchemaValidator: vi.fn(() => {
    mockValidator = createMockValidator();
    return mockValidator;
  }),
}));
vi.mock('../../core/analyzer/SchemaDeprecationAnalyzer', () => ({
  SchemaDeprecationAnalyzer: vi.fn(() => {
    mockDeprecationAnalyzer = createMockDeprecationAnalyzer();
    return mockDeprecationAnalyzer;
  }),
}));
vi.mock('../../core/analyzer/ConfidenceScorer', () => ({
  ConfidenceScorer: vi.fn(() => {
    mockConfidenceScorer = createMockConfidenceScorer();
    return mockConfidenceScorer;
  }),
}));
vi.mock('../../core/safety/ProgressiveMigration', () => ({
  ProgressiveMigration: vi.fn(() => {
    mockProgressiveMigration = createMockProgressiveMigration();
    return mockProgressiveMigration;
  }),
}));
vi.mock('../../core/safety/HealthCheck', () => ({
  HealthCheckSystem: vi.fn(() => {
    mockHealthCheck = createMockHealthCheck();
    return mockHealthCheck;
  }),
}));
vi.mock('../../core/safety/Rollback', () => ({
  RollbackSystem: vi.fn(() => {
    mockRollbackSystem = createMockRollbackSystem();
    return mockRollbackSystem;
  }),
}));
vi.mock('../../core/applicator/ASTCodeApplicator', () => ({
  ASTCodeApplicator: vi.fn(() => {
    mockApplicator = createMockApplicator();
    return mockApplicator;
  }),
}));
vi.mock('../../core/extraction/utils/SourceMapper', () => ({
  SourceMapper: vi.fn(() => {
    mockSourceMapper = createMockSourceMapper();
    return mockSourceMapper;
  }),
}));
vi.mock('../../core/transformer/QueryTransformer', () => ({
  QueryTransformer: vi.fn(() => ({
    transform: vi.fn().mockReturnValue({
      original: 'query TestQuery { test }',
      transformed: 'query TestQuery { newTest }',
      ast: { kind: 'Document' },
      changes: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
      rules: [{ type: 'field-rename', from: 'test', to: 'newTest' }],
    }),
  })),
}));

// Mock modules

// Create factory functions for mock instances
const createMockExtractor = () => ({
  extract: vi.fn(),
});
const createMockValidator = () => ({
  loadSchema: vi.fn(),
  validateOperation: vi.fn(),
});
const createMockDeprecationAnalyzer = () => ({
  analyzeOperation: vi.fn(),
});
const createMockConfidenceScorer = () => ({
  scoreTransformation: vi.fn(),
});
const createMockProgressiveMigration = () => ({
  createFeatureFlag: vi.fn(),
  startRollout: vi.fn(),
});
const createMockHealthCheck = () => ({});
const createMockRollbackSystem = () => ({
  createRollbackPlan: vi.fn(),
});
const createMockApplicator = () => ({
  applyTransformation: vi.fn(),
});
const createMockSourceMapper = () => ({
  register: vi.fn(),
  getMapping: vi.fn(),
});

// Store current mock instances
let mockExtractor: any;
let mockValidator: any;
let mockDeprecationAnalyzer: any;
let mockConfidenceScorer: any;
let mockProgressiveMigration: any;
let mockHealthCheck: any;
let mockRollbackSystem: any;
let mockApplicator: any;
let mockSourceMapper: any;

// Mock all dependencies before any imports that might use them
vi.mock('fs/promises');
vi.mock('../../utils/logger');

describe.sequential('UnifiedMigrationPipeline - Validation', () => {
  let mockConfig: MigrationConfig;
  let mockOptions: any;

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

    // Mock graphql parse globally
    vi.mocked(parse).mockReturnValue({ kind: 'Document' } as any);
  });

  describe('validate()', () => {
    async function setupPipelineAndExtract() {
      // Reset parse mock to default behavior
      vi.mocked(parse).mockReturnValue({ kind: 'Document' } as any);

      const pipeline = new UnifiedMigrationPipeline(mockConfig, mockOptions);

      // Setup mocks for extraction
      mockExtractor.extract.mockResolvedValue({
        queries: [
          {
            id: 'q1',
            name: 'TestQuery',
            type: 'query',
            content: 'query TestQuery { test }',
            filePath: 'test.js',
            sourceAST: { node: {}, start: 0, end: 10 },
            location: { line: 1, column: 1, file: '/Users/balkhalil/gd/demo/pg-migration-620/src/test/pipeline/UnifiedMigrationPipeline.validation.test.js' },
            fragments: [],
          },
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {},
      });

      await pipeline.extract();
      return pipeline;
    }

    it('should validate all operations successfully', async () => {
      const pipeline = await setupPipelineAndExtract();

      // Ensure parse is working correctly for this test
      vi.mocked(parse).mockReturnValue({ kind: 'Document' } as any);

      mockValidator.loadSchema.mockResolvedValue({ schema: 'mock' });
      mockValidator.validateOperation.mockResolvedValue([]);
      mockDeprecationAnalyzer.analyzeOperation.mockResolvedValue([]);

      const result = await pipeline.validate();

      expect(mockValidator.loadSchema).toHaveBeenCalledWith('schema content');
      expect(mockValidator.validateOperation).toHaveBeenCalled();
      expect(result).toEqual({
        hasErrors: false,
        errors: [],
        warnings: [],
      });
    });

    it('should handle validation errors', async () => {
      const pipeline = await setupPipelineAndExtract();

      // Ensure parse is working correctly for this test
      vi.mocked(parse).mockReturnValue({ kind: 'Document' } as any);

      mockValidator.loadSchema.mockResolvedValue({ schema: 'mock' });
      mockValidator.validateOperation.mockResolvedValue([{ message: 'Invalid field' }]);

      const result = await pipeline.validate();

      expect(result.hasErrors).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        operation: 'TestQuery',
        message: 'Invalid field',
        severity: 'error',
      });
    });

    it('should handle deprecation warnings', async () => {
      const pipeline = await setupPipelineAndExtract();

      // Ensure parse is working correctly for this test
      vi.mocked(parse).mockReturnValue({ kind: 'Document' } as any);

      mockValidator.loadSchema.mockResolvedValue({ schema: 'mock' });
      mockValidator.validateOperation.mockResolvedValue([]);
      mockDeprecationAnalyzer.analyzeOperation.mockResolvedValue([
        { field: 'oldField', reason: 'Use newField instead' },
      ]);

      const result = await pipeline.validate();

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toEqual({
        operation: 'TestQuery',
        message: 'Using deprecated field: oldField - Use newField instead',
      });
    });

    it('should handle parse errors', async () => {
      const pipeline = await setupPipelineAndExtract();

      mockValidator.loadSchema.mockResolvedValue({ schema: 'mock' });
      vi.mocked(parse).mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = await pipeline.validate();

      expect(result.hasErrors).toBe(true);
      expect(result.errors[0].message).toContain('Failed to parse operation');
    });

    it('should use custom schema path from config', async () => {
      (mockConfig as any).schemaPath = './custom-schema.graphql';
      const pipeline = await setupPipelineAndExtract();

      mockValidator.loadSchema.mockResolvedValue({ schema: 'mock' });
      mockValidator.validateOperation.mockResolvedValue([]);

      await pipeline.validate();

      expect(fs.readFile).toHaveBeenCalledWith('./custom-schema.graphql', 'utf-8');
    });
  });
});
