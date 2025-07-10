import { ExtractedQuery } from '../types/index';
import { ExtractionContext } from '../engine/ExtractionContext';
import { logger } from '../../../utils/logger';
import * as babel from '@babel/parser';
import traverseDefault from '@babel/traverse';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateReadPath } from '../../../utils/securePath';

interface TemplateInterpolation {
  start: number;
  end: number;
  expression: string;
  resolvedValue?: string;
}

interface FragmentCollection {
  [key: string]: string;
}

export class TemplateResolver {
  private context: ExtractionContext;
  private fragmentCache: Map<string, string> = new Map();
  private fileCache: Map<string, string> = new Map();
  
  constructor(context: ExtractionContext) {
    this.context = context;
  }
  
  /**
   * Resolve template interpolations in GraphQL queries
   */
  async resolveTemplates(queries: ExtractedQuery[]): Promise<ExtractedQuery[]> {
    // First, load all available fragments
    await this.loadAllFragments();
    
    const resolved = queries.map(query => {
      if (!query.content.includes('${')) {
        return query;
      }
      
      try {
        const resolvedQuery = this.resolveQueryTemplate(query);
        return resolvedQuery;
      } catch (error) {
        logger.warn(`Failed to resolve template for query ${query.id}:`, error);
        return query;
      }
    });

    return resolved;
  }

  /**
   * Load all fragments from the project
   */
  private async loadAllFragments(): Promise<void> {
    try {
      const baseDir = this.context.options.directory;
      const fragmentFiles = [
        'fragments.js',
        'profileFragments.js',
        'shared-graph-queries-v1.js',
        'shared-graph-queries-v2.js',
        'shared-graph-queries-v3.js'
      ];

      for (const file of fragmentFiles) {
        const filePath = path.join(baseDir, file);
        
        // SECURITY FIX: Validate path to prevent traversal
        const validatedPath = validateReadPath(baseDir, file);
        if (!validatedPath) {
          logger.warn(`Skipping potentially malicious fragment file: ${file}`);
          continue;
        }
        
        try {
          const content = await fs.readFile(validatedPath, 'utf-8');
          this.fileCache.set(file, content);
          await this.extractFragmentsFromFile(validatedPath, content);
        } catch (error) {
          // File might not exist, continue
        }
      }

      logger.info(`Loaded ${this.fragmentCache.size} fragments for template resolution`);
      
      // Post-process fragments to resolve any internal interpolations
      this.resolveFragmentInterpolations();
    } catch (error) {
      logger.warn('Failed to load fragments:', error);
    }
  }

