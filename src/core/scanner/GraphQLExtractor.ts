// @ts-nocheck
import { gqlPluckFromCodeStringSync } from '@graphql-tools/graphql-tag-pluck';
import { parse, DocumentNode } from 'graphql';
import * as fs from 'fs/promises';
import * as path from 'path';
import glob from 'fast-glob';
import * as babel from '@babel/parser';
import traverse from '@babel/traverse';
import { logger } from '../../utils/logger.js';
import { FragmentResolver } from './FragmentResolver.js';
import { validateReadPath } from '../../utils/securePath.js';
import { safeParseGraphQL, detectOperationType, logParsingError } from '../../utils/graphqlValidator.js';
import { createDefaultQueryServices } from '../extraction/services/QueryServicesFactory.js';
import { PatternExtractedQuery } from '../extraction/types/pattern.types.js';


export interface ExtractedQuery {
  id: string;
  filePath: string;
  content: string;
  ast: DocumentNode;
  location: {
    line: number;
    column: number;
  };
  name?: string;
  originalName?: string;
  type: 'query' | 'mutation' | 'subscription' | 'fragment';
}

export class GraphQLExtractor {
  private fragmentResolver: FragmentResolver;
  private queryNames: Record<string, string> = {};
  private queryNamesLoaded = false;
  private seenQueryNames: Map<string, string> = new Map();
  private queryServices: Awaited<ReturnType<typeof createDefaultQueryServices>> | null = null;

  constructor() {
    this.fragmentResolver = new FragmentResolver();
  }

  async extractFromDirectory(directory: string, patterns: string[] = ['**/*.{js,jsx,ts,tsx}'], resolveFragments: boolean = true): Promise<ExtractedQuery[]> {
    // Initialize pattern-based query services
    if (!this.queryServices) {
      this.queryServices = await createDefaultQueryServices({
        projectRoot: directory,
        enableIncrementalExtraction: true,
        cacheConfig: {
          memoryLimit: 50 * 1024 * 1024, // 50MB
          ttl: 30 * 60 * 1000, // 30 minutes
        }
      });
    }

    // Try to load queryNames if not already loaded (deprecated)
    if (!this.queryNamesLoaded) {
      await this.loadQueryNames(directory);
    }
    logger.info(`Extracting GraphQL from ${directory}`);

    const files = await glob(patterns, {
      cwd: directory,
      absolute: true,
      ignore: ['**/node_modules/**', '**/__generated__/**', '**/*.test.*']
    });

    const allQueries: ExtractedQuery[] = [];

    for (const file of files) {
      try {
        const queries = await this.extractFromFile(file);
        allQueries.push(...queries);
      } catch (error) {
        logger.warn(`Failed to extract from ${file}:`, error);
      }
    }

    logger.info(`Extracted ${allQueries.length} GraphQL operations from ${files.length} files`);

    if (resolveFragments) {
      logger.info('Resolving fragments...');

      // First, find all fragment files in the directory
      const fragmentMap = await this.fragmentResolver.findAndLoadFragmentFiles(directory);
      logger.info(`Found ${fragmentMap.size} fragment files`);

      // Convert to format expected by resolver
      const queriesToResolve = allQueries.map(q => ({
        id: q.id,
        filePath: q.filePath,
        content: q.content,
        name: q.name
      }));

      // Resolve fragments for all queries
      const resolvedQueries = await this.fragmentResolver.resolveQueriesWithFragments(queriesToResolve, directory);

      // Update the extracted queries with resolved content
      for (let i = 0; i < allQueries.length; i++) {
        const resolved = resolvedQueries[i];
        if (resolved && resolved.fragments.length > 0) {
          allQueries[i].content = resolved.content;
          logger.debug(`Resolved ${resolved.fragments.length} fragments for ${resolved.id}`);
        }
      }

      logger.info('Fragment resolution complete');
    }

    return allQueries;
  }

