import * as fs from 'fs/promises';
import * as path from 'path';
import glob from 'fast-glob';
import { parse, visit, DocumentNode, FragmentDefinitionNode, Kind } from 'graphql';
import { ExtractedQuery, ResolvedQuery, FragmentDefinition } from '../types/index';
import { ExtractionContext } from '../engine/ExtractionContext';
import { logger } from '../../../utils/logger';
import { safeParseGraphQL } from '../../../utils/graphqlValidator';

export class FragmentResolver {
  private context: ExtractionContext;
  private fragmentCache: Map<string, FragmentDefinition>;

  constructor(context: ExtractionContext) {
    this.context = context;
    this.fragmentCache = new Map();
  }

  async resolve(queries: ExtractedQuery[]): Promise<ResolvedQuery[]> {
    // First, collect all fragments from the directory
    await this.collectFragments();
    
    // Then resolve each query
    const resolved: ResolvedQuery[] = [];
    
    for (const query of queries) {
      const resolvedQuery = await this.resolveQuery(query);
      resolved.push(resolvedQuery);
    }
    
    return resolved;
  }

  private async collectFragments(): Promise<void> {
    const directory = this.context.options.fragmentsDirectory || this.context.options.directory;
    
    logger.info(`Collecting fragments from ${directory}`);
    
    const files = await glob(['**/*.{js,jsx,ts,tsx,graphql,gql}'], {
      cwd: directory,
      absolute: true,
      ignore: ['**/node_modules/**', '**/__generated__/**']
    });
    
    for (const file of files) {
      await this.extractFragmentsFromFile(file);
    }
    
    logger.info(`Collected ${this.fragmentCache.size} fragments`);
  }

  private async extractFragmentsFromFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Try different extraction methods
      const fragments = await this.extractFragmentsFromContent(content, filePath);
      
      for (const fragment of fragments) {
        this.fragmentCache.set(fragment.name, fragment);
        this.context.fragments.set(fragment.name, fragment.content);
      }
    } catch (error) {
      logger.debug(`Could not extract fragments from ${filePath}:`, error);
    }
  }

  private async extractFragmentsFromContent(content: string, filePath: string): Promise<FragmentDefinition[]> {
    const fragments: FragmentDefinition[] = [];
    
    // Method 1: Direct GraphQL fragments
    if (filePath.endsWith('.graphql') || filePath.endsWith('.gql')) {
      const validation = safeParseGraphQL(content);
      if (validation.isValid && validation.ast) {
        const fragmentDefs = this.extractFragmentDefinitions(validation.ast, filePath);
        fragments.push(...fragmentDefs);
      }
    }
    
    // Method 2: JavaScript/TypeScript files with GraphQL
    else {
      // Look for fragment patterns
      const fragmentPattern = /fragment\s+(\w+)\s+on\s+\w+\s*{[\s\S]*?}/g;
      let match;
      
      while ((match = fragmentPattern.exec(content)) !== null) {
        const fragmentContent = match[0];
        const validation = safeParseGraphQL(fragmentContent);
        
        if (validation.isValid && validation.ast) {
          const fragmentDefs = this.extractFragmentDefinitions(validation.ast, filePath);
          fragments.push(...fragmentDefs);
        }
      }
      
      // Also check for exported fragments
      const exportPattern = /export\s+const\s+(\w+Fragment)\s*=\s*gql`([\s\S]*?)`;/g;
      
      while ((match = exportPattern.exec(content)) !== null) {
        const fragmentContent = match[2];
        const validation = safeParseGraphQL(fragmentContent);
        
        if (validation.isValid && validation.ast) {
          const fragmentDefs = this.extractFragmentDefinitions(validation.ast, filePath);
          fragments.push(...fragmentDefs);
        }
      }
    }
    
    return fragments;
  }

  private extractFragmentDefinitions(ast: DocumentNode, filePath: string): FragmentDefinition[] {
    const fragments: FragmentDefinition[] = [];
    
    visit(ast, {
      FragmentDefinition: (node: FragmentDefinitionNode) => {
        const dependencies = this.extractFragmentDependencies(node);
        
        fragments.push({
          name: node.name.value,
          content: this.printFragment(node),
          ast: {
            kind: Kind.DOCUMENT,
            definitions: [node]
          },
          filePath,
          dependencies
        });
      }
    });
    
    return fragments;
  }

  private extractFragmentDependencies(node: FragmentDefinitionNode): string[] {
    const dependencies: string[] = [];
    
    visit(node, {
      FragmentSpread: (spreadNode) => {
        dependencies.push(spreadNode.name.value);
      }
    });
    
    return dependencies;
  }

  private printFragment(node: FragmentDefinitionNode): string {
    // Simple fragment printer
    return `fragment ${node.name.value} on ${node.typeCondition.name.value} { ... }`;
  }

  private async resolveQuery(query: ExtractedQuery): Promise<ResolvedQuery> {
    const resolvedQuery: ResolvedQuery = {
      ...query,
      resolvedContent: query.content,
      resolvedFragments: [],
      allDependencies: []
    };
    
    // Find all fragment spreads in the query
    const fragmentNames = query.ast ? this.findFragmentSpreads(query.ast) : [];
    
    if (fragmentNames.length === 0) {
      return resolvedQuery;
    }
    
    // Resolve all fragments recursively
    const resolved = new Set<string>();
    const toResolve = [...fragmentNames];
    
    while (toResolve.length > 0) {
      const fragmentName = toResolve.shift()!;
      
      if (resolved.has(fragmentName)) {
        continue;
      }
      
      const fragment = this.fragmentCache.get(fragmentName);
      if (fragment) {
        resolved.add(fragmentName);
        resolvedQuery.resolvedFragments.push(fragment);
        
        // Add dependencies to resolve
        for (const dep of fragment.dependencies) {
          if (!resolved.has(dep)) {
            toResolve.push(dep);
          }
        }
      } else {
        logger.warn(`Fragment ${fragmentName} not found for query ${query.name || query.id}`);
      }
    }
    
    resolvedQuery.allDependencies = Array.from(resolved);
    
    // Build the resolved content
    if (this.context.options.inlineFragments) {
      resolvedQuery.resolvedContent = this.buildResolvedContent(query, resolvedQuery.resolvedFragments);
    }
    
    return resolvedQuery;
  }

  private findFragmentSpreads(ast: DocumentNode): string[] {
    const fragments: string[] = [];
    
    visit(ast, {
      FragmentSpread: (node) => {
        fragments.push(node.name.value);
      }
    });
    
    return fragments;
  }

  private buildResolvedContent(query: ExtractedQuery, fragments: FragmentDefinition[]): string {
    let content = query.content;
    
    // Append all fragment definitions
    for (const fragment of fragments) {
      content += '\n\n' + fragment.content;
    }
    
    return content;
  }
}