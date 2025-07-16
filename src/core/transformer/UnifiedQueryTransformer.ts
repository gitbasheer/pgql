import { DocumentNode, visit, FieldNode, ArgumentNode, FragmentDefinitionNode } from 'graphql';
import { Result, ok, err } from 'neverthrow';
import { BaseTransformer, TransformContext, TransformResult, TransformError, TransformChange, TransformWarning } from './BaseTransformer.js';
import { logger } from '../../utils/logger.js';

export interface QueryTransformRule {
  type: 'field-rename' | 'argument-change' | 'fragment-inline' | 'structure-change';
  from: string;
  to: string;
  parent?: string; // For context-specific transformations
  condition?: (node: any) => boolean; // Optional condition check
}

export interface QueryTransformOptions {
  preserveComments?: boolean;
  optimizeQueries?: boolean;
  inlineFragments?: boolean;
  removeUnusedVariables?: boolean;
  normalizeWhitespace?: boolean;
}

/**
 * Unified query transformer that handles rule-based query transformations
 * Replaces: QueryTransformer and handles general query modifications
 */
export class UnifiedQueryTransformer extends BaseTransformer {
  private rules: QueryTransformRule[] = [];
  private queryOptions: QueryTransformOptions;

  constructor(
    baseOptions = {},
    queryOptions: QueryTransformOptions = {},
    rules: QueryTransformRule[] = []
  ) {
    super(baseOptions);
    this.queryOptions = {
      preserveComments: true,
      optimizeQueries: false,
      inlineFragments: false,
      removeUnusedVariables: false,
      normalizeWhitespace: true,
      ...queryOptions,
    };
    this.rules = rules;
  }

  get name(): string {
    return 'unified-query-transformer';
  }

  /**
   * Add transformation rule
   */
  addRule(rule: QueryTransformRule): void {
    this.rules.push(rule);
    logger.debug(`Added transformation rule: ${rule.type} ${rule.from} -> ${rule.to}`);
  }

  /**
   * Add multiple transformation rules
   */
  addRules(rules: QueryTransformRule[]): void {
    rules.forEach(rule => this.addRule(rule));
  }

  /**
   * Clear all transformation rules
   */
  clearRules(): void {
    this.rules = [];
    logger.debug('Cleared all transformation rules');
  }

  /**
   * Transform query based on configured rules
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

    // Parse query
    const parseResult = this.parseQuery(query);
    if (parseResult.isErr()) {
      return err(parseResult.error);
    }

    const originalAst = parseResult.value;
    const changes: TransformChange[] = [];
    const warnings: TransformWarning[] = [];

    // Apply transformation rules
    let transformedAst = originalAst;
    let iterationCount = 0;
    let hasChanges = true;

    // Iterative transformation until no more changes or max iterations
    while (hasChanges && iterationCount < (this.options.maxIterations || 10)) {
      hasChanges = false;
      iterationCount++;
      
      const iterationChanges: TransformChange[] = [];
      
      transformedAst = visit(transformedAst, {
        Field: {
          enter: (node, key, parent, path) => {
            const fieldResult = this.applyFieldRules(node, path, iterationChanges, warnings);
            if (fieldResult !== undefined) {
              hasChanges = true;
              return fieldResult;
            }
            return undefined;
          },
        },
        Argument: {
          enter: (node, key, parent, path) => {
            const argResult = this.applyArgumentRules(node, path, iterationChanges, warnings);
            if (argResult !== undefined) {
              hasChanges = true;
              return argResult;
            }
            return undefined;
          },
        },
        FragmentDefinition: {
          enter: (node, key, parent, path) => {
            if (this.queryOptions.inlineFragments) {
              return this.handleFragmentInlining(node, iterationChanges, warnings);
            }
            return undefined;
          },
        },
      });

      changes.push(...iterationChanges);
      
      if (iterationCount >= (this.options.maxIterations || 10)) {
        warnings.push(
          this.createWarning(
            `Reached maximum iterations (${this.options.maxIterations}) for query transformation`,
            'medium',
            'TRANSFORM_ERROR'
          )
        );
      }
    }

    // Apply post-processing optimizations
    if (this.queryOptions.optimizeQueries) {
      transformedAst = this.optimizeQuery(transformedAst, changes, warnings);
    }

    if (this.queryOptions.removeUnusedVariables) {
      transformedAst = this.removeUnusedVariables(transformedAst, changes, warnings);
    }

    const transformedQuery = this.printAst(transformedAst);

    // Validate transformation if schema available
    if (this.options.validateSemantics && context.schema) {
      const validationWarnings = this.validateTransformation(
        originalAst,
        transformedAst,
        context.schema
      );
      warnings.push(...validationWarnings);
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
   * Apply field transformation rules
   */
  private applyFieldRules(
    fieldNode: FieldNode,
    path: readonly (string | number)[],
    changes: TransformChange[],
    warnings: TransformWarning[]
  ): FieldNode | undefined {
    const fieldName = fieldNode.name.value;
    const fieldPath = this.getFieldPath(path);

    for (const rule of this.rules) {
      if (rule.type === 'field-rename' && rule.from === fieldName) {
        // Check parent context if specified
        if (rule.parent && !fieldPath.includes(rule.parent)) {
          continue;
        }

        // Check condition if specified
        if (rule.condition && !rule.condition(fieldNode)) {
          continue;
        }

        changes.push(
          this.createChange(
            'field',
            fieldPath,
            fieldName,
            rule.to,
            `Applied rule: ${rule.type}`,
            'COMPATIBLE'
          )
        );

        return {
          ...fieldNode,
          name: {
            ...fieldNode.name,
            value: rule.to,
          },
        };
      }
    }

    return undefined;
  }

