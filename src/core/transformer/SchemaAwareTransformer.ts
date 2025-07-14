import { DocumentNode, visit, print, parse, FieldNode, Kind } from 'graphql';
import { DeprecationRule } from '../analyzer/SchemaDeprecationAnalyzer';
import { logger } from '../../utils/logger';

export interface TransformOptions {
  commentOutVague: boolean;
  addDeprecationComments: boolean;
  preserveOriginalAsComment: boolean;
}

export class SchemaAwareTransformer {
  constructor(
    private deprecationRules: DeprecationRule[],
    private options: TransformOptions = {
      commentOutVague: true,
      addDeprecationComments: true,
      preserveOriginalAsComment: false
    }
  ) {}

  private createNestedField(parts: string[], originalNode: FieldNode): FieldNode {
    // For nested replacements like logoUrl -> profile.logoUrl
    // We need to create the nested structure
    if (parts.length === 2) {
      const [parent, child] = parts;
      return {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: parent },
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [{
            kind: Kind.FIELD,
            name: { kind: Kind.NAME, value: child }
          }]
        }
      };
    }
    
    // For now, just return the last part as field name
    return {
      ...originalNode,
      name: {
        ...originalNode.name,
        value: parts[parts.length - 1]
      }
    };
  }

  transform(query: string | DocumentNode): { transformed: string; changes: Change[] } {
    const ast = typeof query === 'string' ? parse(query) : query;
    const changes: Change[] = [];
    
    // Build lookup maps for efficient rule matching
    const rulesByField = new Map<string, DeprecationRule[]>();
    for (const rule of this.deprecationRules) {
      const key = rule.fieldName;
      if (!rulesByField.has(key)) {
        rulesByField.set(key, []);
      }
      rulesByField.get(key)!.push(rule);
    }

    // Track parent type for context
    let currentType = 'Query'; // Default to Query
    let parentTypes: string[] = ['Query'];
    
    // Store reference to this for use in visitor
    const self = this;

    const transformedAst = visit(ast, {
      Field: {
        enter(node, key, parent, path) {
          const fieldName = node.name.value;
          const rules = rulesByField.get(fieldName) || [];
          
          // Find matching rule based on parent type
          const matchingRule = rules.find(r => {
            // Try to match with current context
            return parentTypes.includes(r.objectType) || 
                   r.objectType === 'CustomerQuery' || 
                   r.objectType === 'CurrentUser' ||
                   r.objectType === 'Venture' ||
                   r.objectType === 'Project';
          });

          if (matchingRule) {
            if (matchingRule.isVague && self.options.commentOutVague) {
              // Comment out fields with vague deprecations
              changes.push({
                type: 'comment-out',
                field: fieldName,
                reason: matchingRule.deprecationReason,
                line: node.loc?.startToken.line || 0
              });
              
              // Return null to remove the field from AST
              return null;
            } else if (!matchingRule.isVague && matchingRule.replacement) {
              // Handle replacements
              if (matchingRule.replacement.includes('.')) {
                // Nested replacement (e.g., logoUrl -> profile.logoUrl)
                changes.push({
                  type: 'nested-replacement',
                  field: fieldName,
                  replacement: matchingRule.replacement,
                  reason: matchingRule.deprecationReason,
                  line: node.loc?.startToken.line || 0
                });
                
                // Create nested structure
                const parts = matchingRule.replacement.split('.');
                return self.createNestedField(parts, node);
              } else {
                // Simple field rename
                changes.push({
                  type: 'field-rename',
                  field: fieldName,
                  replacement: matchingRule.replacement,
                  reason: matchingRule.deprecationReason,
                  line: node.loc?.startToken.line || 0
                });
                
                return {
                  ...node,
                  name: {
                    ...node.name,
                    value: matchingRule.replacement
                  }
                };
              }
            }
          }
          
          // Update type context based on field selections
          if (node.selectionSet) {
            // Simple type inference based on common patterns
            if (fieldName === 'user' || fieldName === 'me') {
              parentTypes.push('CurrentUser');
            } else if (fieldName === 'venture' || fieldName === 'ventures') {
              parentTypes.push('Venture');
            } else if (fieldName === 'project' || fieldName === 'projects') {
              parentTypes.push('Project');
            }
          }
        },
        leave(node) {
          // Pop type context when leaving field with selections
          if (node.selectionSet) {
            parentTypes.pop();
          }
        }
      }
    });

    // Convert AST back to string
    let transformedQuery = print(transformedAst);
    
    // Add comments for vague deprecations if requested
    if (this.options.commentOutVague) {
      transformedQuery = this.addVagueDeprecationComments(transformedQuery, changes);
    }

    return { transformed: transformedQuery, changes };
  }

  private addVagueDeprecationComments(query: string, changes: Change[]): string {
    // Group changes by line for efficient processing
    const changesByLine = new Map<number, Change[]>();
    for (const change of changes) {
      if (change.type === 'comment-out') {
        const line = change.line || 0;
        if (!changesByLine.has(line)) {
          changesByLine.set(line, []);
        }
        changesByLine.get(line)!.push(change);
      }
    }

    // Add comments for commented out fields
    const lines = query.split('\n');
    const processedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const lineChanges = changesByLine.get(i + 1) || [];
      
      for (const change of lineChanges) {
        if (change.type === 'comment-out') {
          processedLines.push(`    # DEPRECATED: ${change.field} - ${change.reason}`);
          processedLines.push(`    # TODO: This field has been commented out due to vague deprecation reason`);
        }
      }
      
      processedLines.push(lines[i]);
    }

    return processedLines.join('\n');
  }
}

export interface Change {
  type: 'field-rename' | 'nested-replacement' | 'comment-out';
  field: string;
  replacement?: string;
  reason: string;
  line?: number;
}