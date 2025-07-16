import { DocumentNode, OperationDefinitionNode, visit, Kind } from 'graphql';
import { logger } from '../../utils/logger.js';

export interface OperationSignature {
  name: string | null;
  type: 'query' | 'mutation' | 'subscription';
  variables: string[];
  selections: string[];
  fragments: string[];
}

export interface OperationVariant {
  id: string;
  filePath: string;
  signature: OperationSignature;
  content: string;
}

export interface OperationGroup {
  canonicalName: string;
  type: 'query' | 'mutation' | 'subscription';
  variants: OperationVariant[];
  commonVariables: string[];
  commonSelections: string[];
  differingSelections: string[];
}

export class OperationAnalyzer {
  private operationGroups: Map<string, OperationGroup> = new Map();

  analyzeOperations(
    queries: Array<{
      id: string;
      filePath: string;
      content: string;
      ast?: DocumentNode;
      name?: string;
      type: string;
    }>,
  ): Map<string, OperationGroup> {
    // First, extract signatures for all operations
    const operations: OperationVariant[] = [];

    for (const query of queries) {
      try {
        const signature = this.extractOperationSignature(query.content, query.ast);
        if (signature) {
          operations.push({
            id: query.id,
            filePath: query.filePath,
            signature,
            content: query.content,
          });
        }
      } catch (error) {
        logger.warn(`Failed to analyze operation ${query.id}:`, error);
      }
    }

    // Group operations by similarity
    this.groupOperations(operations);

    return this.operationGroups;
  }

  private extractOperationSignature(
    content: string,
    ast?: DocumentNode,
  ): OperationSignature | null {
    try {
      const document = ast || require('graphql').parse(content);

      let signature: OperationSignature | null = null;
      const self = this;

      visit(document, {
        OperationDefinition: {
          enter(node: OperationDefinitionNode) {
            const variables = node.variableDefinitions?.map((v) => v.variable.name.value) || [];
            const selections = self.extractSelections(node);
            const fragments = self.extractFragmentReferences(node);

            signature = {
              name: node.name?.value || null,
              type: node.operation,
              variables: variables.sort(),
              selections: selections.sort(),
              fragments: fragments.sort(),
            };
          },
        },
      });

      return signature;
    } catch (error) {
      return null;
    }
  }

  private extractSelections(node: any): string[] {
    const selections: string[] = [];

    const traverse = (selectionSet: any, path: string = '') => {
      if (!selectionSet || !selectionSet.selections) return;

      for (const selection of selectionSet.selections) {
        if (selection.kind === Kind.FIELD) {
          const fieldName = selection.name.value;
          const fullPath = path ? `${path}.${fieldName}` : fieldName;
          selections.push(fullPath);

          // Only traverse one level deep to avoid huge paths
          if (path.split('.').length < 2 && selection.selectionSet) {
            traverse(selection.selectionSet, fullPath);
          }
        } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
          selections.push(`...${selection.name.value}`);
        }
      }
    };

