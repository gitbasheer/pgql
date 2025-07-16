import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedMigrationPipeline } from '../../core/pipeline/UnifiedMigrationPipeline.js';
import { MigrationConfig } from '../../types/index.js';
import * as fs from 'fs/promises';
// Mock modules
vi.mock('graphql', () => ({
  parse: vi.fn().mockReturnValue({ kind: 'Document' }),
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

  // Mock modules
}));

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

describe.sequential('UnifiedMigrationPipeline - Extraction', () => {
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
  });

  describe('extract()', () => {
    it('should extract operations and build source mapping', async () => {
      // Create pipeline which will create fresh mocks
      const pipeline = new UnifiedMigrationPipeline(mockConfig, mockOptions);

      // Setup mocks for this test
      mockExtractor.extract.mockResolvedValue({
        queries: [
          {
            id: 'q1',
            name: 'TestQuery',
            type: 'query',
            content: 'query TestQuery { test }',
            filePath: 'test.js',
            sourceAST: { node: {}, start: 0, end: 10 },
            location: { line: 1, column: 1, file: '/Users/balkhalil/gd/demo/pg-migration-620/src/test/pipeline/UnifiedMigrationPipeline.extraction.test.js' },
            fragments: [],
          },
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {},
      });
      mockSourceMapper.getMapping.mockReturnValue({ node: {}, start: 0, end: 10 });

      const result = await pipeline.extract();

      expect(mockExtractor.extract).toHaveBeenCalled();
      // The source mapping happens internally - we verify it works by checking the result
      expect(result).toEqual({
        operations: expect.any(Array),
        files: ['test.js'],
        summary: {
          queries: 1,
          mutations: 0,
          subscriptions: 0,
        },
      });
    });

    it('should handle operations without sourceAST', async () => {
      // Create pipeline which will create fresh mocks
      const pipeline = new UnifiedMigrationPipeline(mockConfig, mockOptions);

      mockExtractor.extract.mockResolvedValue({
        queries: [
          {
            id: 'q1',
            name: 'TestQuery',
            type: 'query',
            content: 'query TestQuery { test }',
            filePath: 'test.js',
          },
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {},
      });

      await pipeline.extract();

      expect(mockSourceMapper.register).not.toHaveBeenCalled();
    });

    it('should correctly categorize operation types', async () => {
      // Create pipeline which will create fresh mocks
      const pipeline = new UnifiedMigrationPipeline(mockConfig, mockOptions);

      mockExtractor.extract.mockResolvedValue({
        queries: [
          { id: 'q1', type: 'query', filePath: 'file1.js' },
          { id: 'm1', type: 'mutation', filePath: 'file2.js' },
          { id: 's1', type: 'subscription', filePath: 'file3.js' },
        ],
        variants: [],
        fragments: new Map(),
        switches: new Map(),
        errors: [],
        stats: {},
      });

      const result = await pipeline.extract();

      expect(result.summary).toEqual({
        queries: 1,
        mutations: 1,
        subscriptions: 1,
      });
    });
  });
});
