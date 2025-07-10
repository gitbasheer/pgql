import { DocumentNode, FragmentDefinitionNode, parse, print, visit, Kind } from 'graphql';
import * as fs from 'fs/promises';
import * as path from 'path';
// import * as vm from 'vm'; // REMOVED: Security fix - no longer using vm.runInContext
import { logger } from '../../utils/logger';
import { safeParseGraphQL, logParsingError } from '../../utils/graphqlValidator';
import * as babel from '@babel/parser';
import traverse from '@babel/traverse';
import glob from 'fast-glob';

export interface ResolvedQuery {
  id: string;
  filePath: string;
  content: string;
  originalContent: string;
  fragments: FragmentDefinitionNode[];
  imports: string[];
  name?: string;
  type: 'query' | 'mutation' | 'subscription' | 'fragment';
}

export class FragmentResolver {
  private fragmentCache: Map<string, FragmentDefinitionNode[]> = new Map();
  private moduleCache: Map<string, any> = new Map();

  async resolveQueriesWithFragments(
    queries: Array<{ id: string; filePath: string; content: string; name?: string }>,
    baseDir?: string
  ): Promise<ResolvedQuery[]> {
    const resolved: ResolvedQuery[] = [];
    
    for (const query of queries) {
      try {
        const result = await this.resolveQuery(query, baseDir);
        resolved.push(result);
      } catch (error) {
        logger.warn(`Failed to resolve fragments for ${query.id}:`, error);
        // Still include the query even if fragment resolution fails
        resolved.push({
          ...query,
          originalContent: query.content,
          fragments: [],
          imports: [],
          type: this.detectQueryType(query.content)
        });
      }
    }
    
    return resolved;
  }

  private async resolveQuery(
    query: { id: string; filePath: string; content: string; name?: string },
    baseDir?: string
  ): Promise<ResolvedQuery> {
    const queryDir = path.dirname(query.filePath);
    const imports = await this.extractImports(query.filePath);
    const allFragments: FragmentDefinitionNode[] = [];
    
    // First, load fragments from the same file as the query
    const sameFileFragments = await this.loadFragmentsFromFile(query.filePath);
    allFragments.push(...sameFileFragments);
    
    // Load fragments from imports
    for (const importPath of imports) {
      // SECURITY FIX: Validate path to prevent directory traversal
      const resolvedPath = this.validateAndResolvePath(queryDir, importPath);
      if (!resolvedPath) {
        logger.warn(`Skipping potentially malicious import path: ${importPath}`);
        continue;
      }
      const fragmentsFromFile = await this.loadFragmentsFromFile(resolvedPath);
      allFragments.push(...fragmentsFromFile);
    }
    
    // Check if query references fragments
    const referencedFragments = this.extractFragmentReferences(query.content);
    
    // If we have referenced fragments, try to find them
    if (referencedFragments.length > 0 && allFragments.length === 0) {
      // Look for fragments.js or similar files in the same directory
      const fragmentFiles = await glob(['**/fragments*.js', '**/fragment*.js'], {
        cwd: queryDir,
        absolute: true,
        ignore: ['**/node_modules/**']
      });
      
      for (const fragmentFile of fragmentFiles) {
        const fragmentsFromFile = await this.loadFragmentsFromFile(fragmentFile);
        allFragments.push(...fragmentsFromFile);
      }
    }
    
    // Deduplicate fragments by name (keep first occurrence)
    const deduplicatedFragments = this.deduplicateFragments(allFragments);
    
    // Get only the fragments that are actually used by this query
    const usedFragments = this.getUsedFragments(query.content, deduplicatedFragments);
    
    // Build the complete query with only used fragments
    let completeQuery = query.content;
    
    if (usedFragments.length > 0) {
      // Add fragment definitions to the query
      const fragmentDefinitions = usedFragments
        .map(f => print(f))
        .join('\n\n');
      
      completeQuery = `${query.content}\n\n${fragmentDefinitions}`;
    }
    
    return {
      id: query.id,
      filePath: query.filePath,
      content: completeQuery,
      originalContent: query.content,
      fragments: usedFragments,
      imports,
      name: query.name,
      type: this.detectQueryType(query.content)
    };
  }