    traverse(node.selectionSet);
    return selections;
  }

  private extractFragmentReferences(node: any): string[] {
    const fragments: string[] = [];

    visit(node, {
      FragmentSpread: {
        enter(fragNode) {
          fragments.push(fragNode.name.value);
        },
      },
    });

    return [...new Set(fragments)];
  }

  private groupOperations(operations: OperationVariant[]): void {
    // Group by operation name first
    const namedGroups = new Map<string, OperationVariant[]>();
    const unnamedByType = new Map<string, OperationVariant[]>();

    for (const op of operations) {
      if (op.signature.name) {
        const key = `${op.signature.name}_${op.signature.type}`;
        if (!namedGroups.has(key)) {
          namedGroups.set(key, []);
        }
        namedGroups.get(key)!.push(op);
      } else {
        // Group unnamed operations by type and similarity
        const typeKey = op.signature.type;
        if (!unnamedByType.has(typeKey)) {
          unnamedByType.set(typeKey, []);
        }
        unnamedByType.get(typeKey)!.push(op);
      }
    }

    // Process named groups
    for (const [key, variants] of namedGroups) {
      const [name, type] = key.split('_');
      this.createOperationGroup(name, type as any, variants);
    }

    // Process unnamed groups with similarity detection
    for (const [type, variants] of unnamedByType) {
      this.groupUnnamedOperations(type as any, variants);
    }
  }

  private groupUnnamedOperations(
    type: 'query' | 'mutation' | 'subscription',
    variants: OperationVariant[],
  ): void {
    const groups: OperationVariant[][] = [];

    for (const variant of variants) {
      let added = false;

      // Try to find a similar group
      for (const group of groups) {
        if (this.areSimilarOperations(variant, group[0])) {
          group.push(variant);
          added = true;
          break;
        }
      }

      // Create new group if no similar one found
      if (!added) {
        groups.push([variant]);
      }
    }

    // Create operation groups
    let groupIndex = 1;
    for (const group of groups) {
      const name = `unnamed_${type}_${groupIndex++}`;
      this.createOperationGroup(name, type, group);
    }
  }

  private areSimilarOperations(op1: OperationVariant, op2: OperationVariant): boolean {
    const sig1 = op1.signature;
    const sig2 = op2.signature;

    // Must be same type
    if (sig1.type !== sig2.type) return false;

    // Calculate similarity based on selections
    const commonSelections = sig1.selections.filter((s) => sig2.selections.includes(s));
    const totalSelections = new Set([...sig1.selections, ...sig2.selections]).size;

    if (totalSelections === 0) return true; // Both empty

    const similarity = commonSelections.length / totalSelections;

    // Consider similar if 70% or more overlap
    return similarity >= 0.7;
  }

  private createOperationGroup(
    name: string,
    type: 'query' | 'mutation' | 'subscription',
    variants: OperationVariant[],
  ): void {
    // Find common elements
    const allVariables = new Set<string>();
    const allSelections = new Set<string>();
    const commonVariables: string[] = [];
    const commonSelections: string[] = [];

    // Collect all variables and selections
    for (const variant of variants) {
      variant.signature.variables.forEach((v) => allVariables.add(v));
      variant.signature.selections.forEach((s) => allSelections.add(s));
    }

    // Find common variables (present in all variants)
    for (const variable of allVariables) {
      if (variants.every((v) => v.signature.variables.includes(variable))) {
        commonVariables.push(variable);
      }
    }

    // Find common selections (present in all variants)
    for (const selection of allSelections) {
      if (variants.every((v) => v.signature.selections.includes(selection))) {
        commonSelections.push(selection);
      }
    }

    // Find differing selections
    const differingSelections = Array.from(allSelections).filter(
      (s) => !commonSelections.includes(s),
    );

    const group: OperationGroup = {
      canonicalName: name,
      type,
      variants,
      commonVariables: commonVariables.sort(),
      commonSelections: commonSelections.sort(),
      differingSelections: differingSelections.sort(),
    };

    this.operationGroups.set(name, group);
  }

  generateOperationReport(): {
    totalOperations: number;
    uniqueOperations: number;
    operationsByType: Record<string, number>;
    duplicateOperations: Array<{
      name: string;
      variantCount: number;
      files: string[];
    }>;
    unnamedOperations: number;
    fragmentUsage: Array<{
      fragment: string;
      usageCount: number;
      operations: string[];
    }>;
  } {
    const report: any = {
      totalOperations: 0,
      uniqueOperations: this.operationGroups.size,
      operationsByType: {
        query: 0,
        mutation: 0,
        subscription: 0,
      },
      duplicateOperations: [],
      unnamedOperations: 0,
      fragmentUsage: new Map<string, Set<string>>(),
    };

    const fragmentUsageMap = new Map<string, Set<string>>();

    for (const [name, group] of this.operationGroups) {
      report.totalOperations += group.variants.length;
      report.operationsByType[group.type]++;

      if (name.startsWith('unnamed_')) {
        report.unnamedOperations++;
      }

      if (group.variants.length > 1) {
        report.duplicateOperations.push({
          name: group.canonicalName,
          variantCount: group.variants.length,
          files: [...new Set(group.variants.map((v) => v.filePath))],
        });
      }

      // Track fragment usage
      for (const variant of group.variants) {
        for (const fragment of variant.signature.fragments) {
          if (!fragmentUsageMap.has(fragment)) {
            fragmentUsageMap.set(fragment, new Set());
          }
          fragmentUsageMap.get(fragment)!.add(group.canonicalName);
        }
      }
    }

    // Convert fragment usage to array
    report.fragmentUsage = Array.from(fragmentUsageMap.entries())
      .map(([fragment, operations]) => ({
        fragment,
        usageCount: operations.size,
        operations: Array.from(operations).sort(),
      }))
      .sort((a, b) => b.usageCount - a.usageCount);

    return report;
  }

  getSuggestedNames(): Map<string, string> {
    const suggestions = new Map<string, string>();

    for (const [name, group] of this.operationGroups) {
      if (name.startsWith('unnamed_')) {
        // Suggest name based on main selections
        const mainSelections = group.commonSelections
          .filter((s) => !s.startsWith('...'))
          .slice(0, 3);

        if (mainSelections.length > 0) {
          const suggestedName = mainSelections
            .map((s) => s.split('.')[0])
            .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
            .join('');

          suggestions.set(name, `Get${suggestedName}`);
        }
      }
    }

    return suggestions;
  }

  validateOperation(operation: any): boolean {
    // Default implementation
    return true;
  }
}
