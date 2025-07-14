import { MigrationConfig, GraphQLOperation } from '../../types';
import { ExtractedQuery } from '../extraction/types/query.types';
import { ExtractionResult as ExtractResult } from '../extraction/types/extraction.types';
import { UnifiedExtractor } from '../extraction/engine/UnifiedExtractor';
import { SchemaValidator } from '../validator/SchemaValidator';
import { QueryTransformer, TransformationRule } from '../transformer/QueryTransformer';
import { SchemaDeprecationAnalyzer } from '../analyzer/SchemaDeprecationAnalyzer';
import { ConfidenceScorer } from '../analyzer/ConfidenceScorer';
import { ProgressiveMigration } from '../safety/ProgressiveMigration';
import { HealthCheckSystem } from '../safety/HealthCheck';
import { RollbackSystem } from '../safety/Rollback';
import { ASTCodeApplicator } from '../applicator/ASTCodeApplicator';
import { SourceMapper } from '../extraction/utils/SourceMapper';
import { 
  ResponseValidationService, 
  ResponseValidationConfig,
  ValidationReport as ResponseValidationReport,
  EndpointConfig 
} from '../validator/index';
import { logger } from '../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse, DocumentNode } from 'graphql';

interface TransformationData {
  operation: ExtractedQuery;
  result: any;
  confidence: { score: number; risks?: string[] };
}

interface TransformationsByFile {
  operationId: string;
  operation: ExtractedQuery;
  result: any;
  confidence: { score: number };
}

export interface PipelineOptions {
  minConfidence: number;
  dryRun: boolean;
  interactive: boolean;
  enableSafety: boolean;
  rolloutPercentage: number;
  cache?: boolean;
  responseValidation?: {
    enabled: boolean;
    endpoint: string;
    authToken?: string;
    generateAlignments?: boolean;
    setupABTest?: boolean;
  };
}

export interface ExtractionResult {
  operations: ExtractedQuery[];
  files: string[];
  summary: {
    queries: number;
    mutations: number;
    subscriptions: number;
  };
}

export interface ValidationResult {
  hasErrors: boolean;
  errors: Array<{
    operation: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    operation: string;
    message: string;
  }>;
}

export interface TransformationResult {
  transformed: Array<{
    operation: ExtractedQuery;
    transformation: any;
    confidence: number;
  }>;
  automatic: number;
  semiAutomatic: number;
  manual: number;
  skipped: number;
}

export interface ApplicationResult {
  modifiedFiles: string[];
  operationsUpdated: number;
  linesAdded: number;
  linesRemoved: number;
}

export class UnifiedMigrationPipeline {
  private extractor: UnifiedExtractor;
  private validator: SchemaValidator;
  private deprecationAnalyzer: SchemaDeprecationAnalyzer;
  private confidenceScorer: ConfidenceScorer;
  private progressiveMigration: ProgressiveMigration;
  private rollbackSystem: RollbackSystem;
  private applicator: ASTCodeApplicator;
  private sourceMapper: SourceMapper;
  private responseValidator?: ResponseValidationService;
  
  private extractedOperations: ExtractedQuery[] = [];
  private transformations: Map<string, TransformationData> = new Map();
  private applicationResults: Map<string, any> = new Map();
  private responseValidationReport?: ResponseValidationReport;

  constructor(
    private config: MigrationConfig,
    private options: PipelineOptions
  ) {
    // Initialize all components
    this.extractor = new UnifiedExtractor({
      directory: config.source.include[0],
      patterns: ['**/*.{js,jsx,ts,tsx}'],
      preserveSourceAST: true,
      resolveFragments: true,
      resolveNames: true,
      detectVariants: true,
      cache: this.options.cache !== false  // Default to true if not specified
    });
    this.validator = new SchemaValidator();
    this.deprecationAnalyzer = new SchemaDeprecationAnalyzer();
    this.confidenceScorer = new ConfidenceScorer();
    this.progressiveMigration = new ProgressiveMigration();
    this.rollbackSystem = new RollbackSystem(this.progressiveMigration);
    this.applicator = new ASTCodeApplicator();
    this.sourceMapper = new SourceMapper();
  }

  async extract(): Promise<ExtractionResult> {
    logger.info('Starting extraction phase...');
    
    const results = await this.extractor.extract();

    this.extractedOperations = results.queries;
    
    // Build source mapping
    for (const operation of results.queries) {
      if (operation.sourceAST) {
        this.sourceMapper.register(operation.id, operation.sourceAST);
      }
    }

    const summary = {
      queries: results.queries.filter((op: ExtractedQuery) => op.type === 'query').length,
      mutations: results.queries.filter((op: ExtractedQuery) => op.type === 'mutation').length,
      subscriptions: results.queries.filter((op: ExtractedQuery) => op.type === 'subscription').length
    };

    logger.info(`Extraction complete: ${results.queries.length} operations found`);
    
    // Get unique files
    const files = [...new Set(results.queries.map((q: ExtractedQuery) => q.filePath))];
    
    return {
      operations: results.queries,
      files,
      summary
    };
  }