  private async extractImports(filePath: string): Promise<string[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const imports: string[] = [];
      
      // Match require statements
      const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      let match;
      while ((match = requirePattern.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.includes('fragment')) {
          imports.push(importPath);
        }
      }
      
      // Match ES6 imports
      const importPattern = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
      while ((match = importPattern.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.includes('fragment')) {
          imports.push(importPath);
        }
      }
      
      return imports;
    } catch (error) {
      logger.debug(`Could not extract imports from ${filePath}:`, error);
      return [];
    }
  }

  private async loadFragmentsFromFile(filePath: string): Promise<FragmentDefinitionNode[]> {
    // Check cache first
    if (this.fragmentCache.has(filePath)) {
      return this.fragmentCache.get(filePath)!;
    }
    
    try {
      // Handle .js extensions
      if (!filePath.endsWith('.js')) {
        filePath = filePath + '.js';
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      const fragments = await this.extractFragmentsFromJavaScript(content, filePath);
      
      this.fragmentCache.set(filePath, fragments);
      return fragments;
    } catch (error) {
      logger.debug(`Could not load fragments from ${filePath}:`, error);
      return [];
    }
  }


  private extractFragmentReferences(query: string): string[] {
    const references: string[] = [];
    
    const validation = safeParseGraphQL(query);
    if (validation.isValid && validation.ast) {
      visit(validation.ast, {
        FragmentSpread: {
          enter(node) {
            references.push(node.name.value);
          }
        }
      });
    } else {
      // If parsing fails, try regex fallback
      const pattern = /\.\.\.(\w+)/g;
      let match;
      while ((match = pattern.exec(query)) !== null) {
        references.push(match[1]);
      }
    }
    
    return [...new Set(references)]; // Remove duplicates
  }

  private deduplicateFragments(fragments: FragmentDefinitionNode[]): FragmentDefinitionNode[] {
    const seen = new Set<string>();
    const deduplicated: FragmentDefinitionNode[] = [];
    
    for (const fragment of fragments) {
      const fragmentName = fragment.name.value;
      if (!seen.has(fragmentName)) {
        seen.add(fragmentName);
        deduplicated.push(fragment);
        logger.debug(`Added fragment ${fragmentName} to deduplicated list`);
      } else {
        logger.debug(`Skipped duplicate fragment ${fragmentName}`);
      }
    }
    
    return deduplicated;
  }

  private getUsedFragments(
    queryContent: string,
    allFragments: FragmentDefinitionNode[]
  ): FragmentDefinitionNode[] {
    // Get directly referenced fragments from the query
    const directReferences = this.extractFragmentReferences(queryContent);
    
    // Create a map of fragment name to fragment definition
    const fragmentMap = new Map<string, FragmentDefinitionNode>();
    for (const fragment of allFragments) {
      fragmentMap.set(fragment.name.value, fragment);
    }
    
    // Recursively collect all used fragments (including nested dependencies)
    const usedFragments = new Set<string>();
    const toProcess = [...directReferences];
    
    while (toProcess.length > 0) {
      const fragmentName = toProcess.pop()!;
      
      if (usedFragments.has(fragmentName)) {
        continue; // Already processed
      }
      
      const fragment = fragmentMap.get(fragmentName);
      if (!fragment) {
        logger.warn(`Fragment ${fragmentName} referenced but not found`);
        continue;
      }
      
      usedFragments.add(fragmentName);
      
      // Find fragment spreads within this fragment
      const nestedRefs: string[] = [];
      visit(fragment, {
        FragmentSpread: {
          enter(node) {
            nestedRefs.push(node.name.value);
          }
        }
      });
      
      // Add nested references to process queue
      for (const ref of nestedRefs) {
        if (!usedFragments.has(ref)) {
          toProcess.push(ref);
        }
      }
    }
    
    // Return only the fragments that are actually used
    return allFragments.filter(f => usedFragments.has(f.name.value));
  }

  private detectQueryType(content: string): 'query' | 'mutation' | 'subscription' | 'fragment' {
    try {
      // Skip parsing if content has unresolved interpolations
      if (content.includes('${')) {
        // Fallback to regex
        if (/^\s*mutation/m.test(content)) return 'mutation';
        if (/^\s*subscription/m.test(content)) return 'subscription';
        if (/^\s*fragment/m.test(content)) return 'fragment';
        return 'query';
      }
      
      const ast = parse(content);
      const firstDef = ast.definitions[0];
      
      if (firstDef.kind === Kind.OPERATION_DEFINITION) {
        return firstDef.operation;
      } else if (firstDef.kind === Kind.FRAGMENT_DEFINITION) {
        return 'fragment';
      }
    } catch {
      // Fallback to regex
      if (/^\s*mutation/m.test(content)) return 'mutation';
      if (/^\s*subscription/m.test(content)) return 'subscription';
      if (/^\s*fragment/m.test(content)) return 'fragment';
    }
    
    return 'query';
  }

  private async extractFragmentsFromJavaScript(content: string, filePath: string): Promise<FragmentDefinitionNode[]> {
    // First get all exported variables from the current file
    const exportedVariables = this.extractExportedVariables(content);
    
    // Handle imports to get variables from other files
    const importedVariables = await this.resolveImportedVariables(content, filePath);
    
    // Merge imported variables into the exported variables map
    for (const [key, value] of importedVariables) {
      if (!exportedVariables.has(key)) {
        exportedVariables.set(key, value);
      }
    }
    
    // Now extract fragments with resolved variables
    const fragments: FragmentDefinitionNode[] = [];
    
    // Pattern 1: gql template literals
    const gqlPattern = /gql`([^`]+)`/gs;
    const gqlMatches = content.matchAll(gqlPattern);
    
    for (const match of gqlMatches) {
      const graphqlString = match[1];
      const validation = safeParseGraphQL(graphqlString);
      
      if (validation.isValid && validation.ast) {
        // Extract fragment definitions
        visit(validation.ast, {
          FragmentDefinition: {
            enter(node) {
              fragments.push(node);
            }
          }
        });
      } else {
        logParsingError(graphqlString, validation.error!, `gql template in ${filePath}`);
      }
    }
    
    // Pattern 2: export const fragmentName = `...`
    const exportPattern = /export\s+(?:const|let|var)\s+(\w*[Ff]ragment\w*)\s*=\s*`([^`]+)`/gs;
    const exportMatches = content.matchAll(exportPattern);
    
    for (const match of exportMatches) {
      const fragmentName = match[1];
      let fragmentContent = match[2];
      
      // Resolve template literal interpolations
      fragmentContent = this.resolveTemplateInterpolations(fragmentContent, exportedVariables);
      
      // Check if it's a GraphQL fragment
      if (fragmentContent.includes('fragment ')) {
        const validation = safeParseGraphQL(fragmentContent);
        
        if (validation.isValid && validation.ast) {
          visit(validation.ast, {
            FragmentDefinition: {
              enter(node) {
                fragments.push(node);
                logger.debug(`Found fragment ${node.name.value} exported as ${fragmentName}`);
              }
            }
          });
        } else {
          logParsingError(fragmentContent, validation.error!, `exported fragment ${fragmentName} in ${filePath}`);
        }
      }
    }
    
    // Also try to evaluate the module to get exported fragments
    try {
      const sandbox = {
        module: { exports: {} },
        exports: {},
        require: (id: string) => {
          // Mock require for common dependencies
          if (id === '@apollo/client/core' || id === '@apollo/client') {
            return {
              gql: (strings: TemplateStringsArray) => {
                const query = strings[0];
                try {
                  return parse(query);
                } catch {
                  return query;
                }
              }
            };
          }
          return {};
        },
        gql: (strings: TemplateStringsArray, ...values: any[]) => {
          // Handle template literals with interpolations
          let query = strings[0];
          for (let i = 0; i < values.length; i++) {
            query += (values[i] || '') + (strings[i + 1] || '');
          }
          
          // Don't parse if it has unresolved interpolations
          if (query.includes('${')) {
            return query;
          }
          
          try {
            return parse(query);
          } catch {
            return query;
          }
        }
      };
      
      // SECURITY FIX: Remove vm.runInContext to prevent RCE vulnerability
      // Use static AST analysis instead of code execution
      const exports: any = {};
      
      try {
        // Parse the module code without executing it
        const ast = babel.parse(content, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx', 'decorators-legacy']
        });
        
        // Extract exports via AST traversal
        traverse(ast, {
          // Handle: export const fragmentName = `...` or gql`...`
          ExportNamedDeclaration(path) {
            const declaration = path.node.declaration;
            if (declaration && declaration.type === 'VariableDeclaration') {
              for (const declarator of declaration.declarations) {
                if (declarator.id.type === 'Identifier' && declarator.init) {
                  const name = declarator.id.name;
                  const value = extractStringValue(declarator.init);
                  if (value && name.toLowerCase().includes('fragment')) {
                    exports[name] = value;
                  }
                }
              }
            }
          },
          
          // Handle: module.exports = { fragmentName: `...` }
          AssignmentExpression(path) {
            if (isModuleExportsAssignment(path.node) && 
                path.node.right.type === 'ObjectExpression') {
              for (const prop of path.node.right.properties) {
                if (prop.type === 'ObjectProperty' && 
                    prop.key.type === 'Identifier') {
                  const name = prop.key.name;
                  const value = extractStringValue(prop.value);
                  if (value && name.toLowerCase().includes('fragment')) {
                    exports[name] = value;
                  }
                }
              }
            }
          }
        });
      } catch (parseError: any) {
        logger.warn(`Failed to parse module for fragment extraction: ${parseError?.message || parseError}`);
        return fragments;
      }
      
      // Helper to check if assignment is to module.exports
      function isModuleExportsAssignment(node: any): boolean {
        return node.left.type === 'MemberExpression' &&
               node.left.object.type === 'Identifier' &&
               node.left.object.name === 'module' &&
               node.left.property.type === 'Identifier' &&
               node.left.property.name === 'exports';
      }
      
      // Helper to extract string value from AST node
      function extractStringValue(node: any): string | null {
        if (!node) return null;
        
        // Handle string literal
        if (node.type === 'StringLiteral') {
          return node.value;
        }
        
        // Handle template literal
        if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
          return node.quasis.map((q: any) => q.value.raw).join('');
        }
        
        // Handle gql tagged template
        if (node.type === 'TaggedTemplateExpression' &&
            node.tag.type === 'Identifier' &&
            node.tag.name === 'gql' &&
            node.quasi.expressions.length === 0) {
          return node.quasi.quasis.map((q: any) => q.value.raw).join('');
        }
        
        // Handle CallExpression like gql(`...`)
        if (node.type === 'CallExpression' &&
            node.callee.type === 'Identifier' &&
            node.callee.name === 'gql' &&
            node.arguments.length === 1 &&
            node.arguments[0].type === 'StringLiteral') {
          return node.arguments[0].value;
        }
        
        return null;
      }
      
      for (const key of Object.keys(exports)) {
        if (key.toLowerCase().includes('fragment')) {
          const value = exports[key];
          if (typeof value === 'string') {
            // Resolve interpolations in the exported value
            const resolvedValue = this.resolveTemplateInterpolations(value, exportedVariables);
            try {
              // Final check for unresolved interpolations
              if (resolvedValue.includes('${')) {
                logger.debug(`Exported fragment ${key} has unresolved interpolations`);
                continue;
              }
              
              const ast = parse(resolvedValue);
              visit(ast, {
                FragmentDefinition: {
                  enter(node) {
                    fragments.push(node);
                  }
                }
              });
            } catch {
              // Not a valid GraphQL string
            }
          } else if (value && typeof value === 'object' && value.definitions) {
            // Already parsed AST
            for (const def of value.definitions) {
              if (def.kind === Kind.FRAGMENT_DEFINITION) {
                fragments.push(def);
              }
            }
          }
        }
      }
    } catch (error) {
      logger.debug('Could not evaluate module for fragments:', error);
    }
    
    return fragments;
  }

  private extractExportedVariables(content: string): Map<string, string> {
    const variables = new Map<string, string>();
    
    // Pattern to match exported variables with template literals
    const exportPattern = /export\s+(?:const|let|var)\s+(\w+)\s*=\s*`([^`]+)`/gs;
    const matches = content.matchAll(exportPattern);
    
    for (const match of matches) {
      const varName = match[1];
      const varContent = match[2];
      variables.set(varName, varContent);
    }
    
    // Also match non-exported variables that might be used in interpolations
    const varPattern = /(?:const|let|var)\s+(\w+)\s*=\s*`([^`]+)`/gs;
    const varMatches = content.matchAll(varPattern);
    
    for (const match of varMatches) {
      const varName = match[1];
      const varContent = match[2];
      if (!variables.has(varName)) {
        variables.set(varName, varContent);
      }
    }
    
    // Resolve all interpolations within the variables themselves
    // This ensures that variables that depend on other variables are properly resolved
    const resolvedVariables = new Map<string, string>();
    for (const [name, value] of variables) {
      const resolved = this.resolveTemplateInterpolations(value, variables);
      resolvedVariables.set(name, resolved);
    }
    
    return resolvedVariables;
  }

  private async resolveImportedVariables(content: string, filePath: string): Promise<Map<string, string>> {
    const importedVariables = new Map<string, string>();
    const fileDir = path.dirname(filePath);
    
    // Pattern to match ES6 imports with named imports
    const importPattern = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
    const matches = content.matchAll(importPattern);
    
    for (const match of matches) {
      const importedNames = match[1].split(',').map(name => name.trim());
      const importPath = match[2];
      
      try {
        // Resolve the import path
        let resolvedPath = path.resolve(fileDir, importPath);
        if (!resolvedPath.endsWith('.js')) {
          resolvedPath += '.js';
        }
        
        // Read the imported file
        const importedContent = await fs.readFile(resolvedPath, 'utf-8');
        const importedVars = this.extractExportedVariables(importedContent);
        
        // Add only the imported names to our map
        for (const name of importedNames) {
          if (importedVars.has(name)) {
            importedVariables.set(name, importedVars.get(name)!);
            logger.debug(`Imported variable ${name} from ${importPath}`);
          }
        }
      } catch (error) {
        logger.debug(`Could not resolve import from ${importPath}:`, error);
      }
    }
    
    return importedVariables;
  }

  private resolveTemplateInterpolations(content: string, variables: Map<string, string>): string {
    let resolved = content;
    let iterations = 0;
    const maxIterations = 10; // Prevent infinite loops
    
    // Keep resolving until no more interpolations are found
    while (resolved.includes('${') && iterations < maxIterations) {
      iterations++;
      
      // Find all template interpolations
      const interpolationPattern = /\$\{(\w+)\}/g;
      const matches = [...resolved.matchAll(interpolationPattern)];
      
      for (const match of matches) {
        const varName = match[1];
        const replacement = variables.get(varName);
        
        if (replacement) {
          // Replace the interpolation with the variable content
          resolved = resolved.replace(match[0], replacement);
          logger.debug(`Resolved template interpolation: ${varName}`);
        } else {
          logger.warn(`Could not resolve template interpolation: ${varName}`);
        }
      }
      
      // If no replacements were made in this iteration, break to avoid infinite loop
      const newMatches = [...resolved.matchAll(interpolationPattern)];
      if (newMatches.length === matches.length && 
          newMatches.every((m, i) => m[1] === matches[i][1])) {
        break;
      }
    }
    
    if (iterations >= maxIterations) {
      logger.warn('Maximum iterations reached while resolving template interpolations');
    }
    
    return resolved;
  }

  /**
   * Validate and resolve a path to prevent directory traversal attacks
   * @param baseDir Base directory to resolve from
   * @param userPath User-provided path
   * @returns Resolved path if safe, null if potentially malicious
   */
  private validateAndResolvePath(baseDir: string, userPath: string): string | null {
    // SECURITY: Prevent directory traversal attacks
    
    // Reject obvious traversal attempts
    if (userPath.includes('..') || userPath.includes('~')) {
      return null;
    }
    
    // Normalize and resolve the path
    const resolved = path.resolve(baseDir, userPath);
    const normalized = path.normalize(resolved);
    
    // Ensure the resolved path is within the base directory or a safe location
    const normalizedBase = path.normalize(baseDir);
    const projectRoot = path.normalize(process.cwd());
    
    // Allow paths within the base directory or project root
    if (!normalized.startsWith(normalizedBase) && !normalized.startsWith(projectRoot)) {
      return null;
    }
    
    // Additional check: ensure no sneaky traversals after normalization
    const relative = path.relative(projectRoot, normalized);
    if (relative.startsWith('..')) {
      return null;
    }
    
    return normalized;
  }

  async findAndLoadFragmentFiles(directory: string): Promise<Map<string, FragmentDefinitionNode[]>> {
    const fragmentFiles = await glob(['**/fragments*.js', '**/fragment*.js', '**/*Fragment*.js'], {
      cwd: directory,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });
    
    const fragmentMap = new Map<string, FragmentDefinitionNode[]>();
    
    for (const file of fragmentFiles) {
      const fragments = await this.loadFragmentsFromFile(file);
      if (fragments.length > 0) {
        fragmentMap.set(file, fragments);
        logger.info(`Found ${fragments.length} fragments in ${file}`);
      }
    }
    
    return fragmentMap;
  }
}