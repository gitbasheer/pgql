import { DocumentNode, visit, print, parse, FieldNode, Kind } from 'graphql';
import { DeprecationRule } from '../analyzer/SchemaDeprecationAnalyzer.js';
import { logger } from '../../utils/logger.js';

export interface TransformOptions {
  commentOutVague: boolean;
  addDeprecationComments: boolean;
  preserveOriginalAsComment: boolean;
  maxDepth?: number; // Prevent infinite recursion
}

export interface TransformResult {
  transformed: string;
  changes: Change[];
  errors: Error[];
}

export interface Change {
  type: 'field-rename' | 'nested-replacement' | 'comment-out' | 'skipped';
  field: string;
  replacement?: string;
  reason: string;
  location?: { line: number; column: number };
  objectType?: string;
}

export class ProductionSchemaTransformer {
  private rulesByTypeAndField: Map<string, DeprecationRule>;
  private processedFields: Set<string>;
  private errors: Error[];

  constructor(
    private deprecationRules: DeprecationRule[],
    private options: TransformOptions = {
      commentOutVague: true,
      addDeprecationComments: true,
      preserveOriginalAsComment: false,
      maxDepth: 10,
    },
  ) {
    this.rulesByTypeAndField = new Map();
    this.processedFields = new Set();
    this.errors = [];

    // Build efficient lookup map
    this.buildRuleLookup();
  }

  private buildRuleLookup(): void {
    for (const rule of this.deprecationRules) {
      // Create keys for different type variations
      const keys = [
        `${rule.objectType}.${rule.fieldName}`,
        `Query.${rule.fieldName}`, // For top-level queries
        `*.${rule.fieldName}`, // For any type
      ];

      for (const key of keys) {
        if (!this.rulesByTypeAndField.has(key)) {
          this.rulesByTypeAndField.set(key, rule);
        }
      }
    }

    logger.info(`Built lookup map with ${this.rulesByTypeAndField.size} entries`);
  }

  transform(query: string | DocumentNode): TransformResult {
    this.processedFields.clear();
    this.errors = [];

    try {
      const ast = typeof query === 'string' ? parse(query) : query;
      const changes: Change[] = [];

      // Track type context with depth limit
      const typeStack: string[] = ['Query'];
      let depth = 0;

      const transformedAst = visit(ast, {
        Field: {
          enter: (node, key, parent, path, ancestors) => {
            if (depth > (this.options.maxDepth || 10)) {
              logger.warn(`Max depth reached at field ${node.name.value}`);
              return node;
            }

            depth++;
            const fieldName = node.name.value;
            const currentType = typeStack[typeStack.length - 1];

            // Try to find matching rule
            const rule = this.findMatchingRule(currentType, fieldName);

            if (rule) {
              const fieldKey = `${currentType}.${fieldName}`;

              // Prevent processing the same field multiple times
              if (this.processedFields.has(fieldKey)) {
                changes.push({
                  type: 'skipped',
                  field: fieldName,
                  reason: 'Already processed',
                  objectType: currentType,
                });
                return node;
              }

              this.processedFields.add(fieldKey);

              if (rule.isVague && this.options.commentOutVague) {
                // Comment out fields with vague deprecations
                changes.push({
                  type: 'comment-out',
                  field: fieldName,
                  reason: rule.deprecationReason,
                  location: node.loc
                    ? {
                        line: node.loc.startToken.line,
                        column: node.loc.startToken.column,
                      }
                    : undefined,
                  objectType: currentType,
                });

                // Remove the field from AST
                return null;
              } else if (!rule.isVague && rule.replacement) {
                // Handle replacements
                if (rule.replacement.includes('.')) {
                  // Nested replacement
                  changes.push({
                    type: 'nested-replacement',
                    field: fieldName,
                    replacement: rule.replacement,
                    reason: rule.deprecationReason,
                    location: node.loc
                      ? {
                          line: node.loc.startToken.line,
                          column: node.loc.startToken.column,
                        }
                      : undefined,
                    objectType: currentType,
                  });

                  return this.createNestedField(rule.replacement, node);
                } else {
                  // Simple field rename
                  changes.push({
                    type: 'field-rename',
                    field: fieldName,
                    replacement: rule.replacement,
                    reason: rule.deprecationReason,
                    location: node.loc
                      ? {
                          line: node.loc.startToken.line,
                          column: node.loc.startToken.column,
                        }
                      : undefined,
                    objectType: currentType,
                  });

                  return {
                    ...node,
                    name: {
                      kind: Kind.NAME,
                      value: rule.replacement,
                    },
                  };
                }
              }
            }

            // Update type context for nested selections
            if (node.selectionSet) {
              const nextType = this.inferType(fieldName, currentType);
              typeStack.push(nextType);
            }

            return node;
          },
          leave: (node) => {
            depth--;
            if (node && node.selectionSet) {
              typeStack.pop();
            }
          },
        },
      });

      const transformed = print(transformedAst);

      return {
        transformed,
        changes,
        errors: this.errors,
      };
    } catch (error) {
      this.errors.push(error as Error);
      logger.error('Transform failed:', error);

      return {
        transformed: typeof query === 'string' ? query : print(query),
        changes: [],
        errors: this.errors,
      };
    }
  }

