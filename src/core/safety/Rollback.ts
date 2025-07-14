import { RollbackPlan, Checkpoint, GraphQLOperation } from '../../types';
import { logger } from '../../utils/logger';
import { ProgressiveMigration } from './ProgressiveMigration';

export class RollbackSystem {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private rollbackPlans: Map<string, RollbackPlan> = new Map();
  
  constructor(private progressiveMigration: ProgressiveMigration) {}

  async createCheckpoint(operations: GraphQLOperation[]): Promise<Checkpoint> {
    const checkpoint: Checkpoint = {
      id: this.generateCheckpointId(),
      timestamp: new Date(),
      state: await this.captureCurrentState(operations),
      operations: operations.map(op => op.id)
    };

    this.checkpoints.set(checkpoint.id, checkpoint);
    logger.info(`Created checkpoint: ${checkpoint.id}`);
    
    return checkpoint;
  }

  async createRollbackPlan(
    operations: GraphQLOperation[],
    strategy: 'immediate' | 'gradual' = 'immediate'
  ): Promise<RollbackPlan> {
    const checkpoint = await this.createCheckpoint(operations);
    
    const plan: RollbackPlan = {
      id: this.generatePlanId(),
      operations: operations.map(op => op.id),
      checkpoints: [checkpoint],
      strategy
    };

    this.rollbackPlans.set(plan.id, plan);
    logger.info(`Created rollback plan: ${plan.id} with strategy: ${strategy}`);
    
    return plan;
  }

  async executeRollback(planId: string): Promise<void> {
    const plan = this.rollbackPlans.get(planId);
    
    if (!plan) {
      throw new Error(`Rollback plan not found: ${planId}`);
    }

    logger.warn(`Executing rollback for plan: ${planId}`);

    try {
      if (plan.strategy === 'immediate') {
        await this.executeImmediateRollback(plan);
      } else {
        await this.executeGradualRollback(plan);
      }
      
      logger.info(`Rollback completed successfully for plan: ${planId}`);
    } catch (error) {
      logger.error(`Rollback failed for plan: ${planId}`, error);
      throw error;
    }
  }

  async rollbackOperation(operationId: string): Promise<void> {
    logger.warn(`Rolling back single operation: ${operationId}`);
    
    // Disable the feature flag immediately
    await this.progressiveMigration.rollbackOperation(operationId);
    
    // Find and restore the latest checkpoint for this operation
    const checkpoint = this.findLatestCheckpoint(operationId);
    
    if (checkpoint) {
      await this.restoreFromCheckpoint(checkpoint, [operationId]);
    }
  }

  private async executeImmediateRollback(plan: RollbackPlan): Promise<void> {
    // Disable all operations immediately
    for (const operationId of plan.operations) {
      await this.progressiveMigration.rollbackOperation(operationId);
    }

    // Restore from the latest checkpoint
    const latestCheckpoint = plan.checkpoints[plan.checkpoints.length - 1];
    await this.restoreFromCheckpoint(latestCheckpoint, plan.operations);
  }

  private async executeGradualRollback(plan: RollbackPlan): Promise<void> {
    // Gradually reduce rollout percentage
    for (const operationId of plan.operations) {
      const status = this.progressiveMigration.getRolloutStatus(operationId);
      
      if (status && status.enabled) {
        // Reduce by 50% initially
        const newPercentage = Math.floor(status.percentage / 2);
        await this.progressiveMigration.increaseRollout(operationId, -newPercentage);
        
        // Wait for monitoring
        await this.delay(5000);
        
        // Then disable completely
        await this.progressiveMigration.rollbackOperation(operationId);
      }
    }
  }

  private async captureCurrentState(operations: GraphQLOperation[]): Promise<Record<string, any>> {
    const state: Record<string, any> = {};
    
    for (const operation of operations) {
      const status = this.progressiveMigration.getRolloutStatus(operation.id);
      state[operation.id] = {
        rolloutStatus: status,
        timestamp: new Date().toISOString()
      };
    }
    
    return state;
  }

  private async restoreFromCheckpoint(checkpoint: Checkpoint, operations: string[]): Promise<void> {
    logger.info(`Restoring from checkpoint: ${checkpoint.id}`);
    
    for (const operationId of operations) {
      const state = checkpoint.state[operationId];
      
      if (state && state.rolloutStatus) {
        // Restore the previous rollout state
        if (state.rolloutStatus.enabled) {
          await this.progressiveMigration.startRollout(
            operationId, 
            state.rolloutStatus.percentage
          );
          
          if (state.rolloutStatus.segments.length > 0) {
            this.progressiveMigration.enableForSegments(
              operationId, 
              state.rolloutStatus.segments
            );
          }
        }
      }
    }
  }

  private findLatestCheckpoint(operationId: string): Checkpoint | null {
    let latest: Checkpoint | null = null;
    
    for (const checkpoint of this.checkpoints.values()) {
      if (checkpoint.operations.includes(operationId)) {
        if (!latest || checkpoint.timestamp > latest.timestamp) {
          latest = checkpoint;
        }
      }
    }
    
    return latest;
  }

  private generateCheckpointId(): string {
    return `checkpoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generatePlanId(): string {
    return `rollback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}