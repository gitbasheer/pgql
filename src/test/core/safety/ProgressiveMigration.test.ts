import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('ProgressiveMigration', () => {
  let progressiveMigration: ProgressiveMigration;
  let mockOperation: GraphQLOperation;

  beforeEach(() => {
    progressiveMigration = new ProgressiveMigration();
    mockOperation = {
      id: 'test-op-1',
      name: 'TestOperation',
      type: 'query',
      ast: {} as any,
      source: 'query TestOperation { test }',
      file: 'test.ts',
      line: 10,
      column: 5,
      variables: [],
      fragments: [],
      directives: [],
    };
    vi.clearAllMocks();
  });

  describe('createFeatureFlag', () => {
    it('should create a feature flag with correct defaults', () => {
      const flag = progressiveMigration.createFeatureFlag(mockOperation);

      expect(flag.name).toBe('migration.TestOperation');
      expect(flag.operation).toBe(mockOperation.id);
      expect(flag.enabled).toBe(false);
      expect(flag.rolloutPercentage).toBe(0);
      expect(flag.enabledSegments).toEqual([]);
      expect(flag.fallbackBehavior).toBe('old');
      expect(logger.info).toHaveBeenCalledWith('Created feature flag: migration.TestOperation');
    });
  });

  describe('shouldUseMigratedQuery', () => {
    beforeEach(() => {
      progressiveMigration.createFeatureFlag(mockOperation);
    });

    it('should return false when flag is disabled', () => {
      const result = progressiveMigration.shouldUseMigratedQuery(mockOperation.id, {
        userId: 'user123',
      });

      expect(result).toBe(false);
    });

    it('should return true when flag is enabled at 100%', async () => {
      await progressiveMigration.startRollout(mockOperation.id, 100);

      const result = progressiveMigration.shouldUseMigratedQuery(mockOperation.id, {
        userId: 'user123',
      });

      expect(result).toBe(true);
    });

    it('should respect segment-based targeting', async () => {
      progressiveMigration.enableForSegments(mockOperation.id, ['beta', 'internal']);

      const betaResult = progressiveMigration.shouldUseMigratedQuery(mockOperation.id, {
        segment: 'beta',
      });

      const publicResult = progressiveMigration.shouldUseMigratedQuery(mockOperation.id, {
        segment: 'public',
      });

      expect(betaResult).toBe(true);
      expect(publicResult).toBe(false);
    });

    it('should use consistent hash-based assignment for users', async () => {
      await progressiveMigration.startRollout(mockOperation.id, 50);

      // Same user should always get same result
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(
          progressiveMigration.shouldUseMigratedQuery(mockOperation.id, {
            userId: 'consistent-user',
          }),
        );
      }

      expect(new Set(results).size).toBe(1); // All results should be same
    });

    it('should handle anonymous users with random assignment', async () => {
      await progressiveMigration.startRollout(mockOperation.id, 50);

      // Without userId, should use random assignment
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(progressiveMigration.shouldUseMigratedQuery(mockOperation.id, {}));
      }

      const trueCount = results.filter((r) => r).length;
      // Should be roughly 50%, allowing for some variance
      expect(trueCount).toBeGreaterThan(30);
      expect(trueCount).toBeLessThan(70);
    });
  });

  describe('startRollout', () => {
    it('should start rollout with specified percentage', async () => {
      await progressiveMigration.startRollout(mockOperation.id, 10);

      const status = progressiveMigration.getRolloutStatus(mockOperation.id);

      expect(status).not.toBeNull();
      expect(status?.enabled).toBe(true);
      expect(status?.percentage).toBe(10);
      expect(logger.info).toHaveBeenCalledWith('Started rollout for test-op-1 at 10%');
    });

    it('should throw error for non-existent operation', async () => {
      await expect(progressiveMigration.startRollout('unknown-op', 10)).rejects.toThrow(
        'No feature flag found for operation: unknown-op',
      );
    });

    it('should default to 1% if no percentage specified', async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout(mockOperation.id);

      const status = progressiveMigration.getRolloutStatus(mockOperation.id);
      expect(status?.percentage).toBe(1);
    });
  });

  describe('increaseRollout', () => {
    beforeEach(async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout(mockOperation.id, 20);
    });

    it('should increase rollout by specified increment', async () => {
      await progressiveMigration.increaseRollout(mockOperation.id, 15);

      const status = progressiveMigration.getRolloutStatus(mockOperation.id);

      expect(status?.percentage).toBe(35);
      expect(logger.info).toHaveBeenCalledWith('Increased rollout for test-op-1: 20% -> 35%');
    });

    it('should cap rollout at 100%', async () => {
      await progressiveMigration.increaseRollout(mockOperation.id, 90);

      const status = progressiveMigration.getRolloutStatus(mockOperation.id);

      expect(status?.percentage).toBe(100);
      expect(logger.info).toHaveBeenCalledWith('Increased rollout for test-op-1: 20% -> 100%');
    });

    it('should default to 10% increment', async () => {
      await progressiveMigration.increaseRollout(mockOperation.id);

      const status = progressiveMigration.getRolloutStatus(mockOperation.id);
      expect(status?.percentage).toBe(30);
    });
  });

  describe('pauseRollout', () => {
    it('should disable the flag but preserve percentage', async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout(mockOperation.id, 25);
      await progressiveMigration.pauseRollout(mockOperation.id);

      const status = progressiveMigration.getRolloutStatus(mockOperation.id);

      expect(status?.enabled).toBe(false);
      expect(status?.percentage).toBe(25); // Percentage preserved
      expect(logger.warn).toHaveBeenCalledWith('Paused rollout for test-op-1 at 25%');
    });
  });

  describe('rollbackOperation', () => {
    it('should completely disable and reset operation', async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout(mockOperation.id, 50);
      await progressiveMigration.rollbackOperation(mockOperation.id);

      const status = progressiveMigration.getRolloutStatus(mockOperation.id);

      expect(status?.enabled).toBe(false);
      expect(status?.percentage).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('Rolled back operation: test-op-1');
    });
  });

  describe('enableForSegments', () => {
    it('should enable operation for specific segments', () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      progressiveMigration.enableForSegments(mockOperation.id, ['beta', 'internal']);

      const status = progressiveMigration.getRolloutStatus(mockOperation.id);

      expect(status?.enabled).toBe(true);
      expect(status?.segments).toEqual(['beta', 'internal']);
      expect(logger.info).toHaveBeenCalledWith('Enabled test-op-1 for segments: beta, internal');
    });
  });

  describe('getRolloutStatus', () => {
    it('should return null for non-existent operations', () => {
      const status = progressiveMigration.getRolloutStatus('unknown-op');
      expect(status).toBeNull();
    });

    it('should return complete status information', async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout(mockOperation.id, 75);
      progressiveMigration.enableForSegments(mockOperation.id, ['premium']);

      const status = progressiveMigration.getRolloutStatus(mockOperation.id);

      expect(status).toEqual({
        enabled: true,
        percentage: 75,
        segments: ['premium'],
      });
    });
  });

  describe('edge cases', () => {
    it('should handle operation lookup by both ID and flag name', async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout(mockOperation.id, 30);

      // Should work with operation ID
      const statusById = progressiveMigration.getRolloutStatus(mockOperation.id);
      expect(statusById?.percentage).toBe(30);

      // Should also work if someone passes the full flag name
      const statusByFlag = progressiveMigration.getRolloutStatus('migration.TestOperation');
      expect(statusByFlag?.percentage).toBe(30);
    });

    it('should handle hash collisions gracefully', async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout(mockOperation.id, 50);

      // Test with many different user IDs
      const results = new Map<string, boolean>();
      for (let i = 0; i < 1000; i++) {
        const userId = `user-${i}`;
        const result = progressiveMigration.shouldUseMigratedQuery(mockOperation.id, { userId });
        results.set(userId, result);
      }

      // Should have roughly 50% true/false
      const trueCount = Array.from(results.values()).filter((v) => v).length;
      expect(trueCount).toBeGreaterThan(400);
      expect(trueCount).toBeLessThan(600);

      // Each user should always get same result
      for (const [userId, expectedResult] of results) {
        const result = progressiveMigration.shouldUseMigratedQuery(mockOperation.id, { userId });
        expect(result).toBe(expectedResult);
      }
    });

    it('should handle percentage boundaries correctly', async () => {
      progressiveMigration.createFeatureFlag(mockOperation);

      // Test 0%
      await progressiveMigration.startRollout(mockOperation.id, 0);
      for (let i = 0; i < 100; i++) {
        const result = progressiveMigration.shouldUseMigratedQuery(mockOperation.id, {
          userId: `user-${i}`,
        });
        expect(result).toBe(false);
      }

      // Test 100%
      await progressiveMigration.increaseRollout(mockOperation.id, 100);
      for (let i = 0; i < 100; i++) {
        const result = progressiveMigration.shouldUseMigratedQuery(mockOperation.id, {
          userId: `user-${i}`,
        });
        expect(result).toBe(true);
      }
    });
  });

  describe('multiple operations', () => { type: 'query',
    it('should manage multiple operations independently', async () => {
      const operation2 = { ...mockOperation, id: 'test-op-2', name: 'TestOperation2' };

      progressiveMigration.createFeatureFlag(mockOperation);
      progressiveMigration.createFeatureFlag(operation2);

      await progressiveMigration.startRollout(mockOperation.id, 25);
      await progressiveMigration.startRollout(operation2.id, 75);

      const status1 = progressiveMigration.getRolloutStatus(mockOperation.id);
      const status2 = progressiveMigration.getRolloutStatus(operation2.id);

      expect(status1?.percentage).toBe(25);
      expect(status2?.percentage).toBe(75);
    });
  });
});
