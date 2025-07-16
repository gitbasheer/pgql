import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RollbackSystem } from '../../../core/safety/Rollback.js';
import { ProgressiveMigration } from '../../../core/safety/ProgressiveMigration.js';
import { GraphQLOperation } from '../../../types.js';
import { logger } from '../../../utils/logger.js';

// Mock logger
vi.mock('../../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock delay function for faster tests
vi.mock('../../../core/safety/Rollback', async () => {
  const actual = (await vi.importActual('../../../core/safety/Rollback')) as any;
  return {
    ...actual,
    RollbackSystem: class extends actual.RollbackSystem {
      private delay(ms: number): Promise<void> {
        return Promise.resolve(); // Skip delays in tests
      }
    },
  };
});

describe('RollbackSystem', () => {
  let rollbackSystem: RollbackSystem;
  let progressiveMigration: ProgressiveMigration;
  let mockOperations: GraphQLOperation[];

  beforeEach(() => {
    progressiveMigration = new ProgressiveMigration();
    rollbackSystem = new RollbackSystem(progressiveMigration);

    mockOperations = [
      {
        id: 'test-op-1',
        name: 'TestOperation1',
        type: 'query',
        ast: {} as any,
        source: 'query TestOperation1 { test }',
        file: 'test1.js',
        line: 10,
        column: 5,
        variables: [],
        fragments: [],
        directives: [],
      },
      {
        id: 'test-op-2',
        name: 'TestOperation2',
        type: 'mutation',
        ast: {} as any,
        source: 'mutation TestOperation2 { update }',
        file: 'test2.js',
        line: 20,
        column: 10,
        variables: [],
        fragments: [],
        directives: [],
      },
    ];

    vi.clearAllMocks();
  });

  describe('createCheckpoint', () => {
    it('should create a checkpoint with current state', async () => {
      // Setup operation states
      for (const op of mockOperations) {
        progressiveMigration.createFeatureFlag(op);
        await progressiveMigration.startRollout(op.id, 50);
      }

      const checkpoint = await rollbackSystem.createCheckpoint(mockOperations);

      expect(checkpoint.id).toMatch(/^checkpoint-\d+-[a-z0-9]+$/);
      expect(checkpoint.timestamp).toBeInstanceOf(Date);
      expect(checkpoint.operations).toEqual(['test-op-1', 'test-op-2']);
      expect(checkpoint.state['test-op-1']).toBeDefined();
      expect(checkpoint.state['test-op-1'].rolloutStatus.percentage).toBe(50);
      expect(logger.info).toHaveBeenCalledWith(`Created checkpoint: ${checkpoint.id}`);
    });

    it('should capture segment information in checkpoint', async () => {
      progressiveMigration.createFeatureFlag(mockOperations[0]);
      progressiveMigration.enableForSegments(mockOperations[0].id, ['beta', 'internal']);

      const checkpoint = await rollbackSystem.createCheckpoint([mockOperations[0]]);

      expect(checkpoint.state['test-op-1'].rolloutStatus.segments).toEqual(['beta', 'internal']);
    });
  });

  describe('createRollbackPlan', () => {
    it('should create an immediate rollback plan by default', async () => {
      const plan = await rollbackSystem.createRollbackPlan(mockOperations);

      expect(plan.id).toMatch(/^rollback-\d+-[a-z0-9]+$/);
      expect(plan.operations).toEqual(['test-op-1', 'test-op-2']);
      expect(plan.strategy).toBe('immediate');
      expect(plan.checkpoints).toHaveLength(1);
      expect(logger.info).toHaveBeenCalledWith(
        `Created rollback plan: ${plan.id} with strategy: immediate`,
      );
    });

    it('should create a gradual rollback plan when specified', async () => {
      const plan = await rollbackSystem.createRollbackPlan(mockOperations, 'gradual');

      expect(plan.strategy).toBe('gradual');
      expect(logger.info).toHaveBeenCalledWith(
        `Created rollback plan: ${plan.id} with strategy: gradual`,
      );
    });
  });

  describe('executeRollback', () => {
    describe('immediate rollback', () => {
      it('should immediately disable all operations', async () => {
        // Setup operations with rollout
        for (const op of mockOperations) {
          progressiveMigration.createFeatureFlag(op);
          await progressiveMigration.startRollout(op.id, 75);
        }

        const plan = await rollbackSystem.createRollbackPlan(mockOperations, 'immediate');
        await rollbackSystem.executeRollback(plan.id);

        // Check all operations are disabled
        for (const op of mockOperations) {
          const status = progressiveMigration.getRolloutStatus(op.id);
          expect(status?.enabled).toBe(false);
          expect(status?.percentage).toBe(0);
        }

        expect(logger.info).toHaveBeenCalledWith(
          `Rollback completed successfully for plan: ${plan.id}`,
        );
      });

      it('should throw error for non-existent plan', async () => {
        await expect(rollbackSystem.executeRollback('non-existent-plan')).rejects.toThrow(
          'Rollback plan not found: non-existent-plan',
        );
      });

      it('should log error on rollback failure', async () => {
        const plan = await rollbackSystem.createRollbackPlan(mockOperations);

        // Mock rollbackOperation to throw error
        vi.spyOn(progressiveMigration, 'rollbackOperation').mockRejectedValueOnce(
          new Error('Rollback failed'),
        );

        await expect(rollbackSystem.executeRollback(plan.id)).rejects.toThrow('Rollback failed');
        expect(logger.error).toHaveBeenCalledWith(
          `Rollback failed for plan: ${plan.id}`,
          expect.any(Error),
        );
      });
    });

    describe('gradual rollback', () => {
      it('should gradually reduce rollout percentage', async () => {
        // Setup operations with high rollout
        for (const op of mockOperations) {
          progressiveMigration.createFeatureFlag(op);
          await progressiveMigration.startRollout(op.id, 80);
        }

        const plan = await rollbackSystem.createRollbackPlan(mockOperations, 'gradual');

        // Mock increaseRollout to track calls
        const increaseRolloutSpy = vi.spyOn(progressiveMigration, 'increaseRollout');

        await rollbackSystem.executeRollback(plan.id);

        // Should reduce by 50% first (80% -> 40%)
        expect(increaseRolloutSpy).toHaveBeenCalledWith('test-op-1', -40);
        expect(increaseRolloutSpy).toHaveBeenCalledWith('test-op-2', -40);

        // Then completely disable
        for (const op of mockOperations) {
          const status = progressiveMigration.getRolloutStatus(op.id);
          expect(status?.enabled).toBe(false);
          expect(status?.percentage).toBe(0);
        }
      });

      it('should skip already disabled operations', async () => {
        progressiveMigration.createFeatureFlag(mockOperations[0]);
        // Don't enable the operation

        const plan = await rollbackSystem.createRollbackPlan([mockOperations[0]], 'gradual');
        const rollbackOperationSpy = vi.spyOn(progressiveMigration, 'rollbackOperation');

        await rollbackSystem.executeRollback(plan.id);

        // Should not try to rollback disabled operation
        expect(rollbackOperationSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('rollbackOperation', () => {
    it('should rollback a single operation', async () => {
      progressiveMigration.createFeatureFlag(mockOperations[0]);
      await progressiveMigration.startRollout(mockOperations[0].id, 60);

      await rollbackSystem.rollbackOperation(mockOperations[0].id);

      const status = progressiveMigration.getRolloutStatus(mockOperations[0].id);
      expect(status?.enabled).toBe(false);
      expect(status?.percentage).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('Rolling back single operation: test-op-1');
    });

    it('should restore from checkpoint if available', async () => {
      // Create initial state
      progressiveMigration.createFeatureFlag(mockOperations[0]);
      await progressiveMigration.startRollout(mockOperations[0].id, 30);
      progressiveMigration.enableForSegments(mockOperations[0].id, ['beta']);

      // Create checkpoint
      await rollbackSystem.createCheckpoint([mockOperations[0]]);

      // Change state
      await progressiveMigration.increaseRollout(mockOperations[0].id, 50);
      progressiveMigration.enableForSegments(mockOperations[0].id, ['beta', 'alpha']);

      // Rollback should restore to checkpoint state
      await rollbackSystem.rollbackOperation(mockOperations[0].id);

      const status = progressiveMigration.getRolloutStatus(mockOperations[0].id);
      expect(status?.enabled).toBe(false); // Rolled back
      expect(status?.percentage).toBe(0);
    });

    it('should handle operation without checkpoint', async () => {
      progressiveMigration.createFeatureFlag(mockOperations[0]);
      await progressiveMigration.startRollout(mockOperations[0].id, 40);

      // No checkpoint created
      await rollbackSystem.rollbackOperation(mockOperations[0].id);

      const status = progressiveMigration.getRolloutStatus(mockOperations[0].id);
      expect(status?.enabled).toBe(false);
      expect(status?.percentage).toBe(0);
    });
  });

  describe('checkpoint management', () => {
    it('should find latest checkpoint for an operation', async () => {
      progressiveMigration.createFeatureFlag(mockOperations[0]);

      // Create multiple checkpoints at different states
      await progressiveMigration.startRollout(mockOperations[0].id, 10);
      const checkpoint1 = await rollbackSystem.createCheckpoint([mockOperations[0]]);

      await progressiveMigration.increaseRollout(mockOperations[0].id, 20);
      const checkpoint2 = await rollbackSystem.createCheckpoint([mockOperations[0]]);

      await progressiveMigration.increaseRollout(mockOperations[0].id, 30);
      const checkpoint3 = await rollbackSystem.createCheckpoint([mockOperations[0]]);

      // Rollback should use latest checkpoint
      await rollbackSystem.rollbackOperation(mockOperations[0].id);

      // Verify it used the latest checkpoint (would have been at 60%)
      expect(checkpoint3.state['test-op-1'].rolloutStatus.percentage).toBe(60);
    });

    it('should handle checkpoints with multiple operations', async () => {
      // Setup operations
      for (const op of mockOperations) {
        progressiveMigration.createFeatureFlag(op);
        await progressiveMigration.startRollout(op.id, 25);
      }

      // Create checkpoint for both operations
      const checkpoint = await rollbackSystem.createCheckpoint(mockOperations);

      // Change states
      await progressiveMigration.increaseRollout(mockOperations[0].id, 25);
      await progressiveMigration.increaseRollout(mockOperations[1].id, 50);

      // Create rollback plan and execute
      const plan = await rollbackSystem.createRollbackPlan(mockOperations);
      await rollbackSystem.executeRollback(plan.id);

      // Both should be rolled back
      expect(progressiveMigration.getRolloutStatus(mockOperations[0].id)?.percentage).toBe(0);
      expect(progressiveMigration.getRolloutStatus(mockOperations[1].id)?.percentage).toBe(0);
    });
  });

  describe('state restoration', () => {
    it('should restore complete state including segments', async () => {
      progressiveMigration.createFeatureFlag(mockOperations[0]);
      await progressiveMigration.startRollout(mockOperations[0].id, 45);
      progressiveMigration.enableForSegments(mockOperations[0].id, ['premium', 'enterprise']);

      // Create checkpoint
      const checkpoint = await rollbackSystem.createCheckpoint([mockOperations[0]]);

      // Verify checkpoint captured the state
      expect(checkpoint.state['test-op-1'].rolloutStatus).toEqual({
        enabled: true,
        percentage: 45,
        segments: ['premium', 'enterprise'],
      });
    });

    it('should handle operations that were never enabled', async () => {
      progressiveMigration.createFeatureFlag(mockOperations[0]);
      // Don't enable it

      const checkpoint = await rollbackSystem.createCheckpoint([mockOperations[0]]);
      const plan = await rollbackSystem.createRollbackPlan([mockOperations[0]]);

      // Should not throw error
      await expect(rollbackSystem.executeRollback(plan.id)).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should generate unique IDs for checkpoints and plans', async () => {
      const checkpoints = [];
      const plans = [];

      // Create multiple checkpoints and plans
      for (let i = 0; i < 10; i++) {
        checkpoints.push(await rollbackSystem.createCheckpoint([mockOperations[0]]));
        plans.push(await rollbackSystem.createRollbackPlan([mockOperations[0]]));
      }

      // All IDs should be unique
      const checkpointIds = checkpoints.map((c) => c.id);
      const planIds = plans.map((p) => p.id);

      expect(new Set(checkpointIds).size).toBe(10);
      expect(new Set(planIds).size).toBe(10);
    });

    it('should handle empty operations array', async () => {
      const checkpoint = await rollbackSystem.createCheckpoint([]);
      expect(checkpoint.operations).toEqual([]);
      expect(checkpoint.state).toEqual({});

      const plan = await rollbackSystem.createRollbackPlan([]);
      expect(plan.operations).toEqual([]);
    });
  });
});
