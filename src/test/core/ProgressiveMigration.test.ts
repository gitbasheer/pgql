import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProgressiveMigration } from '../../core/safety/ProgressiveMigration.js';
import { GraphQLOperation } from '../../types/index.js';

describe('ProgressiveMigration', () => {
  let progressiveMigration: ProgressiveMigration;

  beforeEach(() => {
    progressiveMigration = new ProgressiveMigration();
  });

  describe('createFeatureFlag', () => {
    const mockOperation: GraphQLOperation = {
      id: 'op1',
      type: 'query',
      name: 'GetUser',
      ast: {} as any,
      source: 'query GetUser { user { id name } }',
      file: 'user.ts',
      line: 1,
      column: 1,
      variables: [],
      fragments: [],
      directives: [],
    };

    it('should create feature flag with correct defaults', () => {
      const flag = progressiveMigration.createFeatureFlag(mockOperation);

      expect(flag.name).toBe('migration.GetUser');
      expect(flag.operation).toBe('op1');
      expect(flag.enabled).toBe(false);
      expect(flag.rolloutPercentage).toBe(0);
      expect(flag.enabledSegments).toEqual([]);
      expect(flag.fallbackBehavior).toBe('old');
    });

    it('should handle operations with special characters in names', () => {
      const specialOperation: GraphQLOperation = {
        ...mockOperation,
        name: 'Get-User_Data',
        id: 'op-special',
      };

      const flag = progressiveMigration.createFeatureFlag(specialOperation);

      expect(flag.name).toBe('migration.Get-User_Data');
      expect(flag.operation).toBe('op-special');
    });

    it('should create unique flags for different operations', () => { type: 'query',
      const operation1: GraphQLOperation = {
        ...mockOperation,
        name: 'GetUser',
        id: 'op1',
      };

      const operation2: GraphQLOperation = { type: 'query',
        ...mockOperation,
        name: 'GetPost',
        id: 'op2',
      };

      const flag1 = progressiveMigration.createFeatureFlag(operation1);
      const flag2 = progressiveMigration.createFeatureFlag(operation2);

      expect(flag1.name).toBe('migration.GetUser');
      expect(flag2.name).toBe('migration.GetPost');
      expect(flag1.operation).toBe('op1');
      expect(flag2.operation).toBe('op2');
    });
  });

  describe('shouldUseMigratedQuery', () => {
    const mockOperation: GraphQLOperation = {
      id: 'op1',
      type: 'query',
      name: 'GetUser',
      ast: {} as any,
      source: 'query GetUser { user { id name } }',
      file: 'user.ts',
      line: 1,
      column: 1,
      variables: [],
      fragments: [],
      directives: [],
    };

    beforeEach(() => {
      progressiveMigration.createFeatureFlag(mockOperation);
    });

    it('should return false when flag is disabled', () => {
      const result = progressiveMigration.shouldUseMigratedQuery('op1', {});

      expect(result).toBe(false);
    });

    it('should return false when flag does not exist', () => {
      const result = progressiveMigration.shouldUseMigratedQuery('nonexistent', {});

      expect(result).toBe(false);
    });

    it('should return true when flag is enabled with 100% rollout', async () => {
      await progressiveMigration.startRollout('op1', 100);

      const result = progressiveMigration.shouldUseMigratedQuery('op1', {});

      expect(result).toBe(true);
    });

    it('should respect segment-based rollout', async () => {
      await progressiveMigration.startRollout('op1', 50);
      progressiveMigration.enableForSegments('op1', ['beta-users']);

      const betaResult = progressiveMigration.shouldUseMigratedQuery('op1', {
        segment: 'beta-users',
      });
      const regularResult = progressiveMigration.shouldUseMigratedQuery('op1', {
        segment: 'regular-users',
      });

      expect(betaResult).toBe(true);
      expect(regularResult).toBe(false);
    });

    it('should handle percentage-based rollout consistently', async () => {
      await progressiveMigration.startRollout('op1', 50);

      const userId = 'consistent-user-id';
      const result1 = progressiveMigration.shouldUseMigratedQuery('op1', { userId });
      const result2 = progressiveMigration.shouldUseMigratedQuery('op1', { userId });

      expect(result1).toBe(result2); // Should be consistent for same user
    });

    it('should handle different percentage rollouts', async () => {
      await progressiveMigration.startRollout('op1', 0);
      let result = progressiveMigration.shouldUseMigratedQuery('op1', { userId: 'test-user' });
      expect(result).toBe(false);

      await progressiveMigration.increaseRollout('op1', 100);
      result = progressiveMigration.shouldUseMigratedQuery('op1', { userId: 'test-user' });
      expect(result).toBe(true);
    });
  });

  describe('startRollout', () => {
    const mockOperation: GraphQLOperation = {
      id: 'op1',
      type: 'query',
      name: 'GetUser',
      ast: {} as any,
      source: 'query GetUser { user { id name } }',
      file: 'user.ts',
      line: 1,
      column: 1,
      variables: [],
      fragments: [],
      directives: [],
    };

    beforeEach(() => {
      progressiveMigration.createFeatureFlag(mockOperation);
    });

    it('should start rollout with specified percentage', async () => {
      await progressiveMigration.startRollout('op1', 25);

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.enabled).toBe(true);
      expect(status?.percentage).toBe(25);
    });

    it('should start rollout with default percentage', async () => {
      await progressiveMigration.startRollout('op1');

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.enabled).toBe(true);
      expect(status?.percentage).toBe(1);
    });

    it('should handle invalid operation ID', async () => {
      await expect(progressiveMigration.startRollout('nonexistent')).rejects.toThrow(
        'Feature flag not found: nonexistent',
      );
    });

    it('should handle invalid percentage', async () => {
      await expect(progressiveMigration.startRollout('op1', -5)).rejects.toThrow(
        'Invalid rollout percentage: -5',
      );

      await expect(progressiveMigration.startRollout('op1', 150)).rejects.toThrow(
        'Invalid rollout percentage: 150',
      );
    });
  });

  describe('increaseRollout', () => {
    const mockOperation: GraphQLOperation = {
      id: 'op1',
      type: 'query',
      name: 'GetUser',
      ast: {} as any,
      source: 'query GetUser { user { id name } }',
      file: 'user.ts',
      line: 1,
      column: 1,
      variables: [],
      fragments: [],
      directives: [],
    };

    beforeEach(async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout('op1', 10);
    });

    it('should increase rollout percentage', async () => {
      await progressiveMigration.increaseRollout('op1', 25);

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.percentage).toBe(35); // 10 + 25
    });

    it('should use default increment', async () => {
      await progressiveMigration.increaseRollout('op1');

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.percentage).toBe(20); // 10 + 10 (default)
    });

    it('should cap at 100%', async () => {
      await progressiveMigration.increaseRollout('op1', 95);

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.percentage).toBe(100); // Capped at 100
    });

    it('should handle invalid operation ID', async () => {
      await expect(progressiveMigration.increaseRollout('nonexistent', 10)).rejects.toThrow(
        'Feature flag not found: nonexistent',
      );
    });
  });

  describe('pauseRollout', () => {
    const mockOperation: GraphQLOperation = {
      id: 'op1',
      type: 'query',
      name: 'GetUser',
      ast: {} as any,
      source: 'query GetUser { user { id name } }',
      file: 'user.ts',
      line: 1,
      column: 1,
      variables: [],
      fragments: [],
      directives: [],
    };

    beforeEach(async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout('op1', 50);
    });

    it('should pause rollout and disable flag', async () => {
      await progressiveMigration.pauseRollout('op1');

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.enabled).toBe(false);
      expect(status?.percentage).toBe(50); // Percentage preserved
    });

    it('should handle pausing non-existent rollout', async () => {
      await expect(progressiveMigration.pauseRollout('nonexistent')).rejects.toThrow(
        'Feature flag not found: nonexistent',
      );
    });

    it('should handle pausing already paused rollout', async () => {
      await progressiveMigration.pauseRollout('op1');
      await progressiveMigration.pauseRollout('op1'); // Should not throw

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.enabled).toBe(false);
    });
  });

  describe('rollbackOperation', () => {
    const mockOperation: GraphQLOperation = {
      id: 'op1',
      type: 'query',
      name: 'GetUser',
      ast: {} as any,
      source: 'query GetUser { user { id name } }',
      file: 'user.ts',
      line: 1,
      column: 1,
      variables: [],
      fragments: [],
      directives: [],
    };

    beforeEach(async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout('op1', 50);
    });

    it('should rollback operation completely', async () => {
      await progressiveMigration.rollbackOperation('op1');

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.enabled).toBe(false);
      expect(status?.percentage).toBe(0);
    });

    it('should handle rollback of non-existent operation', async () => {
      await expect(progressiveMigration.rollbackOperation('nonexistent')).rejects.toThrow(
        'Feature flag not found: nonexistent',
      );
    });
  });

  describe('enableForSegments', () => {
    const mockOperation: GraphQLOperation = {
      id: 'op1',
      type: 'query',
      name: 'GetUser',
      ast: {} as any,
      source: 'query GetUser { user { id name } }',
      file: 'user.ts',
      line: 1,
      column: 1,
      variables: [],
      fragments: [],
      directives: [],
    };

    beforeEach(async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout('op1', 10);
    });

    it('should enable for specific segments', () => {
      progressiveMigration.enableForSegments('op1', ['beta-users']);

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.segments).toContain('beta-users');
      expect(status?.enabled).toBe(true);
    });

    it('should handle multiple segments', () => {
      progressiveMigration.enableForSegments('op1', ['beta-users', 'premium-users']);

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.segments).toContain('beta-users');
      expect(status?.segments).toContain('premium-users');
    });

    it('should replace existing segments', () => {
      progressiveMigration.enableForSegments('op1', ['beta-users']);
      progressiveMigration.enableForSegments('op1', ['premium-users']);

      const status = progressiveMigration.getRolloutStatus('op1');
      expect(status?.segments).not.toContain('beta-users');
      expect(status?.segments).toContain('premium-users');
    });

    it('should handle invalid operation ID', () => {
      expect(() => progressiveMigration.enableForSegments('nonexistent', ['beta-users'])).toThrow(
        'Feature flag not found: nonexistent',
      );
    });
  });

  describe('getRolloutStatus', () => {
    const mockOperation: GraphQLOperation = {
      id: 'op1',
      type: 'query',
      name: 'GetUser',
      ast: {} as any,
      source: 'query GetUser { user { id name } }',
      file: 'user.ts',
      line: 1,
      column: 1,
      variables: [],
      fragments: [],
      directives: [],
    };

    it('should return status for existing operation', async () => {
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout('op1', 25);
      progressiveMigration.enableForSegments('op1', ['beta-users']);

      const status = progressiveMigration.getRolloutStatus('op1');

      expect(status).toBeDefined();
      expect(status?.enabled).toBe(true);
      expect(status?.percentage).toBe(25);
      expect(status?.segments).toContain('beta-users');
    });

    it('should return null for non-existent operation', () => {
      const status = progressiveMigration.getRolloutStatus('nonexistent');

      expect(status).toBeNull();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete rollout lifecycle', async () => {
      const mockOperation: GraphQLOperation = {
        id: 'op1',
        type: 'query',
        name: 'GetUser',
        ast: {} as any,
        source: 'query GetUser { user { id name } }',
        file: 'user.ts',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: [],
      };

      // Create flag
      const flag = progressiveMigration.createFeatureFlag(mockOperation);
      expect(flag.enabled).toBe(false);

      // Start rollout at 1%
      await progressiveMigration.startRollout('op1', 1);
      expect(progressiveMigration.getRolloutStatus('op1')?.percentage).toBe(1);

      // Gradually increase rollout
      await progressiveMigration.increaseRollout('op1', 9);
      await progressiveMigration.increaseRollout('op1', 15);
      await progressiveMigration.increaseRollout('op1', 25);
      expect(progressiveMigration.getRolloutStatus('op1')?.percentage).toBe(50);

      // Enable for beta users
      progressiveMigration.enableForSegments('op1', ['beta-users']);
      expect(progressiveMigration.shouldUseMigratedQuery('op1', { segment: 'beta-users' })).toBe(
        true,
      );

      // Complete rollout
      await progressiveMigration.increaseRollout('op1', 50);
      expect(progressiveMigration.shouldUseMigratedQuery('op1', { userId: 'any-user' })).toBe(true);

      // Rollback operation
      await progressiveMigration.rollbackOperation('op1');
      expect(progressiveMigration.getRolloutStatus('op1')?.enabled).toBe(false);
      expect(progressiveMigration.shouldUseMigratedQuery('op1', { userId: 'any-user' })).toBe(
        false,
      );
    });

    it('should handle emergency rollback scenario', async () => {
      const mockOperation: GraphQLOperation = {
        id: 'op1',
        type: 'query',
        name: 'GetUser',
        ast: {} as any,
        source: 'query GetUser { user { id name } }',
        file: 'user.ts',
        line: 1,
        column: 1,
        variables: [],
        fragments: [],
        directives: [],
      };

      // Start rollout at 50%
      progressiveMigration.createFeatureFlag(mockOperation);
      await progressiveMigration.startRollout('op1', 50);

      // Simulate emergency - immediate rollback
      await progressiveMigration.rollbackOperation('op1');
      expect(progressiveMigration.getRolloutStatus('op1')?.percentage).toBe(0);
      expect(progressiveMigration.getRolloutStatus('op1')?.enabled).toBe(false);
    });

    it('should handle multiple operations with different rollout states', async () => {
      const operations = [
        {
          id: 'op1',
          type: 'query' as const,
          name: 'GetUser',
          ast: {} as any,
          source: 'query GetUser { user { id name } }',
          file: 'user.ts',
          line: 1,
          column: 1,
          variables: [],
          fragments: [],
          directives: [],
        },
        {
          id: 'op2',
          type: 'mutation' as const,
          name: 'CreateUser',
          ast: {} as any,
          source:
            'mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id } }',
          file: 'user.ts',
          line: 10,
          column: 1,
          variables: [{ id: 'generated-id', name: 'input', type: 'CreateUserInput!' }],
          fragments: [],
          directives: [],
        },
      ];

      // Create flags for both operations
      operations.forEach((op) => progressiveMigration.createFeatureFlag(op));

      // Different rollout states
      await progressiveMigration.startRollout('op1', 100); // Full rollout
      await progressiveMigration.startRollout('op2', 25); // Partial rollout

      // Check states
      expect(progressiveMigration.shouldUseMigratedQuery('op1', { userId: 'test' })).toBe(true);

      const op2Result = progressiveMigration.shouldUseMigratedQuery('op2', { userId: 'test' });
      expect(typeof op2Result).toBe('boolean'); // Should be consistent for same user

      // Rollback one operation
      await progressiveMigration.rollbackOperation('op1');
      expect(progressiveMigration.shouldUseMigratedQuery('op1', { userId: 'test' })).toBe(false);

      // Other should still work
      const op2ResultAfter = progressiveMigration.shouldUseMigratedQuery('op2', { userId: 'test' });
      expect(op2ResultAfter).toBe(op2Result); // Should be consistent
    });
  });
});
