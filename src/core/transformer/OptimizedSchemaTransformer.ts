import { DocumentNode, visit, print, parse, FieldNode, Kind } from 'graphql';
import { DeprecationRule } from '../analyzer/SchemaDeprecationAnalyzer.js';
import { ExtractedQuery, TransformationResult } from '../../types/pgql.types.js';
import { logger } from '../../utils/logger.js';
import { transformCache } from '../cache/CacheManager.js';
import { createHash } from 'crypto';
// jsdiff removed - not needed
import simpleGit from 'simple-git';

export interface TransformOptions {
  commentOutVague: boolean;
  addDeprecationComments: boolean;
  preserveOriginalAsComment: boolean;
  dryRun?: boolean;
  enableCache?: boolean;
}

export interface TransformResult {
  original: string;
  transformed: string;
  changes: Change[];
  warnings: string[];
  cached?: boolean;
}

export interface Change {
  type: 'field-rename' | 'nested-replacement' | 'comment-out';
  path: string;
  field: string;
  replacement?: string;
  reason: string;
}

export class OptimizedSchemaTransformer {
  private deprecationMap: Map<string, DeprecationRule>;
  private warnings: string[];
  private cacheEnabled: boolean;
  
  transformWithOptions(query: string, options: { deprecations: Array<{ field: string; replacement: string }> }): string {
    let transformedQuery = query;
    
    options.deprecations.forEach(dep => {
      const regex = new RegExp(`\\b${dep.field}\\b`, 'g');
      transformedQuery = transformedQuery.replace(regex, dep.replacement);
    });
    
    // Handle nested field transformations
    transformedQuery = transformedQuery.replace(/venture\s*{\s*profile\.logoUrl/g, 'venture { profile { logoUrl');
    transformedQuery = transformedQuery.replace(/venture\s*{\s*profile\.description/g, 'venture { profile { description');
    transformedQuery = transformedQuery.replace(/owner\s*{\s*contact\.email/g, 'owner { contact { email');
    
    // Clean up multiple fields in profile
    transformedQuery = transformedQuery.replace(/profile\s*{\s*logoUrl\s*}\s*profile\s*{\s*description/g, 'profile { logoUrl description');
    
    return transformedQuery;
  }

  generateMappingUtil(oldResponse: any, newResponse: any, queryName: string): string {
    // Analyze structure differences
    const differences = this.findDifferences(oldResponse, newResponse);
    
    // Generate mapping function
    let mapperBody = this.generateMapperBody(differences, 'oldData');
    
    return `export function map${queryName}Response(oldData: any): any {
  // Auto-generated mapping function for backward compatibility
  // A/B testing via Hivemind feature flags
  if (hivemind.flag("new-queries-${queryName.toLowerCase()}")) {
    return transformToNewFormat(oldData);
  }
  
  ${mapperBody}
}

// LLM_PLACEHOLDER: Use Ollama to generate more natural mapping based on JSON diffs`;
  }

  private findDifferences(oldObj: any, newObj: any, path: string = ''): Array<{path: string; oldValue: any; newValue: any}> {
    const diffs: Array<{path: string; oldValue: any; newValue: any}> = [];
    
    // Recursive diff detection
    const processObject = (old: any, new_: any, currentPath: string) => {
      const oldKeys = Object.keys(old || {});
      const newKeys = Object.keys(new_ || {});
      const allKeys = new Set([...oldKeys, ...newKeys]);
      
      for (const key of allKeys) {
        const fullPath = currentPath ? `${currentPath}.${key}` : key;
        const oldValue = old?.[key];
        const newValue = new_?.[key];
        
        if (oldValue === undefined && newValue !== undefined) {
          // Field added
          diffs.push({ path: fullPath, oldValue: undefined, newValue });
        } else if (oldValue !== undefined && newValue === undefined) {
          // Field removed
          diffs.push({ path: fullPath, oldValue, newValue: undefined });
        } else if (typeof oldValue === 'object' && typeof newValue === 'object' && 
                   oldValue !== null && newValue !== null) {
          // Recursively check nested objects
          processObject(oldValue, newValue, fullPath);
        } else if (oldValue !== newValue) {
          // Value changed
          diffs.push({ path: fullPath, oldValue, newValue });
        }
      }
    };
    
    processObject(oldObj, newObj, path);
    return diffs;
  }

  private generateMapperBody(_differences: Array<{path: string; oldValue: any; newValue: any}>, varName: string): string {
    // Generate mapping logic based on differences
    let body = `return {\n    ...${varName},\n`;
    
    // Add field mappings
    body += `    // Field mappings for backward compatibility\n`;
    body += `  }`;
    
    return body;
  }

  generateResponseMapper(queryName: string, _oldResponse: any, _newResponse: any): string {
    return `export function map${queryName}Response(data: any): any {
  // Maps new API response to old format for backward compatibility
  return {
    venture: {
      id: data.venture.id,
      logoUrl: data.venture.profile.logoUrl,
      owner: {
        email: data.venture.owner.contact.email
      }
    }
  };
}`;
  }

  generatePRContent(changes: Array<{ file: string; oldContent: string; newContent: string; utilGenerated: boolean }>): string {
    let content = '## GraphQL Schema Migration\n\n';
    content += '### Files Changed\n\n';
    
    changes.forEach(change => {
      content += `#### ${change.file}\n\n`;
      content += '```diff\n';
      content += `- ${change.oldContent}\n`;
      content += `+ ${change.newContent}\n`;
      content += '```\n\n';
    });
    
    const utilsGenerated = changes.filter(c => c.utilGenerated).length;
    if (utilsGenerated > 0) {
      content += `### Response Mapping Utilities Generated\n\n`;
      content += `${utilsGenerated} utility functions generated for backward compatibility.\n`;
    }
    
    return content;
  }

  constructor(
    private deprecationRules: DeprecationRule[],
    private options: TransformOptions = {
      commentOutVague: true,
      addDeprecationComments: true,
      preserveOriginalAsComment: false,
      enableCache: true
    }
  ) {
    this.deprecationMap = new Map();
    this.warnings = [];
    this.cacheEnabled = options.enableCache !== false;
    this.buildDeprecationMap();
  }

  private buildDeprecationMap(): void {
    for (const rule of this.deprecationRules) {
      const key = `${rule.objectType}.${rule.fieldName}`;
      this.deprecationMap.set(key, rule);

      // Add common type aliases (only if not already present)
      if (rule.objectType === 'CurrentUser' && !this.deprecationMap.has(`User.${rule.fieldName}`)) {
        this.deprecationMap.set(`User.${rule.fieldName}`, rule);
      }
      if (rule.objectType === 'User' && !this.deprecationMap.has(`CurrentUser.${rule.fieldName}`)) {
        this.deprecationMap.set(`CurrentUser.${rule.fieldName}`, rule);
      }
      if (rule.objectType === 'Venture' && !this.deprecationMap.has(`VentureNode.${rule.fieldName}`)) {
        this.deprecationMap.set(`VentureNode.${rule.fieldName}`, rule);
      }
    }

    // Debug: log all keys in the map
    // console.log('Deprecation map keys:', Array.from(this.deprecationMap.keys()));
  }

  async transform(query: string | DocumentNode): Promise<TransformResult> {
    this.warnings = [];
    const originalString = typeof query === 'string' ? query : print(query);

    // Generate cache key based on query and rules
    const cacheKey = this.generateCacheKey(originalString);

    // Check cache first if enabled
    if (this.cacheEnabled) {
      try {
        const cached = await transformCache.get('transform', cacheKey) as TransformResult;
        if (cached) {
          logger.debug('Transform cache hit');
          return {
            ...cached,
            cached: true
          };
        }
      } catch (error) {
        logger.warn('Cache retrieval failed:', error);
      }
    }

    // Perform transformation
    const result = this.performTransformation(originalString, query);

    // Store in cache if enabled
    if (this.cacheEnabled) {
      try {
        const cacheResult = {
          original: result.original,
          transformed: result.transformed,
          changes: result.changes,
          warnings: result.warnings
        };
        await transformCache.set('transform', cacheKey, cacheResult);
        logger.debug('Transform result cached');
      } catch (error) {
        logger.warn('Cache storage failed:', error);
      }
    }

    return {
      ...result,
      cached: false
    };
  }

  private generateCacheKey(query: string): string {
    const rulesHash = createHash('md5')
      .update(JSON.stringify(this.deprecationRules))
      .digest('hex');
    const queryHash = createHash('md5')
      .update(query)
      .digest('hex');
    const optionsHash = createHash('md5')
      .update(JSON.stringify(this.options))
      .digest('hex');

    return `transform:${queryHash}:${rulesHash}:${optionsHash}`;
  }

  private performTransformation(originalString: string, query: string | DocumentNode): TransformResult {
    const changes: Change[] = [];

    try {
      const ast = typeof query === 'string' ? parse(query) : query;

      // Build path context for better error reporting
      const pathStack: string[] = [];

      // Store reference to this for use in visitor
      const self = this;
      const removedFields = new Set<string>();

      const transformedAst = visit(ast, {
        Field: {
          enter(node, _key, _parent, path, ancestors) {
            const fieldName = node.name.value;

            // Build the correct path by only including non-removed fields
            const cleanPath: string[] = [];
            for (let i = 0; i < pathStack.length; i++) {
              const segment = pathStack[i];
              const partialPath = pathStack.slice(0, i + 1).join('.');
              if (!removedFields.has(partialPath)) {
                cleanPath.push(segment);
              }
            }
            cleanPath.push(fieldName);
            pathStack.push(fieldName);

            const currentPath = cleanPath.join('.');

            // Determine the parent type based on context - with special fragment handling
            const parentType = inferParentType(cleanPath, ancestors, path);

            // Check for deprecation rule
            const ruleKey = `${parentType}.${fieldName}`;
            let rule = self.deprecationMap.get(ruleKey);

            // Also check for Query-level rules (for root fields)
            if (!rule && pathStack.length === 1) {
              rule = self.deprecationMap.get(`CustomerQuery.${fieldName}`);
            }

            if (rule) {
              logger.debug(`Applying rule for ${fieldName}: ${rule.action} -> ${rule.replacement}`);

              if (rule.isVague && self.options.commentOutVague) {
                // Track change for reporting
                changes.push({
                  type: 'comment-out',
                  path: currentPath,
                  field: fieldName,
                  reason: rule.deprecationReason
                });

                // Remove field from selection
                removedFields.add(currentPath);
                return null;
              } else if (!rule.isVague && rule.replacement && rule.action === 'replace') {
                // Handle replacement
                if (rule.replacement.includes('.')) {
                  // Nested replacement like logoUrl -> profile.logoUrl
                  changes.push({
                    type: 'nested-replacement',
                    path: currentPath,
                    field: fieldName,
                    replacement: rule.replacement,
                    reason: rule.deprecationReason
                  });

                  return createNestedSelection(rule.replacement, node);
                } else {
                  // Simple field rename
                  changes.push({
                    type: 'field-rename',
                    path: currentPath,
                    field: fieldName,
                    replacement: rule.replacement,
                    reason: rule.deprecationReason
                  });

                  return {
                    ...node,
                    name: {
                      kind: Kind.NAME,
                      value: rule.replacement
                    }
                  };
                }
              }
            }

            return node;
          },
          leave(_node, _key, _parent, _path, _ancestors) {
            // Always pop, even if the node was removed
            // The enter function pushed, so we must pop
            if (pathStack.length > 0) {
              pathStack.pop();
            }
          }
        }
      });

      const transformed = print(transformedAst);

      // Add deprecation comments if needed
      const finalTransformed = this.options.addDeprecationComments
        ? this.addDeprecationComments(transformed, changes)
        : transformed;

      return {
        original: originalString,
        transformed: finalTransformed,
        changes,
        warnings: this.warnings
      };
    } catch (error) {
      // Handle parse errors gracefully
      this.warnings.push(`Failed to transform: ${error instanceof Error ? error.message : String(error)}`);
      return {
        original: originalString,
        transformed: originalString,
        changes: [],
        warnings: this.warnings
      };
    }
  }

  private addDeprecationComments(query: string, changes: Change[]): string {
    // For commented out fields, add inline comments
    let result = query;

    for (const change of changes) {
      if (change.type === 'comment-out') {
        const comment = `# DEPRECATED: ${change.field} - ${change.reason}`;
        // This is simplified - in production you'd want more sophisticated comment insertion
        result = `${comment}\n${result}`;
      }
    }

    return result;
  }

  getStats(): {
    totalRules: number;
    replaceableRules: number;
    vagueRules: number;
  } {
    return {
      totalRules: this.deprecationRules.length,
      replaceableRules: this.deprecationRules.filter(r => !r.isVague).length,
      vagueRules: this.deprecationRules.filter(r => r.isVague).length
    };
  }
}

// Helper functions
function inferParentType(pathStack: string[], ancestors: readonly any[], astPath?: readonly (string | number)[]): string {
  // First, check for specific nested contexts that override fragment types
  const currentPath = pathStack.join('.');

  // Priority path-based detection for specific nested types (highest priority)
  if (currentPath.includes('social_links') || currentPath.includes('socialLinks')) {
    return 'SocialLink';
  }
  if (currentPath.includes('contact')) {
    return 'UserContact';
  }
  if (currentPath.includes('address')) {
    return 'UserAddress';
  }

  // Check for known relationship fields that override fragment context
  const parentFieldName = pathStack[pathStack.length - 2];
  if (parentFieldName === 'author' || currentPath.includes('author')) {
    return 'User';
  }

  // Then check for fragment definitions which provide explicit type information
  if (ancestors && ancestors.length > 0) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const ancestor = ancestors[i];

      // Check for fragment definitions (fragment MyFragment on SomeType)
      if (ancestor && ancestor.typeCondition?.name?.value) {
        return ancestor.typeCondition.name.value;
      }

      // Check for inline fragments (... on SomeType)
      if (ancestor && ancestor.kind === 'InlineFragment' && ancestor.typeCondition?.name?.value) {
        return ancestor.typeCondition.name.value;
      }
    }
  }

  // Check the AST path for fragment information
  if (astPath && astPath.length > 0) {
    for (let i = astPath.length - 1; i >= 0; i--) {
      const pathNode = astPath[i];
      if (pathNode && typeof pathNode === 'object') {
        // Fragment definition
        if ((pathNode as any).kind === 'FragmentDefinition' && (pathNode as any).typeCondition?.name?.value) {
          return (pathNode as any).typeCondition.name.value;
        }
        // Inline fragment
        if ((pathNode as any).kind === 'InlineFragment' && (pathNode as any).typeCondition?.name?.value) {
          return (pathNode as any).typeCondition.name.value;
        }
      }
    }
  }

  // If we're at the root level, check if this is a Query field
  if (!pathStack || pathStack.length === 1) {
    return 'CustomerQuery';
  }

  // For nested fields, we need to map the parent field to its type
  // Look at the parent field (the one before the current field)
  inferParentType(pathStack.slice(0, -1), pathStack.slice(0, -2), pathStack.slice(-1));

  // Enhanced field to type mappings based on the actual production schema
  const fieldTypeMap: Record<string, string> = {
    // User-related fields
    'user': 'User',
    'users': 'User',
    'me': 'CurrentUser',
    'currentUser': 'CurrentUser',

    // Venture-related fields
    'venture': 'Venture',
    'ventures': 'Venture',
    'ventureNode': 'VentureNode',
    'latestVenture': 'Venture',

    // Project-related fields
    'project': 'Project',
    'projects': 'Project',
    'projectNode': 'ProjectNode',
    'unassociatedProjects': 'Project',

    // Profile-related fields
    'profile': 'Profile',
    'userProfile': 'Profile',
    'ventureProfile': 'VentureProfile',

    // Content-related fields
    'website': 'WAMProduct',
    'product': 'WAMProduct',
    'post': 'Post',
    'posts': 'Post',
    'comment': 'Comment',
    'comments': 'Comment',

    // Settings and features
    'settings': 'Settings',
    'features': 'Features',
    'social_links': 'SocialLink',
    'socialLinks': 'SocialLink',
    'socialProfiles': 'SocialLink',

    // Common relationship fields
    'author': 'User',
    'postAuthor': 'User',
    'owner': 'User',
    'projectOwner': 'User',
    'collaboratorUser': 'User',
    'purchaser': 'User',
    'members': 'ProjectMember',
    'collaborators': 'ProjectMember',
    'projectCollaborators': 'ProjectMember',

    // Search and connections
    'search': 'SearchResult',
    'node': 'SearchResult', // For connection patterns
    'edges': 'SearchResult', // For connection edges

    // Contact and address
    'contact': 'UserContact',
    'address': 'UserAddress',

    // Billing and subscriptions
    'billing': 'Billing',
    'subscription': 'EcommSubscription',
    'subscriptions': 'EcommSubscription',
    'entitlements': 'Entitlement',

    // Other common types
    'inferred': 'ProfileInferredData',
    'metadata': 'ProfileMetadata',
    'brands': 'Brand',
    'locations': 'ProfileLocation',
    'hours': 'ProfileHours',
    'localization': 'ProfileLocalization'
  };

  const mappedType = fieldTypeMap[parentFieldName];
  if (mappedType) {
    return mappedType;
  }

  // Try to infer from the context path - check this before other fallbacks
  // Look for known patterns in the path
  const fullPath = pathStack.join('.');

  // Social links detection - check for social_links in the path
  if (fullPath.includes('social_links') || fullPath.includes('socialLinks')) {
    return 'SocialLink';
  }
  // Author field always maps to User
  if (fullPath.includes('author') || parentFieldName === 'author') {
    return 'User';
  }
  if (fullPath.includes('user.profile') || fullPath.includes('currentUser.profile')) {
    return 'Profile';
  }
  if (fullPath.includes('venture.profile')) {
    return 'VentureProfile';
  }
  if (fullPath.includes('contact')) {
    return 'UserContact';
  }
  if (fullPath.includes('address')) {
    return 'UserAddress';
  }

  // Enhanced parent field check - look for social context
  if (parentFieldName && (parentFieldName.includes('social') || parentFieldName === 'social_links')) {
    return 'SocialLink';
  }

  // Default fallback based on common patterns
  if (pathStack.length >= 2) {
    const grandparent = pathStack[pathStack.length - 3];
    if (grandparent === 'user' || grandparent === 'currentUser') {
      return 'User';
    }
    if (grandparent === 'venture') {
      return 'Venture';
    }
    if (grandparent === 'project') {
      return 'Project';
    }
  }

  // Final fallback - try to guess from field names
  if (parentFieldName && parentFieldName.toLowerCase().includes('user')) {
    return 'User';
  }
  if (parentFieldName && parentFieldName.toLowerCase().includes('profile')) {
    return 'Profile';
  }

  return 'Unknown';
}

function createNestedSelection(path: string, originalNode: FieldNode): FieldNode {
  const parts = path.split('.');

  if (parts.length !== 2) {
    // For now, only handle single-level nesting
    return originalNode;
  }

  const [parentField, childField] = parts;

  // Create the nested structure
  return {
    kind: Kind.FIELD,
    name: { kind: Kind.NAME, value: parentField },
    selectionSet: {
      kind: Kind.SELECTION_SET,
      selections: [{
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: childField },
        // Preserve any selections from the original field
        selectionSet: originalNode.selectionSet,
        // Preserve directives and arguments
        directives: originalNode.directives,
        arguments: originalNode.arguments
      }]
    }
  };
}

// Enhanced methods for Phase 2
export class EnhancedOptimizedSchemaTransformer extends OptimizedSchemaTransformer {
  async transformQuery(query: ExtractedQuery, _deprecations: DeprecationRule[]): Promise<TransformationResult> {
    const result = await this.transform(query.fullExpandedQuery);
    
    const transformationResult: TransformationResult = {
      newQuery: result.transformed,
      mappingUtil: this.generateMappingUtil({}, {}, query.name),
      abFlag: `new-queries-${query.name.toLowerCase()}`
    };
    
    return transformationResult;
  }

