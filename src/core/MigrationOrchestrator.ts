import { MigrationConfig, GraphQLOperation, HealthStatus } from '../types';
import { ConfidenceScorer } from './analyzer/ConfidenceScorer';
import { ProgressiveMigration } from './safety/ProgressiveMigration';
import { RollbackSystem } from './safety/Rollback';
import { HealthCheckSystem } from './safety/HealthCheck';
import { logger } from '../utils/logger';
import { ExistingScriptsAdapter } from '../adapters/ExistingScriptsAdapter';

export class MigrationOrchestrator {
  private confidenceScorer: ConfidenceScorer;
  private progressiveMigration: ProgressiveMigration;
  private rollbackSystem: RollbackSystem;
  private healthCheck: HealthCheckSystem;
  private scriptsAdapter: ExistingScriptsAdapter;

  constructor(private config: MigrationConfig) {
    this.confidenceScorer = new ConfidenceScorer();
    this.progressiveMigration = new ProgressiveMigration();
    this.rollbackSystem = new RollbackSystem(this.progressiveMigration);
    this.healthCheck = new HealthCheckSystem();
    this.scriptsAdapter = new ExistingScriptsAdapter();
  }

  async analyze(source: string): Promise<{
    operations: GraphQLOperation[];
    summary: {
      total: number;
      queries: number;
      mutations: number;
      subscriptions: number;
    };
  }> {
    logger.info(`Starting analysis of ${source}`);
    
    // Use existing extraction scripts through adapter
    const operations = await this.scriptsAdapter.extractOperations(source);
    
    // Add confidence scoring to each operation
    for (const operation of operations) {
      const mockChange = {
        file: operation.file,
        operation,
        pattern: 'unknown',
        oldQuery: operation.source,
        newQuery: operation.source,
        transformations: []
      };
      
      const confidence = this.confidenceScorer.scoreTransformation(mockChange);
      operation.confidence = confidence;
    }

    const summary = {
      total: operations.length,
      queries: operations.filter(op => op.type === 'query').length,
      mutations: operations.filter(op => op.type === 'mutation').length,
      subscriptions: operations.filter(op => op.type === 'subscription').length
    };

    logger.info(`Analysis complete: ${summary.total} operations found`);
    
    return { operations, summary };
  }

  async transform(options: {
    source: string;
    minConfidence: number;
    dryRun: boolean;
  }): Promise<{
    transformed: number;
    automatic: number;
    semiAutomatic: number;
    manual: number;
  }> {
    logger.info('Starting transformation process');
    
    const operations = await this.scriptsAdapter.extractOperations(options.source);
    const results = {
      transformed: 0,
      automatic: 0,
      semiAutomatic: 0,
      manual: 0
    };

    for (const operation of operations) {
      // Use existing transformation scripts
      const changes = await this.scriptsAdapter.transformOperation(operation);
      
      for (const change of changes) {
        const confidence = this.confidenceScorer.scoreTransformation(change);
        change.confidence = confidence;
        
        if (confidence.score >= options.minConfidence && !options.dryRun) {
          await this.scriptsAdapter.applyChange(change);
          results.transformed++;
        }
        
        switch (confidence.category) {
          case 'automatic':
            results.automatic++;
            break;
          case 'semi-automatic':
            results.semiAutomatic++;
            break;
          case 'manual':
            results.manual++;
            break;
        }
      }
    }

    logger.info(`Transformation complete: ${results.transformed} operations transformed`);
    
    return results;
  }

  async validate(options: {
    source: string;
    schemaPath: string;
  }): Promise<{
    valid: boolean;
    errors: Array<{
      operation: string;
      message: string;
    }>;
  }> {
    logger.info('Starting validation');
    
    // Use existing validation scripts
    const validationResults = await this.scriptsAdapter.validateOperations(
      options.source,
      options.schemaPath
    );
    
    return validationResults;
  }

  async applyOperation(operationName: string, rolloutPercentage: number): Promise<void> {
    logger.info(`Applying migration for ${operationName} at ${rolloutPercentage}%`);
    
    // Find the operation
    const operations = await this.scriptsAdapter.extractOperations(this.config.source.include[0]);
    const operation = operations.find(op => op.name === operationName);
    
    if (!operation) {
      throw new Error(`Operation not found: ${operationName}`);
    }

    // Create rollback plan
    await this.rollbackSystem.createRollbackPlan([operation]);
    
    // Create feature flag
    this.progressiveMigration.createFeatureFlag(operation);
    
    // Start rollout
    await this.progressiveMigration.startRollout(operation.id, rolloutPercentage);
    
    logger.info(`Rollout started for ${operationName}`);
  }

  async applyAll(rolloutPercentage: number): Promise<{ count: number }> {
    logger.info(`Applying all migrations at ${rolloutPercentage}%`);
    
    const operations = await this.scriptsAdapter.extractOperations(this.config.source.include[0]);
    
    // Create rollback plan for all operations
    await this.rollbackSystem.createRollbackPlan(operations);
    
    let count = 0;
    for (const operation of operations) {
      this.progressiveMigration.createFeatureFlag(operation);
      await this.progressiveMigration.startRollout(operation.id, rolloutPercentage);
      count++;
    }
    
    return { count };
  }

  async getHealth(operationName?: string): Promise<Record<string, HealthStatus> | HealthStatus> {
    if (operationName) {
      // Mock operation for health check
      const operation: GraphQLOperation = {
        id: operationName,
        name: operationName,
        type: 'query',
        ast: {} as any,
        source: '',
        file: '',
        line: 0,
        column: 0,
        variables: [],
        fragments: [],
        directives: []
      };
      
      const health = await this.healthCheck.performHealthCheck(operation);
      return health;
    }
    
    // Get health for all operations
    const operations = await this.scriptsAdapter.extractOperations(this.config.source.include[0]);
    const healthStatuses: Record<string, HealthStatus> = {};
    
    for (const operation of operations) {
      healthStatuses[operation.name] = await this.healthCheck.performHealthCheck(operation);
    }
    
    return healthStatuses;
  }

  async rollbackOperation(operationName: string, reason: string): Promise<void> {
    logger.warn(`Rolling back ${operationName}: ${reason}`);
    
    const operations = await this.scriptsAdapter.extractOperations(this.config.source.include[0]);
    const operation = operations.find(op => op.name === operationName);
    
    if (!operation) {
      throw new Error(`Operation not found: ${operationName}`);
    }
    
    await this.rollbackSystem.rollbackOperation(operation.id);
  }

  async rollbackAll(strategy: 'immediate' | 'gradual', reason: string): Promise<{ count: number }> {
    logger.warn(`Rolling back all operations: ${reason}`);
    
    const operations = await this.scriptsAdapter.extractOperations(this.config.source.include[0]);
    const plan = await this.rollbackSystem.createRollbackPlan(operations, strategy);
    
    await this.rollbackSystem.executeRollback(plan.id);
    
    return { count: operations.length };
  }
}