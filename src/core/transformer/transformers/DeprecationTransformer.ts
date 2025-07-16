/**
 * Handles GraphQL deprecation transformations
 * Single responsibility: Transform deprecated fields/types to their replacements
 */

import { DocumentNode, visit, Kind } from 'graphql';
import { BaseTransformer, TransformResult, TransformContext, TransformError } from '../BaseTransformer.js';
import { Result, ok, err } from 'neverthrow';
import { GraphQLSchema } from 'graphql';

export interface DeprecationRule {
  type: 'field' | 'type' | 'argument' | 'directive';
  pattern: string;
  replacement: string;
  reason: string;
  breaking: boolean;
}

export class DeprecationTransformer extends BaseTransformer {
  private rules: DeprecationRule[];

  constructor(rules: DeprecationRule[] = []) {
    super({ preserveStructure: true, validateSemantics: true });
    this.rules = rules;
  }

  get name(): string {
    return 'DeprecationTransformer';
  }

  async transform(
    query: string,
    context: TransformContext
  ): Promise<Result<TransformResult, TransformError>> {
    const startTime = Date.now();
    
    // Check cache
    const cacheKey = this.generateCacheKey(query, context);
    const cached = await this.getCachedResult(cacheKey);
    if (cached) {
      return ok(cached);
    }

    // Parse the query
    const parseResult = this.parseQuery(query);
    if (parseResult.isErr()) {
      return err(parseResult.error);
    }

    const ast = parseResult.value;
    const changes = this.createChange();
    const warnings = this.createWarning();

    // Apply deprecation rules
    const transformedAst = this.applyDeprecationRules(ast, context.schema, changes, warnings);
    const transformedQuery = this.printAst(transformedAst);

    // Validate transformation
    if (context.schema && this.options.validateSemantics) {
      const validationWarnings = this.validateTransformation(ast, transformedAst, context.schema);
      warnings.push(...validationWarnings);
    }

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

  private applyDeprecationRules(
    ast: DocumentNode,
    schema: GraphQLSchema | undefined,
    changes: any[],
    warnings: any[]
  ): DocumentNode {
    return visit(ast, {
      Field: (node) => {
        const fieldName = node.name.value;
        const rule = this.findRuleForField(fieldName);
        
        if (rule) {
          changes.push(this.createChange(
            'field',
            fieldName,
            fieldName,
            rule.replacement,
            rule.reason,
            rule.breaking ? 'BREAKING' : 'COMPATIBLE'
          ));

          return {
            ...node,
            name: {
              ...node.name,
              value: rule.replacement,
            },
          };
        }
        
        return node;
      },
    });
  }

  private findRuleForField(fieldName: string): DeprecationRule | undefined {
    return this.rules.find(
      rule => rule.type === 'field' && rule.pattern === fieldName
    );
  }

  /**
   * Load deprecation rules from schema
   */
  static fromSchema(schema: GraphQLSchema): DeprecationTransformer {
    const rules: DeprecationRule[] = [];
    
    // Extract deprecation rules from schema introspection
    // This is a simplified example - real implementation would traverse the schema
    
    return new DeprecationTransformer(rules);
  }
}