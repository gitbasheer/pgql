import { DocumentNode, print, parse, GraphQLSchema } from 'graphql';
import { Result, ok, err } from 'neverthrow';
import { createHash } from 'crypto';
import { logger } from '../../utils/logger.js';
import { transformCache } from '../cache/CacheManager.js';
import { TransformationError, handleError } from '../errors/index.js';

// Unified types for all transformers
export interface TransformOptions {
  dryRun?: boolean;
  enableCache?: boolean;
  preserveStructure?: boolean;
  validateSemantics?: boolean;
  addComments?: boolean;
  maxIterations?: number;
}

export interface TransformResult {
  queryId: string;
  original: string;
  transformed: string;
  changes: TransformChange[];
  warnings: TransformWarning[];
  confidence: number;
  cached?: boolean;
  metadata: {
    transformationType: string;
    appliedRules: string[];
    duration: number;
  };
}

export interface TransformChange {
  type: 'field' | 'argument' | 'type' | 'directive' | 'fragment';
  path: string;
  oldValue: string;
  newValue: string;
  reason: string;
  impact: 'BREAKING' | 'COMPATIBLE' | 'ENHANCEMENT';
  location?: {
    line: number;
    column: number;
  };
}

export interface TransformWarning {
  message: string;
  severity: 'low' | 'medium' | 'high';
  type: 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'TRANSFORM_ERROR' | 'DEPRECATION';
  location?: {
    line: number;
    column: number;
  };
}

export interface TransformContext {
  queryId: string;
  schemaPath?: string;
  schema?: GraphQLSchema;
  filePath?: string;
  options: TransformOptions;
}

export type TransformError = 
  | { type: 'PARSE_ERROR'; message: string; location?: { line: number; column: number } }
  | { type: 'VALIDATION_ERROR'; issues: string[] }
  | { type: 'TRANSFORM_ERROR'; reason: string }
  | { type: 'CACHE_ERROR'; message: string };

/**
 * Abstract base class for all GraphQL transformers
 * Provides common functionality like caching, validation, and error handling
 */
export abstract class BaseTransformer {
  protected options: TransformOptions;
  
  constructor(options: TransformOptions = {}) {
    this.options = {
      dryRun: false,
      enableCache: true,
      preserveStructure: true,
      validateSemantics: true,
      addComments: false,
      maxIterations: 10,
      ...options,
    };
  }

  /**
   * Main transform method - must be implemented by subclasses
   */
  abstract transform(
    query: string,
    context: TransformContext
  ): Promise<Result<TransformResult, TransformError>>;

  /**
   * Get transformer name for logging and caching
   */
  abstract get name(): string;

  /**
   * Parse query string to AST with error handling
   */
  protected parseQuery(query: string): Result<DocumentNode, TransformError> {
    try {
      const ast = parse(query);
      return ok(ast);
    } catch (error) {
      const transformationError = new TransformationError(
        `Failed to parse GraphQL query: ${error}`,
        { 
          queryId: 'unknown',
          additionalData: { 
            location: this.extractErrorLocation(error) 
          }
        },
        error instanceof Error ? error : new Error(String(error))
      );
      
      // Handle error through unified system
      handleError(transformationError);
      
      const parseError: TransformError = {
        type: 'PARSE_ERROR',
        message: `Failed to parse GraphQL query: ${error}`,
        location: this.extractErrorLocation(error),
      };
      return err(parseError);
    }
  }

  /**
   * Print AST to string with formatting
   */
  protected printAst(ast: DocumentNode): string {
    return print(ast);
  }

  /**
   * Generate cache key for a query transformation
   */
  protected generateCacheKey(query: string, context: TransformContext): string {
    const contextStr = JSON.stringify({
      options: this.options,
      schemaPath: context.schemaPath,
      transformerName: this.name,
    });
    return createHash('sha256').update(query + contextStr).digest('hex');
  }

  /**
   * Get cached result if available
   */
  protected async getCachedResult(
    cacheKey: string
  ): Promise<TransformResult | null> {
    if (!this.options.enableCache) {
      return null;
    }

    try {
      const cached = transformCache.get(cacheKey);
      if (cached) {
        return { ...cached, cached: true } as TransformResult;
      }
    } catch (error) {
      logger.warn(`Cache retrieval failed: ${error}`);
    }

    return null;
  }