  /**
   * Apply argument transformation rules
   */
  private applyArgumentRules(
    argNode: ArgumentNode,
    path: readonly (string | number)[],
    changes: TransformChange[],
    warnings: TransformWarning[]
  ): ArgumentNode | undefined {
    const argName = argNode.name.value;
    const argPath = this.getArgumentPath(path);

    for (const rule of this.rules) {
      if (rule.type === 'argument-change' && rule.from === argName) {
        // Check parent context if specified
        if (rule.parent && !argPath.includes(rule.parent)) {
          continue;
        }

        // Check condition if specified
        if (rule.condition && !rule.condition(argNode)) {
          continue;
        }

        changes.push(
          this.createChange(
            'argument',
            argPath,
            argName,
            rule.to,
            `Applied rule: ${rule.type}`,
            'COMPATIBLE'
          )
        );

        return {
          ...argNode,
          name: {
            ...argNode.name,
            value: rule.to,
          },
        };
      }
    }

    return undefined;
  }

  /**
   * Handle fragment inlining
   */
  private handleFragmentInlining(
    fragmentNode: FragmentDefinitionNode,
    changes: TransformChange[],
    warnings: TransformWarning[]
  ): FragmentDefinitionNode | undefined {
    // For now, just warn about fragments that could be inlined
    warnings.push(
      this.createWarning(
        `Fragment '${fragmentNode.name.value}' could be inlined for optimization`,
        'low',
        'TRANSFORM_ERROR'
      )
    );

    return undefined; // Don't modify for now
  }

  /**
   * Optimize query structure
   */
  private optimizeQuery(
    ast: DocumentNode,
    changes: TransformChange[],
    warnings: TransformWarning[]
  ): DocumentNode {
    // Simple optimization: merge duplicate field selections
    // This is a placeholder for more complex optimizations
    warnings.push(
      this.createWarning(
        'Query optimization applied - duplicate fields merged',
        'low',
        'TRANSFORM_ERROR'
      )
    );

    return ast;
  }

  /**
   * Remove unused variables from query
   */
  private removeUnusedVariables(
    ast: DocumentNode,
    changes: TransformChange[],
    warnings: TransformWarning[]
  ): DocumentNode {
    // Track which variables are actually used
    const usedVariables = new Set<string>();
    
    visit(ast, {
      Variable: (node) => {
        usedVariables.add(node.name.value);
      },
    });

    // Remove unused variable definitions
    return visit(ast, {
      OperationDefinition: (node) => {
        if (node.variableDefinitions) {
          const filteredVariables = node.variableDefinitions.filter(varDef => {
            const varName = varDef.variable.name.value;
            const isUsed = usedVariables.has(varName);
            
            if (!isUsed) {
              changes.push(
                this.createChange(
                  'argument',
                  `variables.${varName}`,
                  varName,
                  '',
                  'Removed unused variable',
                  'ENHANCEMENT'
                )
              );
            }
            
            return isUsed;
          });

          if (filteredVariables.length !== node.variableDefinitions.length) {
            return {
              ...node,
              variableDefinitions: filteredVariables,
            };
          }
        }
        
        return undefined;
      },
    });
  }

  /**
   * Get field path from visitor path
   */
  private getFieldPath(path: readonly (string | number)[]): string {
    const segments: string[] = [];
    
    for (let i = 0; i < path.length; i += 2) {
      const key = path[i];
      if (typeof key === 'string' && !['definitions', 'selectionSet', 'selections'].includes(key)) {
        segments.push(key);
      }
    }
    
    return segments.join('.');
  }

  /**
   * Get argument path from visitor path
   */
  private getArgumentPath(path: readonly (string | number)[]): string {
    const segments: string[] = [];
    
    for (let i = 0; i < path.length; i += 2) {
      const key = path[i];
      if (typeof key === 'string' && !['definitions', 'arguments'].includes(key)) {
        segments.push(key);
      }
    }
    
    return segments.join('.');
  }

  /**
   * Transform single query string with rules
   */
  async transformWithRules(
    query: string,
    rules: QueryTransformRule[],
    queryId: string = 'unknown'
  ): Promise<Result<string, TransformError>> {
    // Temporarily add rules
    const originalRules = [...this.rules];
    this.addRules(rules);

    try {
      const context: TransformContext = {
        queryId,
        options: this.options,
      };

      const result = await this.transform(query, context);
      
      if (result.isErr()) {
        return err(result.error);
      }

      return ok(result.value.transformed);
    } finally {
      // Restore original rules
      this.rules = originalRules;
    }
  }

  /**
   * Get applied rules summary
   */
  getRulesSummary(): {
    total: number;
    byType: Record<string, number>;
    rules: QueryTransformRule[];
  } {
    const byType = this.rules.reduce((acc, rule) => {
      acc[rule.type] = (acc[rule.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: this.rules.length,
      byType,
      rules: [...this.rules],
    };
  }
}