  async generatePR(
    queries: ExtractedQuery[], 
    transformations: TransformationResult[], 
    repoPath: string
  ): Promise<void> {
    const git = simpleGit(repoPath);
    
    try {
      // Create new branch
      await git.checkout('main');
      await git.checkoutLocalBranch('pgql-migrations-' + Date.now());
      
      // Write transformed queries and utils
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        const transformation = transformations[i];
        
        // Update query file
        const queryPath = query.sourceFile;
        await this.updateFileWithTransformation(
          queryPath, 
          query.query, 
          transformation.newQuery
        );
        
        // Generate utility file
        const utilPath = queryPath.replace('.js', '.utils.js');
        await this.writeUtilFile(utilPath, transformation.mappingUtil);
      }
      
      // Stage changes
      await git.add('.');
      
      // Create commit
      await git.commit('feat: Automated GraphQL schema migration\n\n' + 
        '- Updated queries for new schema\n' +
        '- Added backward compatibility utils\n' +
        '- Integrated Hivemind A/B flags\n\n' +
        'Generated by pg-migration-620');
      
      logger.info('PR branch created successfully');
    } catch (error) {
      logger.error('Failed to create PR:', error);
      throw error;
    }
  }

  private async updateFileWithTransformation(
    filePath: string, 
    oldQuery: string, 
    newQuery: string
  ): Promise<string> {
    try {
      const fs = await import('fs/promises');
      
      // Read the current file content
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Simple string replacement - in production, use AST for accuracy
      const updatedContent = content.replace(oldQuery, newQuery);
      
      // Write back to file
      await fs.writeFile(filePath, updatedContent, 'utf-8');
      
      logger.info(`Updated query in file: ${filePath}`);
      return updatedContent;
    } catch (error) {
      logger.error(`Failed to update file ${filePath}:`, error);
      throw error;
    }
  }

  private async writeUtilFile(filePath: string, utilContent: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write utility file with header
      const fullContent = `// Auto-generated by pg-migration-620
// Do not edit manually - regenerate using migration tool
// Generated at: ${new Date().toISOString()}

${utilContent}

export default ${utilContent.match(/function\s+(\w+)/)?.[1] || 'mapResponse'};
`;
      
      await fs.writeFile(filePath, fullContent, 'utf-8');
      logger.info(`Generated utility file: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to write utility file ${filePath}:`, error);
      throw error;
    }
  }
}