  private findMatchingRule(objectType: string, fieldName: string): DeprecationRule | undefined {
    // Try exact match first
    let rule = this.rulesByTypeAndField.get(`${objectType}.${fieldName}`);
    if (rule) return rule;

    // Try common type mappings
    const typeMappings: Record<string, string[]> = {
      Query: ['CustomerQuery'],
      User: ['CurrentUser', 'Purchaser', 'Customer'],
      Venture: ['VentureNode'],
      Project: ['ProjectNode'],
    };

    const alternativeTypes = typeMappings[objectType] || [];
    for (const altType of alternativeTypes) {
      rule = this.rulesByTypeAndField.get(`${altType}.${fieldName}`);
      if (rule) return rule;
    }

    // Try wildcard match
    return this.rulesByTypeAndField.get(`*.${fieldName}`);
  }

  private inferType(fieldName: string, parentType: string): string {
    // Type inference based on field names and conventions
    const typeInference: Record<string, string> = {
      user: 'CurrentUser',
      me: 'CurrentUser',
      venture: 'Venture',
      ventures: 'Venture',
      project: 'Project',
      projects: 'Project',
      profile: 'Profile',
      product: 'Product',
      subscription: 'EcommSubscription',
      billing: 'Billing',
    };

    return typeInference[fieldName] || 'Unknown';
  }

  private createNestedField(replacement: string, originalNode: FieldNode): FieldNode {
    const parts = replacement.split('.');

    if (parts.length === 2) {
      const [parent, child] = parts;
      return {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: parent },
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [
            {
              kind: Kind.FIELD,
              name: { kind: Kind.NAME, value: child },
              // Preserve original field's selections if any
              selectionSet: originalNode.selectionSet,
            },
          ],
        },
        // Preserve directives and arguments
        directives: originalNode.directives,
        arguments: originalNode.arguments,
      };
    }

    // For deeper nesting, create recursive structure
    return this.createDeepNestedField(parts, originalNode);
  }

  private createDeepNestedField(parts: string[], originalNode: FieldNode): FieldNode {
    if (parts.length === 0) return originalNode;

    const [head, ...tail] = parts;

    if (tail.length === 0) {
      return {
        ...originalNode,
        name: { kind: Kind.NAME, value: head },
      };
    }

    return {
      kind: Kind.FIELD,
      name: { kind: Kind.NAME, value: head },
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections: [this.createDeepNestedField(tail, originalNode)],
      },
    };
  }

  getStats(): {
    totalRules: number;
    replaceableRules: number;
    vagueRules: number;
    typeMappings: number;
  } {
    const replaceable = this.deprecationRules.filter((r) => !r.isVague).length;
    const vague = this.deprecationRules.filter((r) => r.isVague).length;

    return {
      totalRules: this.deprecationRules.length,
      replaceableRules: replaceable,
      vagueRules: vague,
      typeMappings: this.rulesByTypeAndField.size,
    };
  }
}