  /**
   * Store result in cache
   */
  protected async setCachedResult(
    cacheKey: string,
    result: TransformResult
  ): Promise<void> {
    if (!this.options.enableCache || this.options.dryRun) {
      return;
    }

    try {
      transformCache.set(cacheKey, result, 3600000);
    } catch (error) {
      logger.warn(`Cache storage failed: ${error}`);
    }
  }

  /**
   * Create transform result with metadata
   */
  protected createResult(
    queryId: string,
    original: string,
    transformed: string,
    changes: TransformChange[] = [],
    warnings: TransformWarning[] = [],
    startTime: number = Date.now()
  ): TransformResult {
    return {
      queryId,
      original,
      transformed,
      changes,
      warnings,
      confidence: this.calculateConfidence(changes, warnings),
      metadata: {
        transformationType: this.name,
        appliedRules: changes.map(c => c.type),
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * Calculate confidence score based on changes and warnings
   */
  protected calculateConfidence(
    changes: TransformChange[],
    warnings: TransformWarning[]
  ): number {
    let confidence = 100;

    // Reduce confidence for breaking changes
    const breakingChanges = changes.filter(c => c.impact === 'BREAKING').length;
    confidence -= breakingChanges * 20;

    // Reduce confidence for high-severity warnings
    const highSeverityWarnings = warnings.filter(w => w.severity === 'high').length;
    confidence -= highSeverityWarnings * 15;

    // Reduce confidence for medium-severity warnings
    const mediumSeverityWarnings = warnings.filter(w => w.severity === 'medium').length;
    confidence -= mediumSeverityWarnings * 5;

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Extract location information from GraphQL errors
   */
  protected extractErrorLocation(error: any): { line: number; column: number } | undefined {
    if (error.locations && error.locations.length > 0) {
      const location = error.locations[0];
      return {
        line: location.line,
        column: location.column,
      };
    }
    return undefined;
  }

  /**
   * Create warning object
   */
  protected createWarning(
    message: string,
    severity: 'low' | 'medium' | 'high' = 'medium',
    type: TransformWarning['type'] = 'TRANSFORM_ERROR',
    location?: { line: number; column: number }
  ): TransformWarning {
    return {
      message,
      severity,
      type,
      location,
    };
  }

  /**
   * Create change object
   */
  protected createChange(
    type: TransformChange['type'],
    path: string,
    oldValue: string,
    newValue: string,
    reason: string,
    impact: TransformChange['impact'] = 'COMPATIBLE',
    location?: { line: number; column: number }
  ): TransformChange {
    return {
      type,
      path,
      oldValue,
      newValue,
      reason,
      impact,
      location,
    };
  }

  /**
   * Validate that transformation preserves query semantics
   */
  protected validateTransformation(
    original: DocumentNode,
    transformed: DocumentNode,
    schema?: GraphQLSchema
  ): TransformWarning[] {
    const warnings: TransformWarning[] = [];

    // Basic structure validation
    if (original.definitions.length !== transformed.definitions.length) {
      warnings.push(
        this.createWarning(
          'Number of definitions changed during transformation',
          'high',
          'VALIDATION_ERROR'
        )
      );
    }

    // Schema validation if available
    if (schema) {
      try {
        const originalStr = print(original);
        const transformedStr = print(transformed);
        
        // This is a simplified validation - in practice you'd use graphql validate
        if (originalStr.length === 0 || transformedStr.length === 0) {
          warnings.push(
            this.createWarning(
              'Transformation resulted in empty query',
              'high',
              'VALIDATION_ERROR'
            )
          );
        }
      } catch (error) {
        warnings.push(
          this.createWarning(
            `Schema validation failed: ${error}`,
            'medium',
            'VALIDATION_ERROR'
          )
        );
      }
    }

    return warnings;
  }

  /**
   * Log transformation result
   */
  protected logResult(result: TransformResult): void {
    const { queryId, changes, warnings, confidence, metadata } = result;
    
    logger.info(`Transformed query ${queryId}`, {
      changes: changes.length,
      warnings: warnings.length,
      confidence,
      duration: metadata.duration,
      cached: result.cached,
    });

    if (warnings.length > 0) {
      warnings.forEach(warning => {
        logger.warn(`${queryId}: ${warning.message}`, {
          severity: warning.severity,
          type: warning.type,
        });
      });
    }
  }
}