  async validate(): Promise<ValidationResult> {
    logger.info('Starting validation phase...');
    
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];
    
    // Load schema
    const schemaPath = ('schemaPath' in this.config ? (this.config as any).schemaPath : undefined) || './schema.graphql';
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    const schema = await this.validator.loadSchema(schemaContent);

    // Validate each operation
    for (const operation of this.extractedOperations) {
      try {
        const ast = parse(operation.content);
        const validationErrors = await this.validator.validateOperation(ast, schema);
        
        if (validationErrors.length > 0) {
          validationErrors.forEach(error => {
            errors.push({
              operation: operation.name || operation.id,
              message: error.message,
              severity: 'error'
            });
          });
        }

        // Check for deprecations
        const deprecations = await this.deprecationAnalyzer.analyzeOperation(ast, schema);
        if (deprecations.length > 0) {
          deprecations.forEach(dep => {
            warnings.push({
              operation: operation.name || operation.id,
              message: `Using deprecated field: ${dep.field} - ${dep.reason}`
            });
          });
        }
      } catch (error) {
        errors.push({
          operation: operation.name || operation.id,
          message: `Failed to parse operation: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error'
        });
      }
    }

    logger.info(`Validation complete: ${errors.length} errors, ${warnings.length} warnings`);
    
    return {
      hasErrors: errors.length > 0,
      errors,
      warnings
    };
  }

  async transform(): Promise<TransformationResult> {
    logger.info('Starting transformation phase...');
    
    const results: TransformationResult = {
      transformed: [],
      automatic: 0,
      semiAutomatic: 0,
      manual: 0,
      skipped: 0
    };

    // Load transformation rules from deprecations
    const deprecationPath = './deprecations.json';
    let transformationRules: TransformationRule[] = [];
    
    try {
      const deprecationContent = await fs.readFile(deprecationPath, 'utf-8');
      const deprecations = JSON.parse(deprecationContent);
      transformationRules = this.convertDeprecationsToRules(deprecations);
    } catch (error) {
      logger.warn('No deprecation file found, using default rules');
    }

    // Transform each operation
    for (const operation of this.extractedOperations) {
      try {
        const transformer = new QueryTransformer(transformationRules);
        const transformResult = transformer.transform(operation.content);
        
        // Only process if there are actual changes
        if (transformResult.original !== transformResult.transformed) {
          // Score the transformation
          const confidence = this.confidenceScorer.scoreTransformation({
            file: operation.filePath,
            operation: this.convertToGraphQLOperation(operation),
            pattern: this.detectPattern(transformResult.rules),
            oldQuery: transformResult.original,
            newQuery: transformResult.transformed,
            transformations: transformResult.rules.map(rule => ({
              type: rule.type === 'argument-change' ? 'custom' as const : rule.type,
              description: `${rule.type}: ${rule.from} → ${rule.to}`,
              from: rule.from,
              to: rule.to,
              automated: true
            }))
          });

          // Store transformation
          this.transformations.set(operation.id, {
            operation,
            result: transformResult,
            confidence
          });

          // Categorize based on confidence
          if (confidence.score >= this.options.minConfidence) {
            results.transformed.push({
              operation,
              transformation: transformResult,
              confidence: confidence.score
            });
            results.automatic++;
          } else if (confidence.score >= 70) {
            results.semiAutomatic++;
            if (!this.options.dryRun && this.options.interactive) {
              results.transformed.push({
                operation,
                transformation: transformResult,
                confidence: confidence.score
              });
            }
          } else {
            results.manual++;
          }
        }
      } catch (error) {
        logger.error(`Failed to transform operation ${operation.id}:`, error);
        results.skipped++;
      }
    }

    logger.info(`Transformation complete: ${results.transformed.length} operations transformed`);
    
    return results;
  }

  async apply(): Promise<ApplicationResult> {
    logger.info('Starting application phase...');
    
    const modifiedFiles = new Set<string>();
    let operationsUpdated = 0;
    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;

    // Group transformations by file
    const transformationsByFile = new Map<string, TransformationsByFile[]>();
    
    for (const [operationId, transformation] of this.transformations) {
      const { operation, result, confidence } = transformation;
      
      // Skip low confidence transformations unless in interactive mode
      if (confidence.score < this.options.minConfidence && !this.options.interactive) {
        continue;
      }

      if (!transformationsByFile.has(operation.filePath)) {
        transformationsByFile.set(operation.filePath, []);
      }
      
      transformationsByFile.get(operation.filePath)!.push({
        operationId,
        operation,
        result,
        confidence
      });
    }

    // Apply transformations file by file
    for (const [filePath, transformations] of transformationsByFile) {
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        let modifiedContent = fileContent;
        let fileModified = false;

        // Sort transformations by position (reverse order to avoid position shifts)
        transformations.sort((a, b) => {
          const posA = a.operation.sourceAST?.start || 0;
          const posB = b.operation.sourceAST?.start || 0;
          return posB - posA;
        });

        // Apply each transformation
        for (const transformation of transformations) {
          const sourceMapping = this.sourceMapper.getMapping(transformation.operationId);
          
          if (sourceMapping) {
            const change = await this.applicator.applyTransformation(
              filePath,
              sourceMapping,
              transformation.result
            );

            if (change) {
              modifiedContent = change.code || change.newText || modifiedContent;
              fileModified = true;
              operationsUpdated++;
              totalLinesAdded += change.linesAdded || 0;
              totalLinesRemoved += change.linesRemoved || 0;
              
              this.applicationResults.set(transformation.operationId, change);
            }
          }
        }

        // Write the modified file
        if (fileModified && !this.options.dryRun) {
          await fs.writeFile(filePath, modifiedContent, 'utf-8');
          modifiedFiles.add(filePath);
        }
      } catch (error) {
        logger.error(`Failed to apply transformations to ${filePath}:`, error);
      }
    }

    logger.info(`Application complete: ${modifiedFiles.size} files modified`);
    
    return {
      modifiedFiles: Array.from(modifiedFiles),
      operationsUpdated,
      linesAdded: totalLinesAdded,
      linesRemoved: totalLinesRemoved
    };
  }

  async setupProgressiveRollout(): Promise<{ operations: string[] }> {
    if (!this.options.enableSafety) {
      return { operations: [] };
    }

    logger.info('Setting up progressive rollout...');
    
    const operations: string[] = [];
    
    // Create rollback plan
    const graphqlOperations = this.extractedOperations.map(op => 
      this.convertToGraphQLOperation(op)
    );
    await this.rollbackSystem.createRollbackPlan(graphqlOperations);

    // Setup feature flags for each transformed operation
    for (const [operationId, transformation] of this.transformations) {
      const operation = this.convertToGraphQLOperation(transformation.operation);
      
      // Create feature flag
      this.progressiveMigration.createFeatureFlag(operation);
      
      // Start rollout at configured percentage
      await this.progressiveMigration.startRollout(
        operation.id,
        this.options.rolloutPercentage
      );
      
      operations.push(operation.id);
    }

    logger.info(`Progressive rollout configured for ${operations.length} operations`);
    
    return { operations };
  }

  generatePRDescription(): string {
    const summary = this.getSummary();
    
    return `## GraphQL Migration Summary

This PR contains automated GraphQL migration changes based on schema deprecations.

### Statistics
- **Operations Processed**: ${summary.totalOperations}
- **Successful Transformations**: ${summary.successfulTransformations}
- **Files Modified**: ${summary.filesModified}
- **Average Confidence**: ${summary.averageConfidence.toFixed(1)}%

### Changes
${this.generateChangesList()}

### Safety Features
- Progressive rollout enabled at ${this.options.rolloutPercentage}%
- Automatic rollback available
- Health monitoring active

### Next Steps
1. Review the changes
2. Monitor health metrics after merge
3. Gradually increase rollout percentage

Generated by pg-migration-620
`;
  }

  getSummary(): any {
    const totalOperations = this.extractedOperations.length;
    const successfulTransformations = this.transformations.size;
    const filesModified = new Set(
      Array.from(this.transformations.values()).map(t => t.operation.filePath)
    ).size;
    
    let totalConfidence = 0;
    const risks: string[] = [];
    
    for (const transformation of this.transformations.values()) {
      totalConfidence += transformation.confidence.score;
      if (transformation.confidence.risks) {
        risks.push(...transformation.confidence.risks);
      }
    }
    
    const averageConfidence = successfulTransformations > 0 
      ? totalConfidence / successfulTransformations 
      : 0;

    return {
      totalOperations,
      successfulTransformations,
      filesModified,
      averageConfidence,
      risks: [...new Set(risks)] // Unique risks
    };
  }

  private convertDeprecationsToRules(deprecations: any): TransformationRule[] {
    const rules: TransformationRule[] = [];
    
    for (const [type, fields] of Object.entries(deprecations)) {
      for (const field of fields as any[]) {
        if (field.deprecationReason?.includes('Use')) {
          const match = field.deprecationReason.match(/Use `(\w+)`/);
          if (match) {
            rules.push({
              type: 'field-rename',
              from: field.name,
              to: match[1],
              parent: type !== 'Query' ? type : undefined,
              description: field.deprecationReason,
              automated: true
            } as any);
          }
        }
      }
    }
    
    return rules;
  }

  private convertToGraphQLOperation(extracted: ExtractedQuery): GraphQLOperation {
    return {
      id: extracted.id,
      name: extracted.name || extracted.id,
      type: extracted.type as 'query' | 'mutation' | 'subscription',
      ast: parse(extracted.content),
      source: extracted.content,
      file: extracted.filePath,
      line: extracted.location?.line || 0,
      column: extracted.location?.column || 0,
      variables: [],
      fragments: (extracted.fragments || []).map(f => ({
        name: f,
        type: 'fragment',
        file: extracted.filePath
      })),
      directives: []
    };
  }

  private detectPattern(rules: TransformationRule[]): string {
    if (rules.length === 0) return 'no-change';
    if (rules.every(r => r.type === 'field-rename')) return 'simple-field-rename';
    if (rules.some(r => r.type === 'structure-change')) return 'structure-change';
    return 'mixed';
  }

  private generateChangesList(): string {
    const changes: string[] = [];
    
    for (const transformation of this.transformations.values()) {
      const { operation, result } = transformation;
      changes.push(`- **${operation.name || operation.id}** in \`${path.basename(operation.filePath)}\``);
      
      for (const rule of result.rules) {
        changes.push(`  - ${rule.type}: \`${rule.from}\` → \`${rule.to}\``);
      }
    }
    
    return changes.join('\n');
  }

  async validateResponses(): Promise<ResponseValidationReport | null> {
    if (!this.options.responseValidation?.enabled) {
      logger.info('Response validation is disabled');
      return null;
    }

    logger.info('Starting response validation phase...');

    // Initialize response validator if not already done
    if (!this.responseValidator) {
      const endpoint: EndpointConfig = {
        url: this.options.responseValidation.endpoint,
        headers: this.options.responseValidation.authToken ? {
          Authorization: `Bearer ${this.options.responseValidation.authToken}`
        } : undefined,
        timeout: 30000
      };

      const validationConfig: ResponseValidationConfig = {
        endpoints: [endpoint],
        capture: {
          parallel: true,
          maxConcurrency: 10,
          timeout: 30000,
          variableGeneration: 'auto'
        },
        comparison: {
          strict: false
        },
        alignment: {
          strict: false,
          preserveNulls: true,
          preserveOrder: false
        },
        storage: {
          type: 'file',
          path: './validation-storage'
        }
      };

      this.responseValidator = new ResponseValidationService(validationConfig);
    }

    try {
      // Get baseline and transformed queries
      const baselineQueries = this.extractedOperations.map(op => ({
        ...op,
        resolvedContent: op.content,
        resolvedFragments: [],
        allDependencies: []
      })) as any[];

      const transformedQueries = Array.from(this.transformations.values()).map(t => ({
        ...t.operation,
        content: t.result.transformed,
        resolvedContent: t.result.transformed,
        resolvedFragments: [],
        allDependencies: []
      })) as any[];

      // Validate transformations
      const report = await this.responseValidator.validateTransformation(
        baselineQueries,
        transformedQueries,
        {
          generateAlignments: this.options.responseValidation.generateAlignments,
          setupABTest: this.options.responseValidation.setupABTest
        }
      );

      this.responseValidationReport = report;

      logger.info(`Response validation complete. Safe to migrate: ${report.summary.safeToMigrate}`);
      
      if (!report.summary.safeToMigrate) {
        logger.warn(`${report.summary.breakingChanges} breaking changes detected in responses`);
      }

      return report;
    } catch (error) {
      logger.error('Response validation failed:', error);
      return null;
    }
  }

  getResponseValidationSummary(): string | null {
    if (!this.responseValidationReport) return null;

    const { summary } = this.responseValidationReport;
    
    return `
### Response Validation Results
- **Safe to Migrate**: ${summary.safeToMigrate ? '✅ Yes' : '❌ No'}
- **Breaking Changes**: ${summary.breakingChanges}
- **Average Similarity**: ${(summary.averageSimilarity * 100).toFixed(1)}%
- **Risk Level**: ${summary.estimatedRisk.toUpperCase()}

${this.responseValidationReport.recommendations.slice(0, 3).map(r => `- ${r}`).join('\n')}
`;
  }

  async cleanup(): Promise<void> {
    if (this.responseValidator) {
      await this.responseValidator.destroy();
    }
  }
} 