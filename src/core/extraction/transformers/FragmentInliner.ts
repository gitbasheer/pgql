import { parse, print, visit, DocumentNode } from 'graphql';
import { ResolvedQuery } from '../types/index';
import { ExtractionContext } from '../engine/ExtractionContext';
import { logger } from '../../../utils/logger.js';

export class FragmentInliner {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async transform(queries: ResolvedQuery[]): Promise<ResolvedQuery[]> {
    return queries.map(query => {
      if (query.resolvedFragments.length === 0) {
        return query;
      }
      
      try {
        const inlinedContent = this.inlineFragments(query);
        
        return {
          ...query,
          resolvedContent: inlinedContent
        };
      } catch (error) {
        logger.error(`Failed to inline fragments for ${query.name}:`, error);
        return query;
      }
    });
  }

  private inlineFragments(query: ResolvedQuery): string {
    // Parse the query
    const ast = parse(query.content);
    
    // Create a fragment map
    const fragmentMap = new Map<string, DocumentNode>();
    for (const fragment of query.resolvedFragments) {
      fragmentMap.set(fragment.name, fragment.ast);
    }
    
    // Inline the fragments
    const inlinedAst = visit(ast, {
      FragmentSpread: {
        leave: (node) => {
          const fragmentName = node.name.value;
          const fragmentAst = fragmentMap.get(fragmentName);
          
          if (fragmentAst && fragmentAst.definitions[0]?.kind === 'FragmentDefinition') {
            const fragmentDef = fragmentAst.definitions[0];
            
            // Return the selection set of the fragment
            return {
              kind: 'InlineFragment',
              typeCondition: fragmentDef.typeCondition,
              selectionSet: fragmentDef.selectionSet,
              directives: node.directives
            };
          }
          
          return node;
        }
      }
    });
    
    // Print the inlined query
    return print(inlinedAst);
  }
}