  async extractFromFile(filePath: string): Promise<ExtractedQuery[]> {
    // SECURITY FIX: Validate path to prevent traversal attacks
    const validatedPath = validateReadPath(filePath);
    if (!validatedPath) {
      logger.warn(`Invalid or potentially malicious file path blocked: ${filePath}`);
      return [];
    }
    
    const content = await fs.readFile(validatedPath, 'utf-8');
    const extracted: ExtractedQuery[] = [];

    // First try to extract query names from the source code
    const queryNameMapping = await this.extractQueryNamesFromSource(content, filePath);

    try {
      // Use graphql-tag-pluck to extract GraphQL from various sources
      const sources = gqlPluckFromCodeStringSync(filePath, content, {
        globalGqlIdentifierName: ['gql', 'graphql', 'GraphQL'],
        gqlMagicComment: 'graphql',
        skipIndent: true,
        modules: [
          {
            name: 'graphql-tag',
            identifier: 'gql'
          },
          {
            name: '@apollo/client',
            identifier: 'gql'
          },
          {
            name: 'apollo-boost',
            identifier: 'gql'
          },
          {
            name: 'react-relay',
            identifier: 'graphql'
          }
        ]
      });

      if (sources && sources.length > 0) {
        sources.forEach((source, index) => {
          const validation = safeParseGraphQL(source.body);

          if (validation.isValid && validation.ast) {
            const type = this.detectOperationType(validation.ast);
            let name = this.extractOperationName(validation.ast);

            // Try to enhance the name if it looks like a variable reference
            const enhancedName = this.enhanceQueryName(source.body, name, queryNameMapping, index);
            if (enhancedName !== name) {
              logger.debug(`Enhanced query name from '${name}' to '${enhancedName}'`);
            }
            name = enhancedName;

            // Normalize query name if duplicate
            const normalizedName = this.normalizeQueryName(name, source.body);
            if (normalizedName !== name && name) {
              logger.debug(`Normalized duplicate query name from '${name}' to '${normalizedName}'`);
            }

            extracted.push({
              id: `${path.basename(filePath)}-${index}-${name || 'unnamed'}`,
              filePath,
              content: source.body,
              ast: validation.ast,
              location: {
                line: source.locationOffset?.line || 1,
                column: source.locationOffset?.column || 1
              },
              name: normalizedName || name,
              originalName: normalizedName !== name ? name : undefined,
              type
            });
          } else {
            // Only log at debug level for cleaner output
            logParsingError(source.body, validation.error!, `${filePath}:${source.locationOffset?.line || 1}`);
          }
        });
      }
    } catch (error) {
      // graphql-tag-pluck might throw for files without GraphQL
      // This is expected and we can safely ignore
    }

    return extracted;
  }

