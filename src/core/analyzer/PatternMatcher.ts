import { match, P } from 'ts-pattern';
import { DocumentNode, OperationDefinitionNode, SelectionNode } from 'graphql';

export type QueryPattern =
  | { type: 'SIMPLE_QUERY'; depth: 1 }
  | { type: 'NESTED_QUERY'; depth: number; fragments: string[] }
  | { type: 'PAGINATED_QUERY'; connectionType: string }
  | { type: 'SUBSCRIPTION'; eventType: string };

export class PatternMatcher {
  analyzeQueryPattern(query: DocumentNode): QueryPattern {
    const definition = query.definitions[0] as OperationDefinitionNode;
    
    // Check for subscription
    if (definition.operation === 'subscription') {
      return {
        type: 'SUBSCRIPTION' as const,
        eventType: this.extractEventType(definition)
      };
    }
    
    // Check for pagination pattern
    const hasPagination = this.hasPaginationPattern(definition);
    if (hasPagination) {
      return {
        type: 'PAGINATED_QUERY' as const,
        connectionType: this.extractConnectionType(definition)
      };
    }
    
    // Default to nested query analysis
    return {
      type: 'NESTED_QUERY' as const,
      depth: this.calculateDepth(definition),
      fragments: this.extractFragments(definition)
    };
  }
  
  private hasPaginationPattern(def: OperationDefinitionNode): boolean {
    if (!def.selectionSet) return false;
    
    for (const selection of def.selectionSet.selections) {
      if ('name' in selection && selection.name.value.endsWith('Connection')) {
        return true;
      }
    }
    return false;
  }

  detectMigrationPattern(oldQuery: string, newQuery: string): MigrationPattern {
    return match({ old: oldQuery, new: newQuery })
      .when(
        ({ old, new: newQ }) => 
          old.includes('edges') && newQ.includes('nodes'),
        () => ({ type: 'EDGE_TO_NODE_MIGRATION' as const })
      )
      .when(
        ({ old, new: newQ }) => 
          old.includes('pageInfo') && !newQ.includes('pageInfo'),
        () => ({ type: 'PAGINATION_REMOVAL' as const })
      )
      .when(
        ({ old, new: newQ }) => {
          const oldFields = this.extractFieldNames(old);
          const newFields = this.extractFieldNames(newQ);
          return oldFields.length !== newFields.length;
        },
        () => ({ type: 'FIELD_SELECTION_CHANGE' as const })
      )
      .otherwise(() => ({ type: 'UNKNOWN_PATTERN' as const }));
  }

  private extractEventType(def: OperationDefinitionNode): string {
    // Extract subscription event type from selection
    const firstSelection = def.selectionSet?.selections[0];
    if (firstSelection && 'name' in firstSelection) {
      return firstSelection.name.value;
    }
    return 'unknown';
  }

  private extractConnectionType(def: OperationDefinitionNode): string {
    // Find first field that ends with 'Connection'
    for (const selection of def.selectionSet?.selections || []) {
      if ('name' in selection && selection.name.value.endsWith('Connection')) {
        return selection.name.value;
      }
    }
    return 'unknown';
  }

  private calculateDepth(def: OperationDefinitionNode): number {
    let maxDepth = 0;

    const traverse = (selections: readonly SelectionNode[], depth: number) => {
      maxDepth = Math.max(maxDepth, depth);
      
      for (const selection of selections) {
        if ('selectionSet' in selection && selection.selectionSet) {
          traverse(selection.selectionSet.selections, depth + 1);
        }
      }
    };

    if (def.selectionSet) {
      traverse(def.selectionSet.selections, 1);
    }

    return maxDepth;
  }

  private extractFragments(def: OperationDefinitionNode): string[] {
    const fragments: string[] = [];

    const traverse = (selections: readonly SelectionNode[]) => {
      for (const selection of selections) {
        if (selection.kind === 'FragmentSpread') {
          fragments.push(selection.name.value);
        }
        if ('selectionSet' in selection && selection.selectionSet) {
          traverse(selection.selectionSet.selections);
        }
      }
    };

    if (def.selectionSet) {
      traverse(def.selectionSet.selections);
    }

    return fragments;
  }

  private extractFieldNames(query: string): string[] {
    // Simple field extraction for pattern matching
    const fieldPattern = /(\w+)\s*[:{]/g;
    const fields: string[] = [];
    let match;
    
    while ((match = fieldPattern.exec(query)) !== null) {
      fields.push(match[1]);
    }
    
    return fields;
  }
}

export type MigrationPattern = 
  | { type: 'EDGE_TO_NODE_MIGRATION' }
  | { type: 'PAGINATION_REMOVAL' }
  | { type: 'FIELD_SELECTION_CHANGE' }
  | { type: 'UNKNOWN_PATTERN' };