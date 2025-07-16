import { DocumentNode, visit, print, parse } from 'graphql';
import { logger } from '../../utils/logger.js';
import * as diff from 'diff';

export interface TransformationRule {
  type: 'field-rename' | 'type-change' | 'argument-change' | 'structure-change';
  from: string;
  to: string;
  parent?: string; // For context-specific transformations
}

export interface TransformationResult {
  original: string;
  transformed: string;
  ast: DocumentNode;
  changes: diff.Change[];
  rules: TransformationRule[];
}

export class QueryTransformer {
  private rules: TransformationRule[] = [];

  constructor(rules?: TransformationRule[]) {
    if (rules) {
      this.rules = rules;
    }
  }

  addRule(rule: TransformationRule): void {
    this.rules.push(rule);
  }

  transform(query: string | DocumentNode): TransformationResult {
    const original = typeof query === 'string' ? query : print(query);
    const ast = typeof query === 'string' ? parse(query) : query;

    const transformedAst = this.applyTransformations(ast);
    const transformed = print(transformedAst);

    const changes = diff.diffLines(original, transformed);

    return {
      original,
      transformed,
      ast: transformedAst,
      changes,
      rules: this.rules,
    };
  }

  private applyTransformations(ast: DocumentNode): DocumentNode {
    let transformedAst = ast;

    // Apply field renames
    transformedAst = this.applyFieldRenames(transformedAst);

    // Apply structure changes (e.g., edges to nodes)
    transformedAst = this.applyStructureChanges(transformedAst);

    return transformedAst;
  }

  private applyFieldRenames(ast: DocumentNode): DocumentNode {
    const fieldRenameRules = this.rules.filter((r) => r.type === 'field-rename');

    return visit(ast, {
      Field(node) {
        const rule = fieldRenameRules.find((r) => {
          // Simple field name matching for now
          return node.name.value === r.from;
        });

        if (rule) {
          logger.debug(`Renaming field ${rule.from} to ${rule.to}`);
          return {
            ...node,
            name: {
              ...node.name,
              value: rule.to,
            },
          };
        }
      },
    });
  }

  private applyStructureChanges(ast: DocumentNode): DocumentNode {
    const structureRules = this.rules.filter((r) => r.type === 'structure-change');

    return visit(ast, {
      Field: {
        enter(node) {
          // Handle edges -> nodes transformation
          if (
            node.name.value === 'edges' &&
            structureRules.some((r) => r.from === 'edges' && r.to === 'nodes')
          ) {
            logger.debug('Transforming edges to nodes');

            // Check if this is a connection pattern
            const hasNodeSelection = node.selectionSet?.selections.some(
              (sel) => sel.kind === 'Field' && sel.name.value === 'node',
            );

            if (hasNodeSelection) {
              // Replace edges { node { ... } } with nodes { ... }
              const nodeField = node.selectionSet?.selections.find(
                (sel) => sel.kind === 'Field' && sel.name.value === 'node',
              ) as any;

              return {
                ...node,
                name: { kind: 'Name', value: 'nodes' },
                selectionSet: nodeField?.selectionSet,
              };
            }
          }
        },
      },
    });
  }

  // Common transformation patterns
  static commonRules = {
    allVenturesToVentures: {
      type: 'field-rename' as const,
      from: 'allVentures',
      to: 'ventures',
    },
    edgesToNodes: {
      type: 'structure-change' as const,
      from: 'edges',
      to: 'nodes',
    },
    userToAccount: {
      type: 'field-rename' as const,
      from: 'user',
      to: 'account',
    },
  };
}

// Helper to load rules from deprecation analysis
export async function loadTransformationRules(
  deprecationFile: string,
): Promise<TransformationRule[]> {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(deprecationFile, 'utf-8');
    const deprecations = JSON.parse(content);

    const rules: TransformationRule[] = [];

    // Convert deprecation format to transformation rules
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
            });
          }
        }
      }
    }

    return rules;
  } catch (error) {
    logger.error('Failed to load transformation rules:', error);
    return [];
  }
}
