import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MigrationOrchestrator } from '../../core/MigrationOrchestrator.js';
import { ConfidenceScorer } from '../../core/analyzer/ConfidenceScorer.js';
import { ProgressiveMigration } from '../../core/safety/ProgressiveMigration.js';
import { RollbackSystem } from '../../core/safety/Rollback.js';
import { HealthCheckSystem } from '../../core/safety/HealthCheck.js';
import { ExistingScriptsAdapter } from '../../adapters/ExistingScriptsAdapter.js';
import { MigrationConfig, GraphQLOperation } from '../../types/index.js';

// Mock dependencies
vi.mock('../../core/analyzer/ConfidenceScorer');
vi.mock('../../core/safety/ProgressiveMigration');
vi.mock('../../core/safety/Rollback');
vi.mock('../../core/safety/HealthCheck');
vi.mock('../../adapters/ExistingScriptsAdapter');

describe('MigrationOrchestrator', () => {
  const mockConfig: MigrationConfig = {
    source: {
      include: ['**/*.{ts,tsx,js,jsx}'],
      exclude: ['**/node_modules/**'],
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

  let orchestrator: MigrationOrchestrator;
  let mockConfidenceScorer: any;
  let mockProgressiveMigration: any;
  let mockRollbackSystem: any;
  let mockHealthCheck: any;
  let mockScriptsAdapter: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    mockConfidenceScorer = {
      scoreTransformation: vi.fn(),
    };
    mockProgressiveMigration = {
      createFeatureFlag: vi.fn(),
      shouldUseMigratedQuery: vi.fn(),
      startRollout: vi.fn(),
      updateRollout: vi.fn(),
      stopRollout: vi.fn(),
    };
    mockRollbackSystem = {
      canRollback: vi.fn(),
      rollback: vi.fn(),
      createSnapshot: vi.fn(),
      createRollbackPlan: vi.fn(),
      rollbackOperation: vi.fn(),
      executeRollback: vi.fn(),
    };
    mockHealthCheck = {
      performHealthCheck: vi.fn(),
      recordMetrics: vi.fn(),
    };
    mockScriptsAdapter = {
      extractOperations: vi.fn(),
      applyTransformations: vi.fn(),
      transformOperation: vi.fn(),
      validateOperations: vi.fn(),
      applyChange: vi.fn(),
    };

    vi.mocked(ConfidenceScorer).mockImplementation(() => mockConfidenceScorer);
    vi.mocked(ProgressiveMigration).mockImplementation(() => mockProgressiveMigration);
    vi.mocked(RollbackSystem).mockImplementation(() => mockRollbackSystem);
    vi.mocked(HealthCheckSystem).mockImplementation(() => mockHealthCheck);
    vi.mocked(ExistingScriptsAdapter).mockImplementation(() => mockScriptsAdapter);

    orchestrator = new MigrationOrchestrator(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize all components', () => {
      expect(ConfidenceScorer).toHaveBeenCalled();
      expect(ProgressiveMigration).toHaveBeenCalled();
      expect(RollbackSystem).toHaveBeenCalled();
      expect(HealthCheckSystem).toHaveBeenCalled();
      expect(ExistingScriptsAdapter).toHaveBeenCalled();
    });
  });

  describe('analyze', () => {
    const mockOperations: GraphQLOperation[] = [
      {
        id: 'op1',
        type: 'query',
        name: 'GetUser',
        ast: {} as any,
        source: 'query GetUser { user { id name } }',
        file: 'user.js',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: [],
      },
      {
        id: 'op2',
        type: 'mutation',
        name: 'CreateUser',
        ast: {} as any,
        source:
          'mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id } }',
        file: 'user.js',
        line: 10,
        column: 1,
        variables: [{ id: 'generated-id', name: 'input', type: 'CreateUserInput!' }],
        fragments: [],
        directives: [],
      },
      {
        id: 'op3',
        type: 'subscription',
        name: 'UserUpdated',
        ast: {} as any,
        source: 'subscription UserUpdated { userUpdated { id name } }',
        file: 'user.js',
        line: 20,
        column: 1,
        variables: [],
        fragments: [],
        directives: [],
      },
    ];

    beforeEach(() => {
      mockScriptsAdapter.extractOperations.mockResolvedValue(mockOperations);
      mockConfidenceScorer.scoreTransformation.mockReturnValue({
        score: 85,
        category: 'automatic',
        factors: {
          complexity: 80,
          patternMatch: 90,
          testCoverage: 85,
          historicalSuccess: 85,
        },
        risks: [],
        requiresReview: false,
      });
    });

    it('should extract and analyze operations', async () => {
      const result = await orchestrator.analyze('src/');

      expect(mockScriptsAdapter.extractOperations).toHaveBeenCalledWith('src/');
      expect(result.operations).toHaveLength(3);
      expect(result.summary.total).toBe(3);
      expect(result.summary.queries).toBe(1);
      expect(result.summary.mutations).toBe(1);
      expect(result.summary.subscriptions).toBe(1);
    });

    it('should add confidence scores to operations', async () => {
      const result = await orchestrator.analyze('src/');

      // The scoreTransformation is called for each operation to create a mock change
      expect(mockConfidenceScorer.scoreTransformation).toHaveBeenCalled();
      result.operations.forEach((op) => {
        expect(op.confidence).toBeDefined();
        expect(op.confidence?.score).toBe(85);
        expect(op.confidence?.category).toBe('automatic');
      });
    });

    it('should handle extraction errors', async () => {
      mockScriptsAdapter.extractOperations.mockRejectedValue(new Error('Extraction failed'));

      await expect(orchestrator.analyze('src/')).rejects.toThrow('Extraction failed');
    });

    it('should handle empty results', async () => {
      mockScriptsAdapter.extractOperations.mockResolvedValue([]);

      const result = await orchestrator.analyze('src/');

      expect(result.operations).toHaveLength(0);
      expect(result.summary.total).toBe(0);
      expect(result.summary.queries).toBe(0);
      expect(result.summary.mutations).toBe(0);
      expect(result.summary.subscriptions).toBe(0);
    });
  });

  describe('transform', () => {
    const mockOperations: GraphQLOperation[] = [
      {
        id: 'op1',
        type: 'query',
        name: 'GetUser',
        ast: {} as any,
        source: 'query GetUser { user { id name } }',
        file: 'user.js',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: [],
      },
    ];

    beforeEach(() => {
      mockScriptsAdapter.extractOperations.mockResolvedValue(mockOperations);
      mockScriptsAdapter.transformOperation.mockResolvedValue([
        {
          file: 'user.js',
          operation: mockOperations[0],
          pattern: 'GetUser',
          oldQuery: 'query GetUser { user { id name } }',
          newQuery: 'query GetUser { user { id name email } }',
          transformations: [],
        },
      ]);
      mockScriptsAdapter.applyChange.mockResolvedValue(undefined);
      mockConfidenceScorer.scoreTransformation.mockReturnValue({
        score: 85,
        category: 'automatic',
        factors: {
          complexity: 80,
          patternMatch: 90,
          testCoverage: 85,
          historicalSuccess: 85,
        },
        risks: [],
        requiresReview: false,
      });
    });

    it('should transform operations with sufficient confidence', async () => {
      const result = await orchestrator.transform({
        source: 'src/',
        minConfidence: 70,
        dryRun: false,
      });

      expect(mockScriptsAdapter.extractOperations).toHaveBeenCalledWith('src/');
      expect(mockScriptsAdapter.transformOperation).toHaveBeenCalledWith(mockOperations[0]);
      expect(mockScriptsAdapter.applyChange).toHaveBeenCalled();
      expect(result.transformed).toBe(1);
      expect(result.automatic).toBe(1);
    });

    it('should skip transformation in dry run mode', async () => {
      const result = await orchestrator.transform({
        source: 'src/',
        minConfidence: 70,
        dryRun: true,
      });

      expect(mockScriptsAdapter.applyChange).not.toHaveBeenCalled();
      expect(result.transformed).toBe(0);
      expect(result.automatic).toBe(1);
    });

    it('should skip transformation with low confidence', async () => {
      mockConfidenceScorer.scoreTransformation.mockReturnValue({
        score: 50,
        category: 'manual',
        factors: {
          complexity: 50,
          patternMatch: 50,
          testCoverage: 50,
          historicalSuccess: 50,
        },
        risks: ['Complex transformation'],
        requiresReview: true,
      });

      const result = await orchestrator.transform({
        source: 'src/',
        minConfidence: 70,
        dryRun: false,
      });

      expect(mockScriptsAdapter.applyChange).not.toHaveBeenCalled();
      expect(result.transformed).toBe(0);
      expect(result.manual).toBe(1);
    });

    it('should handle transformation errors', async () => {
      mockScriptsAdapter.transformOperation.mockRejectedValue(new Error('Transform failed'));

      await expect(
        orchestrator.transform({
          source: 'src/',
          minConfidence: 70,
          dryRun: false,
        }),
      ).rejects.toThrow('Transform failed');
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      mockScriptsAdapter.validateOperations.mockResolvedValue({
        valid: true,
        errors: [],
      });
    });

    it('should validate operations successfully', async () => {
      const result = await orchestrator.validate({
        source: 'src/',
        schemaPath: 'schema.graphql',
      });

      expect(mockScriptsAdapter.validateOperations).toHaveBeenCalledWith('src/', 'schema.graphql');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle validation errors', async () => {
      mockScriptsAdapter.validateOperations.mockResolvedValue({
        valid: false,
        errors: [{ operation: 'GetUser', message: 'Field not found' }],
      });

      const result = await orchestrator.validate({
        source: 'src/',
        schemaPath: 'schema.graphql',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].operation).toBe('GetUser');
    });

    it('should handle validation script errors', async () => {
      mockScriptsAdapter.validateOperations.mockRejectedValue(new Error('Validation failed'));

      await expect(
        orchestrator.validate({
          source: 'src/',
          schemaPath: 'schema.graphql',
        }),
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('applyOperation', () => {
    const mockOperations: GraphQLOperation[] = [
      {
        id: 'op1',
        type: 'query',
        name: 'GetUser',
        ast: {} as any,
        source: 'query GetUser { user { id name } }',
        file: 'user.js',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: [],
      },
    ];

    beforeEach(() => {
      mockScriptsAdapter.extractOperations.mockResolvedValue(mockOperations);
      mockRollbackSystem.createRollbackPlan.mockResolvedValue(undefined);
      mockProgressiveMigration.createFeatureFlag.mockReturnValue({
        name: 'migration.GetUser',
        operation: 'op1',
        enabled: false,
        rolloutPercentage: 0,
        enabledSegments: [],
        fallbackBehavior: 'old',
      });
      mockProgressiveMigration.startRollout.mockResolvedValue(undefined);
    });

    it('should apply operation successfully', async () => {
      // Make sure startRollout doesn't reject
      mockProgressiveMigration.startRollout.mockResolvedValue(undefined);

      await orchestrator.applyOperation('GetUser', 10);

      expect(mockScriptsAdapter.extractOperations).toHaveBeenCalled();
      expect(mockRollbackSystem.createRollbackPlan).toHaveBeenCalledWith([mockOperations[0]]);
      expect(mockProgressiveMigration.createFeatureFlag).toHaveBeenCalledWith(mockOperations[0]);
      expect(mockProgressiveMigration.startRollout).toHaveBeenCalledWith('op1', 10);
    });

    it('should handle operation not found', async () => {
      await expect(orchestrator.applyOperation('NonExistentOperation', 10)).rejects.toThrow(
        'Operation not found: NonExistentOperation',
      );
    });

    it('should handle rollout errors', async () => {
      mockProgressiveMigration.startRollout.mockRejectedValue(new Error('Rollout failed'));

      await expect(orchestrator.applyOperation('GetUser', 10)).rejects.toThrow('Rollout failed');
    });
  });

  describe('applyAll', () => {
    const mockOperations: GraphQLOperation[] = [
      {
        id: 'op1',
        type: 'query',
        name: 'GetUser',
        ast: {} as any,
        source: 'query GetUser { user { id name } }',
        file: 'user.js',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: [],
      },
      {
        id: 'op2',
        type: 'mutation',
        name: 'CreateUser',
        ast: {} as any,
        source:
          'mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id } }',
        file: 'user.js',
        line: 10,
        column: 1,
        variables: [{ id: 'generated-id', name: 'input', type: 'CreateUserInput!' }],
        fragments: [],
        directives: [],
      },
    ];

    beforeEach(() => {
      mockScriptsAdapter.extractOperations.mockResolvedValue(mockOperations);
      mockRollbackSystem.createRollbackPlan.mockResolvedValue(undefined);
      mockProgressiveMigration.createFeatureFlag.mockReturnValue({
        name: 'migration.test',
        operation: 'test',
        enabled: false,
        rolloutPercentage: 0,
        enabledSegments: [],
        fallbackBehavior: 'old',
      });
      mockProgressiveMigration.startRollout.mockResolvedValue(undefined);
    });

    it('should apply all operations successfully', async () => {
      // Make sure startRollout doesn't reject
      mockProgressiveMigration.startRollout.mockResolvedValue(undefined);

      const result = await orchestrator.applyAll(5);

      expect(mockScriptsAdapter.extractOperations).toHaveBeenCalled();
      expect(mockRollbackSystem.createRollbackPlan).toHaveBeenCalledWith(mockOperations);
      expect(mockProgressiveMigration.createFeatureFlag).toHaveBeenCalledTimes(2);
      expect(mockProgressiveMigration.startRollout).toHaveBeenCalledTimes(2);
      expect(result.count).toBe(2);
    });

    it('should handle rollout errors', async () => {
      mockProgressiveMigration.startRollout.mockRejectedValue(new Error('Rollout failed'));

      await expect(orchestrator.applyAll(5)).rejects.toThrow('Rollout failed');
    });
  });

  describe('getHealth', () => {
    beforeEach(() => {
      mockHealthCheck.performHealthCheck.mockResolvedValue({
        status: 'healthy',
        issues: [],
      });
    });

    it('should get health for specific operation', async () => {
      const health = await orchestrator.getHealth('GetUser');

      expect(mockHealthCheck.performHealthCheck).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'GetUser',
          name: 'GetUser',
        }),
      );
      expect(health).toEqual({
        status: 'healthy',
        issues: [],
      });
    });

    it('should get health for all operations', async () => {
      const mockOperations: GraphQLOperation[] = [
        {
          id: 'op1',
          type: 'query',
          name: 'GetUser',
          ast: {} as any,
          source: 'query GetUser { user { id name } }',
          file: 'user.js',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: [],
        },
      ];

      mockScriptsAdapter.extractOperations.mockResolvedValue(mockOperations);
      // Make sure performHealthCheck returns the expected value
      mockHealthCheck.performHealthCheck.mockResolvedValue({
        status: 'healthy',
        issues: [],
      });

      const health = await orchestrator.getHealth();

      expect(mockScriptsAdapter.extractOperations).toHaveBeenCalled();
      expect(mockHealthCheck.performHealthCheck).toHaveBeenCalledWith(mockOperations[0]);
      expect(health).toEqual({
        GetUser: {
          status: 'healthy',
          issues: [],
        },
      });
    });

    it('should handle health check errors', async () => {
      mockHealthCheck.performHealthCheck.mockRejectedValue(new Error('Health check failed'));

      await expect(orchestrator.getHealth('GetUser')).rejects.toThrow('Health check failed');
    });
  });

  describe('rollbackOperation', () => {
    const mockOperations: GraphQLOperation[] = [
      {
        id: 'op1',
        type: 'query',
        name: 'GetUser',
        ast: {} as any,
        source: 'query GetUser { user { id name } }',
        file: 'user.js',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: [],
      },
    ];

    beforeEach(() => {
      mockScriptsAdapter.extractOperations.mockResolvedValue(mockOperations);
      mockRollbackSystem.rollbackOperation.mockResolvedValue(undefined);
    });

    it('should rollback operation successfully', async () => {
      // Make sure rollbackOperation doesn't reject
      mockRollbackSystem.rollbackOperation.mockResolvedValue(undefined);

      await orchestrator.rollbackOperation('GetUser', 'High error rate');

      expect(mockScriptsAdapter.extractOperations).toHaveBeenCalled();
      expect(mockRollbackSystem.rollbackOperation).toHaveBeenCalledWith('op1');
    });

    it('should handle operation not found', async () => {
      await expect(
        orchestrator.rollbackOperation('NonExistentOperation', 'Test reason'),
      ).rejects.toThrow('Operation not found: NonExistentOperation');
    });

    it('should handle rollback errors', async () => {
      mockRollbackSystem.rollbackOperation.mockRejectedValue(new Error('Rollback failed'));

      await expect(orchestrator.rollbackOperation('GetUser', 'Test reason')).rejects.toThrow(
        'Rollback failed',
      );
    });
  });

  describe('rollbackAll', () => {
    const mockOperations: GraphQLOperation[] = [
      {
        id: 'op1',
        type: 'query',
        name: 'GetUser',
        ast: {} as any,
        source: 'query GetUser { user { id name } }',
        file: 'user.js',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: [],
      },
    ];

    beforeEach(() => {
      mockScriptsAdapter.extractOperations.mockResolvedValue(mockOperations);
      mockRollbackSystem.createRollbackPlan.mockResolvedValue({ id: 'plan1' });
      mockRollbackSystem.executeRollback.mockResolvedValue(undefined);
    });

    it('should rollback all operations successfully', async () => {
      // Make sure executeRollback doesn't reject
      mockRollbackSystem.executeRollback.mockResolvedValue(undefined);

      const result = await orchestrator.rollbackAll('immediate', 'Emergency rollback');

      expect(mockScriptsAdapter.extractOperations).toHaveBeenCalled();
      expect(mockRollbackSystem.createRollbackPlan).toHaveBeenCalledWith(
        mockOperations,
        'immediate',
      );
      expect(mockRollbackSystem.executeRollback).toHaveBeenCalledWith('plan1');
      expect(result.count).toBe(1);
    });

    it('should handle gradual rollback', async () => {
      // Make sure executeRollback doesn't reject
      mockRollbackSystem.executeRollback.mockResolvedValue(undefined);

      await orchestrator.rollbackAll('gradual', 'Gradual rollback');

      expect(mockRollbackSystem.createRollbackPlan).toHaveBeenCalledWith(mockOperations, 'gradual');
    });

    it('should handle rollback errors', async () => {
      mockRollbackSystem.executeRollback.mockRejectedValue(new Error('Rollback failed'));

      await expect(orchestrator.rollbackAll('immediate', 'Test reason')).rejects.toThrow(
        'Rollback failed',
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle full migration workflow', async () => {
      const mockOperations: GraphQLOperation[] = [
        {
          id: 'op1',
          type: 'query',
          name: 'GetUser',
          ast: {} as any,
          source: 'query GetUser { user { id name } }',
          file: 'user.js',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: [],
        },
      ];

      mockScriptsAdapter.extractOperations.mockResolvedValue(mockOperations);
      mockConfidenceScorer.scoreTransformation.mockReturnValue({
        score: 95,
        category: 'automatic',
        factors: {
          complexity: 90,
          patternMatch: 95,
          testCoverage: 95,
          historicalSuccess: 95,
        },
        risks: [],
        requiresReview: false,
      });
      mockScriptsAdapter.transformOperation.mockResolvedValue([
        {
          file: 'user.js',
          operation: mockOperations[0],
          pattern: 'GetUser',
          oldQuery: 'query GetUser { user { id name } }',
          newQuery: 'query GetUser { user { id name email } }',
          transformations: [],
        },
      ]);
      mockScriptsAdapter.applyChange.mockResolvedValue(undefined);
      mockProgressiveMigration.createFeatureFlag.mockReturnValue({
        name: 'migration.GetUser',
        operation: 'op1',
        enabled: false,
        rolloutPercentage: 0,
        enabledSegments: [],
        fallbackBehavior: 'old',
      });
      mockHealthCheck.performHealthCheck.mockResolvedValue({
        status: 'healthy',
        issues: [],
      });
      mockRollbackSystem.createRollbackPlan.mockResolvedValue(undefined);
      mockProgressiveMigration.startRollout.mockResolvedValue(undefined);

      // Analyze
      const analysisResult = await orchestrator.analyze('src/');
      expect(analysisResult.operations).toHaveLength(1);
      expect(analysisResult.operations[0].confidence?.score).toBe(95);

      // Transform
      const transformResult = await orchestrator.transform({
        source: 'src/',
        minConfidence: 70,
        dryRun: false,
      });
      expect(transformResult.transformed).toBe(1);
      expect(transformResult.automatic).toBe(1);

      // Apply operation
      await orchestrator.applyOperation('GetUser', 10);
      expect(mockProgressiveMigration.startRollout).toHaveBeenCalledWith('op1', 10);

      // Health check
      const healthResult = await orchestrator.getHealth('GetUser');
      expect(healthResult).toEqual({
        status: 'healthy',
        issues: [],
      });
    });

    it('should handle automatic rollback on health issues', async () => {
      const mockOperations: GraphQLOperation[] = [
        {
          id: 'op1',
          type: 'query',
          name: 'GetUser',
          ast: {} as any,
          source: 'query GetUser { user { id name } }',
          file: 'user.js',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: [],
        },
      ];

      mockScriptsAdapter.extractOperations.mockResolvedValue(mockOperations);
      mockRollbackSystem.createRollbackPlan.mockResolvedValue({ id: 'plan1' });
      mockRollbackSystem.executeRollback.mockResolvedValue(undefined);
      mockRollbackSystem.rollbackOperation.mockResolvedValue(undefined);
      mockProgressiveMigration.createFeatureFlag.mockReturnValue({
        name: 'migration.GetUser',
        operation: 'op1',
        enabled: false,
        rolloutPercentage: 0,
        enabledSegments: [],
        fallbackBehavior: 'old',
      });
      mockProgressiveMigration.startRollout.mockResolvedValue(undefined);
      mockHealthCheck.performHealthCheck.mockResolvedValue({
        status: 'unhealthy',
        issues: [
          {
            severity: 'critical',
            message: 'Error rate too high',
            affectedOperations: ['op1'],
            timestamp: new Date(),
          },
        ],
      });

      // Apply operation
      await orchestrator.applyOperation('GetUser', 10);

      // Check health (should be unhealthy)
      const healthResult = await orchestrator.getHealth('GetUser');
      expect(healthResult).toEqual({
        status: 'unhealthy',
        issues: [
          {
            severity: 'critical',
            message: 'Error rate too high',
            affectedOperations: ['op1'],
            timestamp: expect.any(Date),
          },
        ],
      });

      // Rollback due to health issues
      await orchestrator.rollbackOperation('GetUser', 'Health check failed');
      expect(mockRollbackSystem.rollbackOperation).toHaveBeenCalledWith('op1');
    });

    it('should handle validation failures', async () => {
      mockScriptsAdapter.validateOperations.mockResolvedValue({
        valid: false,
        errors: [
          { operation: 'GetUser', message: 'Field deprecated' },
          { operation: 'CreateUser', message: 'Input type changed' },
        ],
      });

      const validationResult = await orchestrator.validate({
        source: 'src/',
        schemaPath: 'schema.graphql',
      });

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors).toHaveLength(2);
      expect(validationResult.errors[0].operation).toBe('GetUser');
      expect(validationResult.errors[1].operation).toBe('CreateUser');
    });

    it('should handle mixed confidence levels', async () => {
      const mockOperations: GraphQLOperation[] = [
        {
          id: 'op1',
          type: 'query',
          name: 'GetUser',
          ast: {} as any,
          source: 'query GetUser { user { id name } }',
          file: 'user.js',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: [],
        },
        {
          id: 'op2',
          type: 'query',
          name: 'GetPost',
          ast: {} as any,
          source: 'query GetPost { post { id title } }',
          file: 'post.js',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: [],
        },
      ];

      mockScriptsAdapter.extractOperations.mockResolvedValue(mockOperations);
      mockScriptsAdapter.transformOperation
        .mockResolvedValueOnce([
          {
            file: 'user.js',
            operation: mockOperations[0],
            pattern: 'GetUser',
            oldQuery: 'query GetUser { user { id name } }',
            newQuery: 'query GetUser { user { id name email } }',
            transformations: [],
          },
        ])
        .mockResolvedValueOnce([
          {
            file: 'post.js',
            operation: mockOperations[1],
            pattern: 'GetPost',
            oldQuery: 'query GetPost { post { id title } }',
            newQuery: 'query GetPost { post { id title content } }',
            transformations: [],
          },
        ]);
      mockScriptsAdapter.applyChange.mockResolvedValue(undefined);
      mockConfidenceScorer.scoreTransformation
        .mockReturnValueOnce({
          score: 95,
          category: 'automatic',
          factors: {
            complexity: 90,
            patternMatch: 95,
            testCoverage: 95,
            historicalSuccess: 95,
          },
          risks: [],
          requiresReview: false,
        })
        .mockReturnValueOnce({
          score: 45,
          category: 'manual',
          factors: {
            complexity: 30,
            patternMatch: 50,
            testCoverage: 40,
            historicalSuccess: 60,
          },
          risks: ['Complex transformation'],
          requiresReview: true,
        });

      const transformResult = await orchestrator.transform({
        source: 'src/',
        minConfidence: 70,
        dryRun: false,
      });

      expect(transformResult.transformed).toBe(1); // Only automatic should be transformed
      expect(transformResult.automatic).toBe(1);
      expect(transformResult.manual).toBe(1);
      expect(mockScriptsAdapter.applyChange).toHaveBeenCalledTimes(1);
    });
  });
});
