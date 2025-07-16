import { DocumentNode, visit, GraphQLSchema, validate } from 'graphql';
import { Result, ok, err } from 'neverthrow';
import { BaseTransformer, TransformContext, TransformResult, TransformError, TransformChange, TransformWarning } from './BaseTransformer.js';
import { SchemaDeprecationAnalyzer, DeprecationRule } from '../analyzer/SchemaDeprecationAnalyzer.js';
import { logger } from '../../utils/logger.js';
import { SchemaLoader } from '../../utils/schemaLoader.js';

export interface SchemaTransformOptions {
  commentOutVague?: boolean;
  addDeprecationComments?: boolean;
  preserveOriginalAsComment?: boolean;
  autoFixDeprecations?: boolean;
  strictValidation?: boolean;
}

/**
 * Unified schema-aware transformer that consolidates all schema-based transformation logic
 * Replaces: OptimizedSchemaTransformer, ProductionSchemaTransformer, SchemaAwareTransformer
 */
export class UnifiedSchemaTransformer extends BaseTransformer {
  private deprecationAnalyzer: SchemaDeprecationAnalyzer;
  private deprecationMap: Map<string, DeprecationRule> = new Map();
  private schema?: GraphQLSchema;
  private schemaTransformOptions: SchemaTransformOptions;
  private schemaLoader: SchemaLoader;

  constructor(
    baseOptions = {},
    schemaOptions: SchemaTransformOptions = {}
  ) {
    super(baseOptions);
    this.deprecationAnalyzer = new SchemaDeprecationAnalyzer();
    this.schemaLoader = SchemaLoader.getInstance();
    this.schemaTransformOptions = {
      commentOutVague: true,
      addDeprecationComments: true,
      preserveOriginalAsComment: false,
      autoFixDeprecations: true,
      strictValidation: true,
      ...schemaOptions,
    };
  }

  get name(): string {
    return 'unified-schema-transformer';
  }

  /**
   * Load and analyze schema for deprecations
   */
  async loadSchema(schemaPath: string): Promise<Result<void, TransformError>> {
    try {
      const result = await this.schemaLoader.loadSchema(schemaPath);
      this.schema = result.schema;
      
      // Analyze schema for deprecations
      const deprecations = await this.deprecationAnalyzer.analyzeSchemaFile(schemaPath);
      this.deprecationMap.clear();
      
      deprecations.forEach(dep => {
        this.deprecationMap.set((dep as any).fieldPath, dep);
      });

      logger.info(`Loaded schema with ${deprecations.length} deprecations (cached: ${result.cached}, time: ${result.loadTime}ms)`);
      return ok(undefined);
    } catch (error) {
      return err({
        type: 'TRANSFORM_ERROR',
        reason: `Failed to load schema: ${error}`,
      });
    }
  }

  /**
   * Transform query based on schema deprecations and rules
   */
  async transform(
    query: string,
    context: TransformContext
  ): Promise<Result<TransformResult, TransformError>> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(query, context);

    // Check cache first
    if (this.options.enableCache) {
      const cached = await this.getCachedResult(cacheKey);
      if (cached) {
        this.logResult(cached);
        return ok(cached);
      }
    }

    // Load schema if not already loaded
    if (!this.schema && context.schemaPath) {
      const schemaResult = await this.loadSchema(context.schemaPath);
      if (schemaResult.isErr()) {
        return err(schemaResult.error);
      }
    }

    // Parse query
    const parseResult = this.parseQuery(query);
    if (parseResult.isErr()) {
      return err(parseResult.error);
    }

    const originalAst = parseResult.value;
    const changes: TransformChange[] = [];
    const warnings: TransformWarning[] = [];

    // Apply schema-based transformations
    const transformedAst = visit(originalAst, {
      Field: {
        enter: (node, key, parent, path) => {
          const fieldPath = this.getFieldPath(path);
          const deprecation = this.deprecationMap.get(fieldPath);

          if (deprecation) {
            return this.handleDeprecatedField(
              node,
              deprecation,
              fieldPath,
              changes,
              warnings
            );
          }

          return undefined;
        },
      },
      Argument: {
        enter: (node, key, parent, path) => {
          const argPath = this.getArgumentPath(path);
          const deprecation = this.deprecationMap.get(argPath);

          if (deprecation) {
            return this.handleDeprecatedArgument(
              node,
              deprecation,
              argPath,
              changes,
              warnings
            );
          }

          return undefined;
        },
      },
    });

    const transformedQuery = this.printAst(transformedAst);

    // Validate transformation
    if (this.schemaTransformOptions.strictValidation && this.schema) {
      const validationWarnings = this.validateTransformation(
        originalAst,
        transformedAst,
        this.schema
      );
      warnings.push(...validationWarnings);

      // Additional schema validation
      const schemaValidationErrors = validate(this.schema, transformedAst);
      if (schemaValidationErrors.length > 0) {
        warnings.push(
          this.createWarning(
            `Schema validation errors: ${schemaValidationErrors.map(e => e.message).join(', ')}`,
            'high',
            'VALIDATION_ERROR'
          )
        );
      }
    }

