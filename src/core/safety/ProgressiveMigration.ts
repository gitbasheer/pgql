import { FeatureFlag, GraphQLOperation } from '../../types';
import { logger } from '../../utils/logger.js';

export class ProgressiveMigration {
  private featureFlags: Map<string, FeatureFlag> = new Map();
  private rolloutState: Map<string, number> = new Map();

  createFeatureFlag(operation: GraphQLOperation): FeatureFlag {
    const flagName = `migration.${operation.name}`;
    
    const flag: FeatureFlag = {
      name: flagName,
      operation: operation.id,
      enabled: false,
      rolloutPercentage: 0,
      enabledSegments: [],
      fallbackBehavior: 'old'
    };

    this.featureFlags.set(flagName, flag);
    logger.info(`Created feature flag: ${flagName}`);
    
    return flag;
  }

  shouldUseMigratedQuery(
    operationId: string, 
    context: { userId?: string; segment?: string }
  ): boolean {
    const flag = this.getFlag(operationId);
    
    if (!flag || !flag.enabled) {
      return false;
    }

    // Check segment-based rollout
    if (context.segment && flag.enabledSegments.length > 0) {
      return flag.enabledSegments.includes(context.segment);
    }

    // Check percentage-based rollout
    if (flag.rolloutPercentage < 100) {
      return this.isInRolloutPercentage(operationId, context.userId);
    }

    return true;
  }

  async startRollout(operationId: string, initialPercentage: number = 1): Promise<void> {
    const flag = this.getFlag(operationId);
    
    if (!flag) {
      throw new Error(`No feature flag found for operation: ${operationId}`);
    }

    flag.enabled = true;
    flag.rolloutPercentage = initialPercentage;
    this.rolloutState.set(operationId, initialPercentage);

    logger.info(`Started rollout for ${operationId} at ${initialPercentage}%`);
  }

  async increaseRollout(operationId: string, increment: number = 10): Promise<void> {
    const flag = this.getFlag(operationId);
    
    if (!flag) {
      throw new Error(`No feature flag found for operation: ${operationId}`);
    }

    const currentPercentage = flag.rolloutPercentage;
    const newPercentage = Math.min(100, currentPercentage + increment);
    
    flag.rolloutPercentage = newPercentage;
    this.rolloutState.set(operationId, newPercentage);

    logger.info(`Increased rollout for ${operationId}: ${currentPercentage}% -> ${newPercentage}%`);
  }

  async pauseRollout(operationId: string): Promise<void> {
    const flag = this.getFlag(operationId);
    
    if (!flag) {
      throw new Error(`No feature flag found for operation: ${operationId}`);
    }

    const previousPercentage = flag.rolloutPercentage;
    flag.enabled = false;
    
    logger.warn(`Paused rollout for ${operationId} at ${previousPercentage}%`);
  }

  async rollbackOperation(operationId: string): Promise<void> {
    const flag = this.getFlag(operationId);
    
    if (!flag) {
      throw new Error(`No feature flag found for operation: ${operationId}`);
    }

    flag.enabled = false;
    flag.rolloutPercentage = 0;
    this.rolloutState.delete(operationId);

    logger.warn(`Rolled back operation: ${operationId}`);
  }

  enableForSegments(operationId: string, segments: string[]): void {
    const flag = this.getFlag(operationId);
    
    if (!flag) {
      throw new Error(`No feature flag found for operation: ${operationId}`);
    }

    flag.enabledSegments = segments;
    flag.enabled = true;
    
    logger.info(`Enabled ${operationId} for segments: ${segments.join(', ')}`);
  }

  getRolloutStatus(operationId: string): {
    enabled: boolean;
    percentage: number;
    segments: string[];
  } | null {
    const flag = this.getFlag(operationId);
    
    if (!flag) {
      return null;
    }

    return {
      enabled: flag.enabled,
      percentage: flag.rolloutPercentage,
      segments: flag.enabledSegments
    };
  }

  private getFlag(operationId: string): FeatureFlag | undefined {
    // Try both with and without prefix
    let flag = this.featureFlags.get(`migration.${operationId}`);
    if (!flag) {
      // Check if operationId is actually the operation name
      for (const [key, value] of this.featureFlags.entries()) {
        if (value.operation === operationId) {
          flag = value;
          break;
        }
      }
    }
    return flag;
  }

  private isInRolloutPercentage(operationId: string, userId?: string): boolean {
    if (!userId) {
      // Random assignment for anonymous users
      return Math.random() * 100 < (this.rolloutState.get(operationId) || 0);
    }

    // Consistent assignment based on user ID
    const hash = this.hashUserId(userId, operationId);
    const percentage = (hash % 100) + 1;
    
    return percentage <= (this.rolloutState.get(operationId) || 0);
  }

  private hashUserId(userId: string, salt: string): number {
    // Simple hash function for consistent assignment
    const str = userId + salt;
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash);
  }
}