  private async loadQueryNames(directory: string): Promise<void> {
    logger.warn('loadQueryNames is deprecated. Pattern-based services handle query naming automatically.');

    try {
      // Look for queryNames file in common locations
      const possiblePaths = [
        path.join(directory, 'queryNames.js'),
        path.join(directory, 'src/queryNames.js'),
        path.join(directory, 'data/sample_data/queryNames.js'),
        path.join(directory, 'graphql/queryNames.js')
      ];

      for (const queryNamesPath of possiblePaths) {
        try {
          // SECURITY FIX: Validate path before reading
          const validatedPath = validateReadPath(queryNamesPath);
          if (!validatedPath) {
            continue;
          }
          const content = await fs.readFile(validatedPath, 'utf-8');
          const ast = babel.parse(content, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript']
          });

          traverse(ast, {
            ObjectExpression: (path: any) => {
              const parent = path.parent;
              if (parent.type === 'VariableDeclarator' && parent.id.name === 'queryNames') {
                path.node.properties.forEach((prop: any) => {
                  if (prop.type === 'ObjectProperty' && prop.value.type === 'StringLiteral') {
                    this.queryNames[prop.key.name] = prop.value.value;
                  }
                });
              }
            }
          });

          if (Object.keys(this.queryNames).length > 0) {
            logger.info(`Loaded ${Object.keys(this.queryNames).length} query names from ${queryNamesPath}`);
            this.queryNamesLoaded = true;
            break;
          }
        } catch (error) {
          // Continue to next path
        }
      }
    } catch (error) {
      logger.debug('Could not load queryNames:', error);
    }
  }

  private async extractQueryNamesFromSource(content: string, filePath: string): Promise<Map<number, string>> {
    const mapping = new Map<number, string>();

    try {
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });

      let queryIndex = 0;
      traverse(ast, {
        TaggedTemplateExpression: (path: any) => {
          if (path.node.tag.name === 'gql' || path.node.tag.name === 'graphql') {
            const quasi = path.node.quasi;

            // Look through all expressions in the template literal
            for (let i = 0; i < quasi.expressions.length; i++) {
              const expr = quasi.expressions[i];

              // Check if this expression is queryNames.something
              if (expr.type === 'MemberExpression' &&
                  expr.object.name === 'queryNames' &&
                  this.queryNames[expr.property.name]) {

                // Check if this is likely the query name position
                // It should come after 'query' keyword
                const prevQuasi = quasi.quasis[i];
                const prevText = prevQuasi.value.raw.trim();

                if (prevText.endsWith('query') || prevText.match(/query\s*$/)) {
                  mapping.set(queryIndex, this.queryNames[expr.property.name]);
                  break;
                }
              }
            }

            queryIndex++;
          }
        }
      });
    } catch (error) {
      logger.debug(`Could not parse file for query names: ${filePath}`, error);
    }

    return mapping;
  }

  private enhanceQueryName(queryContent: string, extractedName: string | undefined, queryNameMapping: Map<number, string>, index: number): string | undefined {
    // First check if we have a mapping from our AST analysis
    const mappedName = queryNameMapping.get(index);
    if (mappedName) {
      return mappedName;
    }

    // If the query has a hardcoded name in the GraphQL itself, use that
    if (extractedName && !extractedName.startsWith('$')) {
      return extractedName;
    }

    // Try to extract from the query content itself
    const match = queryContent.match(/query\s+([A-Za-z_$][\w$]*)/m);
    if (match) {
      return match[1];
    }

    return extractedName;
  }

    private normalizeQueryName(name: string | undefined, content: string): string | undefined {
    logger.warn('normalizeQueryName is deprecated. Use pattern-based processing with QueryNamingService instead.');

    if (!name) return name;

    // Use pattern-based processing if available
    if (this.queryServices) {
      const patternQuery: PatternExtractedQuery = {
        id: `temp-${name}`,
        name,
        source: content,
        type: 'query',
        filePath: 'temp',
        fragments: [],
        namePattern: undefined,
        resolvedName: name,
        contentFingerprint: this.generateContentFingerprint(content),
        patternMetadata: {
          isDynamic: false,
          hasInterpolation: content.includes('${'),
          confidence: 1.0
        }
      };

      const processed = this.queryServices.namingService.processQuery(patternQuery);
      return processed.resolvedName;
    }

    // Fallback to old method for backward compatibility
    const existingContent = this.seenQueryNames.get(name);
    if (!existingContent) {
      // First time seeing this name
      this.seenQueryNames.set(name, this.normalizeContent(content));
      return name;
    }

    // Check if the content is identical (normalized)
    const normalizedContent = this.normalizeContent(content);
    if (existingContent === normalizedContent) {
      // Same query, no need to rename
      return name;
    }

    // Different query with same name, need to generate unique name
    let suffix = 1;
    let newName = `${name}_${suffix}`;

    while (this.seenQueryNames.has(newName)) {
      suffix++;
      newName = `${name}_${suffix}`;
    }

    this.seenQueryNames.set(newName, normalizedContent);
    return newName;
  }

  private generateContentFingerprint(content: string): string {
    const normalized = content
      .replace(/\s+/g, ' ')
      .replace(/\$\{[^}]+\}/g, '${...}')
      .trim();

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return hash.toString(36);
  }

  private normalizeContent(content: string): string {
    // Normalize whitespace and remove comments for comparison
    return content
      .replace(/#.*$/gm, '') // Remove comments
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private detectOperationType(ast: DocumentNode): 'query' | 'mutation' | 'subscription' | 'fragment' {
    const definition = ast.definitions[0];

    if (definition.kind === 'OperationDefinition') {
      return definition.operation;
    }

    if (definition.kind === 'FragmentDefinition') {
      return 'fragment';
    }

    return 'query'; // Default
  }

  private extractOperationName(ast: DocumentNode): string | undefined {
    const definition = ast.definitions[0];

    if (definition.kind === 'OperationDefinition' || definition.kind === 'FragmentDefinition') {
      return definition.name?.value;
    }

    return undefined;
  }

  async extractFromSource(source: string): Promise<ExtractedQuery[]> {
    const validation = safeParseGraphQL(source);

    if (validation.isValid && validation.ast) {
      const type = this.detectOperationType(validation.ast);
      const name = this.extractOperationName(validation.ast);

      return [{
        id: `inline-${name || 'unnamed'}`,
        filePath: 'inline',
        content: source,
        ast: validation.ast,
        location: { line: 1, column: 1 },
        name,
        type
      }];
    } else {
      logParsingError(source, validation.error!, 'inline source');
      return [];
    }
  }
}