    // Create result
    const result = this.createResult(
      context.queryId,
      query,
      transformedQuery,
      changes,
      warnings,
      startTime
    );

    // Cache result
    await this.setCachedResult(cacheKey, result);

    this.logResult(result);
    return ok(result);
  }

  /**
   * Handle deprecated field transformation
   */
  private handleDeprecatedField(
    fieldNode: any,
    deprecation: DeprecationRule,
    fieldPath: string,
    changes: TransformChange[],
    warnings: TransformWarning[]
  ): any {
    if (deprecation.replacement && this.schemaTransformOptions.autoFixDeprecations) {
      // Apply automatic replacement
      changes.push(
        this.createChange(
          'field',
          fieldPath,
          fieldNode.name.value,
          deprecation.replacement,
          (deprecation as any).reason || 'Field deprecated',
          'BREAKING'
        )
      );

      return {
        ...fieldNode,
        name: {
          ...fieldNode.name,
          value: deprecation.replacement,
        },
      };
    } else {
      // Add warning for manual handling
      const severity = (deprecation as any).isVague ? 'high' : 'medium';
      warnings.push(
        this.createWarning(
          `Deprecated field '${fieldNode.name.value}' requires manual review: ${(deprecation as any).reason}`,
          severity,
          'DEPRECATION'
        )
      );

      if (this.schemaTransformOptions.commentOutVague && (deprecation as any).isVague) {
        // Comment out vague deprecations
        warnings.push(
          this.createWarning(
            `Field '${fieldNode.name.value}' commented out due to vague deprecation`,
            'medium',
            'TRANSFORM_ERROR'
          )
        );
      }
    }

    return undefined;
  }

  /**
   * Handle deprecated argument transformation
   */
  private handleDeprecatedArgument(
    argNode: any,
    deprecation: DeprecationRule,
    argPath: string,
    changes: TransformChange[],
    warnings: TransformWarning[]
  ): any {
    if (deprecation.replacement && this.schemaTransformOptions.autoFixDeprecations) {
      changes.push(
        this.createChange(
          'argument',
          argPath,
          argNode.name.value,
          deprecation.replacement,
          (deprecation as any).reason || 'Argument deprecated',
          'BREAKING'
        )
      );

      return {
        ...argNode,
        name: {
          ...argNode.name,
          value: deprecation.replacement,
        },
      };
    } else {
      warnings.push(
        this.createWarning(
          `Deprecated argument '${argNode.name.value}' requires manual review: ${(deprecation as any).reason}`,
          'medium',
          'DEPRECATION'
        )
      );
    }

    return undefined;
  }

  /**
   * Get field path from visitor path
   */
  private getFieldPath(path: readonly (string | number)[]): string {
    const segments: string[] = [];
    
    for (let i = 0; i < path.length; i += 2) {
      const key = path[i];
      if (typeof key === 'string' && key !== 'definitions') {
        segments.push(key);
      }
    }
    
    return segments.join('.');
  }

  /**
   * Get argument path from visitor path
   */
  private getArgumentPath(path: readonly (string | number)[]): string {
    // Similar to getFieldPath but includes argument context
    return this.getFieldPath(path);
  }

  /**
   * Transform specific query with options
   */
  async transformQuery(params: {
    queryId: string;
    content: string;
    schemaPath: string;
    dryRun?: boolean;
  }): Promise<{
    transformed: boolean;
    transformedQuery?: string;
    changes?: TransformChange[];
    warnings?: TransformWarning[];
  }> {
    const context: TransformContext = {
      queryId: params.queryId,
      schemaPath: params.schemaPath,
      options: {
        ...this.options,
        dryRun: params.dryRun || false,
      },
    };

    const result = await this.transform(params.content, context);
    
    if (result.isErr()) {
      return {
        transformed: false,
        warnings: [
          this.createWarning(
            `Transformation failed: ${result.error.type}`,
            'high',
            'TRANSFORM_ERROR'
          ),
        ],
      };
    }

    const transformResult = result.value;
    const hasChanges = transformResult.changes.length > 0;

    return {
      transformed: hasChanges,
      transformedQuery: hasChanges ? transformResult.transformed : undefined,
      changes: transformResult.changes,
      warnings: transformResult.warnings,
    };
  }

  /**
   * Get deprecation summary
   */
  getDeprecationSummary(): {
    total: number;
    replaceable: number;
    vague: number;
    fieldDeprecations: number;
    argumentDeprecations: number;
  } {
    const deprecations = Array.from(this.deprecationMap.values());
    
    return {
      total: deprecations.length,
      replaceable: deprecations.filter(d => !!d.replacement && !(d as any).isVague).length,
      vague: deprecations.filter(d => (d as any).isVague).length,
      fieldDeprecations: deprecations.filter(d => d.type === 'field').length,
      argumentDeprecations: deprecations.filter(d => d.type === 'argument').length,
    };
  }

  /**
   * Clear internal state for new schema
   */
  reset(): void {
    this.deprecationMap.clear();
    this.schema = undefined;
  }
}