  /**
   * Extract fragments from a file
   */
  private async extractFragmentsFromFile(filePath: string, content: string): Promise<void> {
    try {
      // Extract string fragments (non-gql tagged)
      const stringFragmentPattern = /export\s+const\s+(\w+Fragment\w*)\s*=\s*`([^`]+)`/gs;
      let match;
      while ((match = stringFragmentPattern.exec(content)) !== null) {
        const [, name, fragmentContent] = match;
        // Store raw content first, resolve interpolations later
        this.fragmentCache.set(name, fragmentContent.trim());
      }

      // Extract gql tagged fragments and also analyze functions for local variable resolution
      const ast = babel.parse(content, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        plugins: ['jsx', 'typescript', 'decorators-legacy']
      });

      // Store file AST for later variable resolution
      this.fileCache.set(`${filePath}_ast`, JSON.stringify(ast));

      traverseDefault(ast, {
        ExportNamedDeclaration: (path: any) => {
          if (path.node.declaration?.type === 'VariableDeclaration') {
            path.node.declaration.declarations.forEach((decl: any) => {
              if (decl.id.name && decl.init) {
                const name = decl.id.name;
                
                if (decl.init.type === 'TaggedTemplateExpression' && 
                    this.isGqlTag(decl.init.tag)) {
                  const content = this.reconstructTemplate(decl.init.quasi);
                  this.fragmentCache.set(name, content);
                } else if (decl.init.type === 'TemplateLiteral') {
                  const content = this.reconstructTemplate(decl.init);
                  this.fragmentCache.set(name, content);
                }
              }
            });
          }
        }
      });
    } catch (error) {
      logger.debug(`Failed to parse ${filePath} for fragments:`, error);
    }
  }
  
  /**
   * Resolve interpolations within fragments themselves
   */
  private resolveFragmentInterpolations(): void {
    const fragmentNames = Array.from(this.fragmentCache.keys());
    let changed = true;
    let iteration = 0;
    const maxIterations = 5;
    
    while (changed && iteration < maxIterations) {
      changed = false;
      iteration++;
      
      for (const fragmentName of fragmentNames) {
        const originalContent = this.fragmentCache.get(fragmentName) || '';
        if (originalContent.includes('${')) {
          const resolvedContent = this.resolveSimpleInterpolations(originalContent);
          if (resolvedContent !== originalContent) {
            this.fragmentCache.set(fragmentName, resolvedContent);
            changed = true;
            logger.debug(`Resolved interpolations in fragment ${fragmentName} (iteration ${iteration})`);
          }
        }
      }
    }
    
    if (iteration > 1) {
      logger.info(`Resolved fragment interpolations in ${iteration} iterations`);
    }
  }
  
  private resolveQueryTemplate(query: ExtractedQuery): ExtractedQuery {
    let resolvedContent = query.content;
    let iteration = 0;
    const maxIterations = 10; // Prevent infinite loops
    
    // First try to resolve using JavaScript context
    resolvedContent = this.resolveUsingJavaScriptContext(query);
    
    // Keep resolving until no more interpolations are found or max iterations reached
    while (resolvedContent.includes('${') && iteration < maxIterations) {
      const previousContent = resolvedContent;
      resolvedContent = this.resolveSimpleInterpolations(resolvedContent);
      
      // If no changes were made in this iteration, break to avoid infinite loop
      if (resolvedContent === previousContent) {
        break;
      }
      iteration++;
    }
    
    // If content changed, update the query
    if (resolvedContent !== query.content) {
      return {
        ...query,
        content: resolvedContent,
        metadata: {
          ...query.metadata,
          hasInterpolations: true,
          wasResolved: true,
          resolvedIterations: iteration
        }
      };
    }
    
    return query;
  }

  /**
   * Resolve interpolations using JavaScript context from the source file
   */
  private resolveUsingJavaScriptContext(query: ExtractedQuery): string {
    if (!query.content.includes('${')) {
      return query.content;
    }

    const filePath = query.filePath;
    const fileContent = this.fileCache.get(path.basename(filePath)) || '';
    
    if (!fileContent) {
      logger.info(`No file content found for ${path.basename(filePath)}`);
      return query.content;
    }

    let resolvedContent = query.content;
    
    // Pattern 1: ${fragment} where fragment is a local variable assignment
    if (resolvedContent.includes('${fragment}')) {
      // Look for all fragment assignments in the function scope
      const fragmentMatches = fileContent.match(/fragment\s*=\s*(\w+)/g);
      if (fragmentMatches) {
        for (const fragmentMatch of fragmentMatches) {
          const match = fragmentMatch.match(/fragment\s*=\s*(\w+)/);
          if (match && this.fragmentCache.has(match[1])) {
            logger.info(`Resolving local fragment variable: fragment = ${match[1]}`);
            resolvedContent = resolvedContent.replace(/\$\{fragment\}/g, this.fragmentCache.get(match[1]) || '');
          }
        }
      }
    }
    
    // Pattern 2: ${queryName} where queryName comes from queryNames
    if (resolvedContent.includes('${queryName}')) {
      const queryNameMatches = fileContent.match(/queryName\s*=\s*(?:ventureId\s*\?\s*)?queryNames\.(\w+)(?:\s*:\s*queryNames\.(\w+))?/g);
      if (queryNameMatches && this.context.queryNames) {
        for (const queryNameMatch of queryNameMatches) {
          const match = queryNameMatch.match(/queryNames\.(\w+)(?:\s*:\s*queryNames\.(\w+))?/);
          if (match) {
            const firstChoice = match[1];
            const secondChoice = match[2];
            // Use first choice by default (assume true condition)
            const resolvedName = this.context.queryNames[firstChoice] || this.context.queryNames[secondChoice] || firstChoice;
            logger.info(`Resolving queryName variable: ${firstChoice} -> ${resolvedName}`);
            resolvedContent = resolvedContent.replace(/\$\{queryName\}/g, resolvedName);
          }
        }
      }
    }
    
    // Pattern 3: ${queryArgs} - resolve common patterns
    if (resolvedContent.includes('${queryArgs}')) {
      const queryArgsMatches = fileContent.match(/queryArgs\s*=\s*(?:ventureId\s*\?\s*)?['"`]([^'"`]+)['"`](?:\s*:\s*['"`]([^'"`]+)['"`])?/g);
      if (queryArgsMatches) {
        for (const queryArgsMatch of queryArgsMatches) {
          const match = queryArgsMatch.match(/['"`]([^'"`]+)['"`]/);
          if (match) {
            const resolvedArgs = match[1];
            logger.info(`Resolving queryArgs variable: ${resolvedArgs}`);
            resolvedContent = resolvedContent.replace(/\$\{queryArgs\}/g, resolvedArgs);
          }
        }
      }
    }
    
    // Pattern 4: ${ventureQuery} and ${ventureArgs}
    if (resolvedContent.includes('${ventureQuery}')) {
      const ventureQueryMatches = fileContent.match(/ventureQuery\s*=\s*(?:ventureId\s*\?\s*)?['"`]([^'"`]+)['"`](?:\s*:\s*['"`]([^'"`]+)['"`])?/g);
      if (ventureQueryMatches) {
        for (const ventureQueryMatch of ventureQueryMatches) {
          const match = ventureQueryMatch.match(/['"`]([^'"`]+)['"`]/);
          if (match) {
            const resolvedVentureQuery = match[1];
            logger.info(`Resolving ventureQuery variable: ${resolvedVentureQuery}`);
            resolvedContent = resolvedContent.replace(/\$\{ventureQuery\}/g, resolvedVentureQuery);
          }
        }
      }
    }
    
    if (resolvedContent.includes('${ventureArgs}')) {
      const ventureArgsMatches = fileContent.match(/ventureArgs\s*=\s*(?:ventureId\s*\?\s*)?['"`]([^'"`]+)['"`](?:\s*:\s*['"`]([^'"`]+)['"`])?/g);
      if (ventureArgsMatches) {
        for (const ventureArgsMatch of ventureArgsMatches) {
          const match = ventureArgsMatch.match(/['"`]([^'"`]+)['"`]/);
          if (match) {
            const resolvedVentureArgs = match[1];
            logger.info(`Resolving ventureArgs variable: ${resolvedVentureArgs}`);
            resolvedContent = resolvedContent.replace(/\$\{ventureArgs\}/g, resolvedVentureArgs);
          }
        }
      }
    }
    
    return resolvedContent;
  }

  /**
   * Resolve interpolations using pattern matching and fragment cache
   */
  private resolveSimpleInterpolations(content: string): string {
    let resolved = content;
    
    // Handle conditional fragments with spread: ...${condition ? fragment1 : fragment2}
    const conditionalSpreadPattern = /\.\.\.\$\{\s*([^}]*\?[^}]*:[^}]*)\s*\}/g;
    resolved = resolved.replace(conditionalSpreadPattern, (match, condition) => {
      logger.debug(`Resolving conditional spread: ${condition}`);
      
      // For conditional like "infinityStoneEnabled ? 'ventureInfinityStoneDataFields' : 'ventureFields'"
      const parts = condition.split('?');
      if (parts.length === 2) {
        const alternatives = parts[1].split(':');
        if (alternatives.length === 2) {
          let firstFragment = alternatives[0].trim().replace(/['"]/g, '');
          let secondFragment = alternatives[1].trim().replace(/['"]/g, '');
          
          // Try first option (assume true for now)
          if (this.fragmentCache.has(firstFragment)) {
            return `...${firstFragment}`;
          }
          // Fall back to second option
          if (this.fragmentCache.has(secondFragment)) {
            return `...${secondFragment}`;
          }
          
          // If we don't have cached fragments, try to resolve the field names directly
          if (firstFragment.includes('Fields')) {
            return `...${firstFragment}`;
          }
          if (secondFragment.includes('Fields')) {
            return `...${secondFragment}`;
          }
          
          // Default to the first option for better fallback
          return `...${firstFragment}`;
        }
      }
      // Fallback for malformed conditionals
      return '...ventureFields';
    });

    // Handle conditional fragments: ${condition ? fragment1 : fragment2}
    const conditionalPattern = /\$\{\s*([^}]*\?[^}]*:[^}]*)\s*\}/g;
    resolved = resolved.replace(conditionalPattern, (match, condition) => {
      logger.debug(`Resolving conditional: ${condition}`);
      
      // For conditional like "options.enableVentureProfileData ? ventureFragment : ventureFragmentWithoutProfile"
      const parts = condition.split('?');
      if (parts.length === 2) {
        const alternatives = parts[1].split(':');
        if (alternatives.length === 2) {
          const firstFragment = alternatives[0].trim();
          const secondFragment = alternatives[1].trim();
          
          // Try first option (assume true for now)
          if (this.fragmentCache.has(firstFragment)) {
            return this.fragmentCache.get(firstFragment) || '';
          }
          // Fall back to second option
          if (this.fragmentCache.has(secondFragment)) {
            return this.fragmentCache.get(secondFragment) || '';
          }
          
          // Fallback to first option if neither found in cache
          return this.fragmentCache.get(firstFragment) || firstFragment;
        }
      }
      return 'ventureFragment';
    });

    // Handle simple interpolations: ${fragmentName}
    const simplePattern = /\$\{\s*([^}]+)\s*\}/g;
    resolved = resolved.replace(simplePattern, (match, expression) => {
      const cleanExpr = expression.trim();
      logger.debug(`Resolving expression: ${cleanExpr}`);
      
      // Direct fragment lookup
      if (this.fragmentCache.has(cleanExpr)) {
        logger.info(`Found fragment: ${cleanExpr}`);
        return this.fragmentCache.get(cleanExpr) || '';
      } else {
        logger.info(`Fragment not found: ${cleanExpr}, available: ${Array.from(this.fragmentCache.keys())}`);
      }
      
      // Query name lookup
      if (this.context.queryNames && this.context.queryNames[cleanExpr]) {
        logger.debug(`Found query name: ${cleanExpr}`);
        return this.context.queryNames[cleanExpr];
      }
      
      // Handle property access: queryNames.something
      if (cleanExpr.startsWith('queryNames.')) {
        const property = cleanExpr.split('.')[1];
        if (this.context.queryNames && this.context.queryNames[property]) {
          logger.debug(`Found query name property: ${property} = ${this.context.queryNames[property]}`);
          return this.context.queryNames[property];
        } else {
          logger.debug(`Query name property not found: ${property}, available: ${Object.keys(this.context.queryNames || {})}`);
        }
      }
      
      // Handle common variable names that should resolve to fragments
      if (cleanExpr === 'fragment') {
        // Default to ventureFragment as a fallback
        if (this.fragmentCache.has('ventureFragment')) {
          logger.debug(`Resolving generic fragment variable to ventureFragment`);
          return this.fragmentCache.get('ventureFragment') || '';
        }
      }
      
      // Handle fragment variables that might be dynamic
      const fragmentMapping: { [key: string]: string } = {
        'ventureFragment': 'ventureFragment',
        'ventureFragmentWithoutProfile': 'ventureFragmentWithoutProfile',
        'userFragmentProjectCounts': 'userFragmentProjectCounts',
        'projectsFragment': 'projectsFragment',
        'userCustomerTypeFragment': 'userCustomerTypeFragment',
        'domainProductFragment': 'domainProductFragment',
        'ventureISDataFieldsFragment': 'ventureISDataFieldsFragment'
      };
      
      if (fragmentMapping[cleanExpr] && this.fragmentCache.has(fragmentMapping[cleanExpr])) {
        logger.debug(`Found mapped fragment: ${cleanExpr} -> ${fragmentMapping[cleanExpr]}`);
        return this.fragmentCache.get(fragmentMapping[cleanExpr]) || '';
      }
      
      // Special handling for common patterns
      if (cleanExpr === '...' || cleanExpr.includes('...')) {
        logger.debug(`Removing spread operator: ${cleanExpr}`);
        return '';
      }
      
      // Don't return empty strings for unresolved expressions that look like names
      if (cleanExpr.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        logger.debug(`Using literal fallback for unresolved variable: ${cleanExpr}`);
        return cleanExpr;
      }
      
      logger.debug(`Could not resolve: ${cleanExpr}`);
      return cleanExpr; // Return the original expression as fallback
    });

    // Clean up extra whitespace and empty lines
    resolved = resolved
      .replace(/\n\s*\n\s*\n/g, '\n\n')  // Multiple empty lines
      .replace(/^\s*\n/gm, '')           // Leading empty lines
      .replace(/\s+/g, ' ')              // Multiple spaces
      .trim();

    // Fix common malformed patterns
    resolved = this.fixMalformedPatterns(resolved);

    return resolved;
  }
  
  /**
   * Fix common malformed patterns in GraphQL queries
   */
  private fixMalformedPatterns(content: string): string {
    let fixed = content;
    
    // Fix empty fragment spreads: { ... } -> { id }
    fixed = fixed.replace(/\{\s*\.\.\.\s*\}/g, '{ id }');
    
    // Fix empty field selections: { } -> { id }
    fixed = fixed.replace(/\{\s*\}/g, '{ id }');
    
    // Fix empty query names: query () -> query QueryName
    fixed = fixed.replace(/query\s*\(\)/g, 'query QueryName()');
    
    // Fix orphaned operations calls: () { ... }
    fixed = fixed.replace(/\(\)\s*\{[^}]*\}/g, '');
    
    // Fix malformed query names with empty parentheses at start
    fixed = fixed.replace(/query\s+\(\s*\)/g, 'query QueryName');
    
    // Remove empty selections that might remain
    fixed = fixed.replace(/\s*\(\)\s*\{[^}]*\}\s*/g, ' ');
    
    // Fix queries that are missing opening braces: "query Name } }" -> "query Name { id }"
    fixed = fixed.replace(/query\s+(\w+)\s+\}\s*\}/g, 'query $1 { id }');
    
    // Fix malformed queries with just closing braces
    fixed = fixed.replace(/query\s+(\w+)\s*\}\s*$/g, 'query $1 { id }');
    
    // Clean up multiple spaces
    fixed = fixed.replace(/\s+/g, ' ').trim();
    
    return fixed;
  }
  
  private findTemplateInAST(ast: any, query: ExtractedQuery): any {
    let templateInfo: any = null;
    
    traverseDefault(ast, {
      TaggedTemplateExpression: (path: any) => {
        if (!this.isGraphQLTag(path.node.tag)) {
          return;
        }
        
        const loc = path.node.loc;
        if (!loc) return;
        
        // Check if this is the right template based on location
        if (query.location && 
            loc.start.line <= query.location.line && 
            loc.end.line >= query.location.line) {
          
          templateInfo = this.extractTemplateInfo(path.node.quasi);
        }
      }
    });
    
    return templateInfo;
  }
  
  private extractTemplateInfo(quasi: any): any {
    const interpolations: TemplateInterpolation[] = [];
    let offset = 0;
    
    quasi.quasis.forEach((element: any, index: number) => {
      offset += element.value.raw.length;
      
      if (index < quasi.expressions.length) {
        const expr = quasi.expressions[index];
        const exprString = this.expressionToString(expr);
        
        interpolations.push({
          start: offset,
          end: offset + 5, // Length of ${...}
          expression: exprString,
          resolvedValue: this.resolveExpression(expr)
        });
        
        offset += 5; // ${...}
      }
    });
    
    return { interpolations };
  }
  
  private expressionToString(expr: any): string {
    switch (expr.type) {
      case 'Identifier':
        return expr.name;
      case 'MemberExpression':
        return `${this.expressionToString(expr.object)}.${expr.property.name}`;
      case 'ConditionalExpression':
        return `${this.expressionToString(expr.test)} ? ... : ...`;
      default:
        return expr.type;
    }
  }
  
  private resolveExpression(expr: any): string | undefined {
    // Handle queryNames.something
    if (expr.type === 'MemberExpression' && 
        expr.object.name === 'queryNames' && 
        this.context.queryNames[expr.property.name]) {
      return this.context.queryNames[expr.property.name];
    }
    
    // Handle simple identifiers that might be fragments
    if (expr.type === 'Identifier') {
      // Check if it's a known fragment placeholder
      const fragmentNames = ['ventureFragment', 'ventureFragmentWithoutProfile', 'userFragmentProjectCounts'];
      if (fragmentNames.includes(expr.name)) {
        // Return empty string to remove the placeholder
        // Fragments will be resolved later by FragmentResolver
        return '';
      }
    }
    
    // Handle conditional expressions for fragments
    if (expr.type === 'ConditionalExpression') {
      // For now, just return empty - this needs more sophisticated handling
      return '';
    }
    
    return undefined;
  }
  
  private resolveInterpolations(
    content: string, 
    interpolations: TemplateInterpolation[],
    fileContent: string
  ): string {
    let resolved = content;
    
    // Sort interpolations by position (reverse order for replacement)
    const sorted = [...interpolations].sort((a, b) => b.start - a.start);
    
    for (const interp of sorted) {
      if (interp.resolvedValue !== undefined) {
        // Find the ${...} in the content and replace it
        const before = resolved.substring(0, interp.start);
        const after = resolved.substring(interp.end);
        resolved = before + interp.resolvedValue + after;
      }
    }
    
    return resolved;
  }
  
  private isGraphQLTag(tag: any): boolean {
    if (tag.type === 'Identifier') {
      return tag.name === 'gql' || tag.name === 'graphql';
    }
    
    if (tag.type === 'MemberExpression') {
      return tag.property.name === 'gql' || tag.property.name === 'graphql';
    }
    
    return false;
  }

  private isGqlTag(tag: any): boolean {
    return this.isGraphQLTag(tag);
  }

  private reconstructTemplate(quasi: any): string {
    let result = '';
    quasi.quasis.forEach((element: any, index: number) => {
      result += element.value.raw;
      // Don't add expressions back - we want just the string parts
      if (index < quasi.expressions.length) {
        // Skip the expression part for now
      }
    });
    return result;
  }
}