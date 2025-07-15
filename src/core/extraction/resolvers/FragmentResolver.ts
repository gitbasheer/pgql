import * as fs from 'fs/promises';
import * as path from 'path';
import glob from 'fast-glob';
import { parse, visit, DocumentNode, FragmentDefinitionNode, Kind } from 'graphql';
import { ExtractedQuery, ResolvedQuery, FragmentDefinition } from '../types/index';
import { ExtractionContext } from '../engine/ExtractionContext';
import { logger } from '../../../utils/logger.js';
import { safeParseGraphQL } from '../../../utils/graphqlValidator';
import { validateReadPath } from '../../../utils/securePath';

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
      // SECURITY FIX: Validate path to prevent traversal
      const validatedPath = validateReadPath(filePath);
      if (!validatedPath) {
        logger.warn(`Skipping potentially malicious fragment file: ${filePath}`);
        return;
      }
      
      const content = await fs.readFile(validatedPath, 'utf-8');
      
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
      resolvedContent: this.sanitizeFragmentContent(query.content),
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
    
    // Append all fragment definitions after security validation
    for (const fragment of fragments) {
      const sanitizedContent = this.sanitizeFragmentContent(fragment.content);
      content += '\n\n' + sanitizedContent;
    }
    
    return content;
  }

  private sanitizeFragmentContent(content: string): string {
    // Define dangerous patterns that should be completely blocked
    const dangerousPatterns = [
      /\$\{[^}]*require[^}]*\}/g,                          // Template literal with require
      /\$\{[^}]*eval[^}]*\}/g,                             // Template literal with eval
      /\$\{[^}]*process[^}]*\}/g,                          // Template literal with process
      /\$\{[^}]*global[^}]*\}/g,                           // Template literal with global
      /\$\{[^}]*Function[^}]*\}/g,                         // Template literal with Function
      /\$\{[^}]*fs[^}]*\}/g,                              // Template literal with fs
      /\$\{[^}]*child_process[^}]*\}/g,                   // Template literal with child_process
      /\$\{[^}]*exec[^}]*\}/g,                            // Template literal with exec
      /\$\{[^}]*spawn[^}]*\}/g,                           // Template literal with spawn
      /\$\{[^}]*readFile[^}]*\}/g,                        // Template literal with readFile
      /\$\{[^}]*writeFile[^}]*\}/g,                       // Template literal with writeFile
      /\$\{[^}]*whoami[^}]*\}/g,                          // Template literal with whoami
      /\$\{[^}]*passwd[^}]*\}/g,                          // Template literal with passwd
      /\$\{[^}]*\/etc\/[^}]*\}/g,                         // Template literal with /etc/
      /require\s*\(\s*["']fs["']\s*\)/g,                    // require("fs")
      /require\s*\(\s*["']child_process["']\s*\)/g,         // require("child_process")
      /require\s*\(\s*["'].*["']\s*\)/g,                    // Any require() call
      /eval\s*\(/g,                                         // eval()
      /new\s+Function\s*\(/g,                               // new Function()
      /global\.process/g,                                   // global.process
      /process\.mainModule/g,                               // process.mainModule
      /process\.env/g,                                      // process.env
      /execSync\s*\(/g,                                     // execSync()
      /exec\s*\(/g,                                         // exec()
      /spawn\s*\(/g,                                        // spawn()
      /readFileSync\s*\(/g,                                 // readFileSync()
      /writeFileSync\s*\(/g,                                // writeFileSync()
      /\/etc\/passwd/g,                                     // /etc/passwd
      /whoami/g,                                            // whoami command
    ];
    
    // Check for dangerous patterns and block them completely
    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        logger.error(`Dangerous pattern detected in fragment: ${pattern.toString()}`);
        // Replace the dangerous pattern with a safe placeholder
        content = content.replace(pattern, 'BLOCKED_DANGEROUS_CODE');
      }
    }
    
    return content;
  }
}