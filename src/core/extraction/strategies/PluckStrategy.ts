import { gqlPluckFromCodeStringSync } from '@graphql-tools/graphql-tag-pluck';
import { parse, DocumentNode } from 'graphql';
import * as babel from '@babel/parser';
import traverseDefault from '@babel/traverse';
const traverse = traverseDefault as any;
import { BaseStrategy } from './BaseStrategy.js';
import { ExtractedQuery, OperationType, SourceAST } from '../types/index.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';
import { safeParseGraphQL } from '../../../utils/graphqlValidator.js';
import { SourceMapper } from '../utils/SourceMapper.js';


export class PluckStrategy extends BaseStrategy {
  private sourceMapper: SourceMapper;

  constructor(context: ExtractionContext) {
    super(context);
    this.sourceMapper = new SourceMapper();
  }

  get name(): string {
    return 'pluck';
  }

  canHandle(filePath: string): boolean {
    return /\.(js|jsx|ts|tsx)$/.test(filePath);
  }

  async extract(filePath: string, content: string): Promise<ExtractedQuery[]> {
    const extracted: ExtractedQuery[] = [];
    
    // FIRST: Extract templates with interpolations manually BEFORE graphql-tag-pluck
    // This prevents graphql-tag-pluck from resolving them to empty strings
    const manuallyExtracted = this.extractTemplatesWithInterpolations(filePath, content);
    extracted.push(...manuallyExtracted);

    try {
      // Create a modified content where we've replaced templates with interpolations
      // with placeholder queries to prevent graphql-tag-pluck from processing them
      const modifiedContent = this.replaceInterpolatedTemplates(content);
      
      const sources = gqlPluckFromCodeStringSync(filePath, modifiedContent, {
        globalGqlIdentifierName: ['gql', 'graphql', 'GraphQL'],
        gqlMagicComment: 'graphql',
        skipIndent: true,
        modules: [
          { name: 'graphql-tag', identifier: 'gql' },
          { name: '@apollo/client', identifier: 'gql' },
          { name: '@apollo/client/core', identifier: 'gql' },
          { name: 'apollo-boost', identifier: 'gql' },
          { name: 'react-relay', identifier: 'graphql' },
          { name: 'relay-runtime', identifier: 'graphql' }
        ]
      });

      if (sources && sources.length > 0) {
        // If we need to preserve source AST, we'll need to parse with Babel
        let astMap: Map<string, SourceAST> | null = null;
        if (this.context.options.preserveSourceAST) {
          astMap = this.extractSourceASTs(filePath, content);
        }

        for (let i = 0; i < sources.length; i++) {
          const source = sources[i];
          // Skip if this was already extracted manually (it would have been replaced)
          if (!source.body || source.body.trim() === '') {
            continue;
          }
          
          // Check if template has interpolations (shouldn't happen now, but just in case)
          const hasInterpolations = source.body.includes('${');
          
          if (hasInterpolations) {
            // For templates with interpolations, extract without full parsing
            const type = this.detectOperationTypeFromString(source.body) || 'query';
            const name = this.extractOperationNameFromString(source.body);
            
            const query: ExtractedQuery = {
              id: this.generateQueryId(filePath, i, name),
              filePath,
              content: source.body,
              ast: null,
              location: {
                line: source.locationOffset?.line || 1,
                column: source.locationOffset?.column || 1,
                file: filePath
              },
              name,
              type,
              metadata: {
                hasInterpolations: true,
                needsResolution: true
              }
            };

            // Try to find and attach source AST
            if (astMap && this.context.options.preserveSourceAST) {
              const sourceAST = this.findMatchingAST(astMap, source.body, i);
              if (sourceAST) {
                query.sourceAST = sourceAST;
                this.sourceMapper.register(query.id, sourceAST);
              }
            }

            extracted.push(query);
          } else {
            const validation = safeParseGraphQL(source.body);
            
            if (validation.isValid && validation.ast) {
              const type = this.detectOperationType(validation.ast);
              const name = this.extractOperationName(validation.ast);
              
              const query: ExtractedQuery = {
                id: this.generateQueryId(filePath, i, name),
                filePath,
                content: source.body,
                ast: validation.ast,
                location: {
                  line: source.locationOffset?.line || 1,
                  column: source.locationOffset?.column || 1,
                  file: filePath
                },
                name,
                type
              };

              // Try to find and attach source AST
              if (astMap && this.context.options.preserveSourceAST) {
                const sourceAST = this.findMatchingAST(astMap, source.body, i);
                if (sourceAST) {
                  query.sourceAST = sourceAST;
                  this.sourceMapper.register(query.id, sourceAST);
                }
              }

              extracted.push(query);
            } else if (validation.error) {
              // All GraphQL should be valid after template resolution
              // These errors indicate that template resolution failed
              this.context.addError(
                filePath,
                `Failed to parse GraphQL: ${validation.error.message}`,
                source.locationOffset?.line || 1,
                source.locationOffset?.column || 1
              );
            }
          }
        }
      }
    } catch (error) {
      // graphql-tag-pluck might throw for files without GraphQL
      // This is expected for many files
      // However, the file might contain GraphQL templates with interpolations
      // that graphql-tag-pluck can't handle. Let's try to extract them manually.
      try {
        const manuallyExtracted = this.extractTemplatesWithInterpolations(filePath, content);
        extracted.push(...manuallyExtracted);
      } catch (manualError) {
        // If manual extraction also fails, skip this file
      }
    }

    return extracted;
  }

  /**
   * Extract source ASTs using Babel parser
   */
  private extractSourceASTs(filePath: string, content: string): Map<string, SourceAST> {
    const astMap = new Map<string, SourceAST>();
    
    try {
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties']
      });

      let index = 0;
      traverse(ast, {
        TaggedTemplateExpression: (path: any) => {
          if (SourceMapper.isGraphQLTag(path.node.tag)) {
            const sourceAST: SourceAST = {
              node: path.node,
              start: path.node.start ?? 0,
              end: path.node.end ?? 0,
              parent: path.parent
            };
            
            const templateLiteral = SourceMapper.extractTemplateLiteral(path.node);
            if (templateLiteral) {
              sourceAST.templateLiteral = templateLiteral;
            }
            
            astMap.set(`${index}`, sourceAST);
            index++;
          }
        },
        
        CallExpression: (path: any) => {
          if (SourceMapper.isGraphQLCall(path.node)) {
            const sourceAST: SourceAST = {
              node: path.node,
              start: path.node.start ?? 0,
              end: path.node.end ?? 0,
              parent: path.parent
            };
            
            const templateLiteral = SourceMapper.extractTemplateLiteral(path.node);
            if (templateLiteral) {
              sourceAST.templateLiteral = templateLiteral;
            }
            
            astMap.set(`${index}`, sourceAST);
            index++;
          }
        }
      });
    } catch (error) {
      // Failed to parse with Babel, continue without source AST
    }
    
    return astMap;
  }

  /**
   * Find matching AST for a given GraphQL content
   */
  private findMatchingAST(astMap: Map<string, SourceAST>, content: string, index: number): SourceAST | undefined {
    // First try by index
    const byIndex = astMap.get(`${index}`);
    if (byIndex) {
      return byIndex;
    }
    
    // If that fails, try to match by content similarity
    // This is a fallback and might not always be accurate
    return undefined;
  }

  /**
   * Get the source mapper instance
   */
  getSourceMapper(): SourceMapper {
    return this.sourceMapper;
  }

  private detectOperationType(ast: DocumentNode): OperationType {
    const definition = ast.definitions[0];
    
    if (definition.kind === 'OperationDefinition') {
      return definition.operation;
    }
    
    if (definition.kind === 'FragmentDefinition') {
      return 'fragment';
    }
    
    return 'query';
  }

  private extractOperationName(ast: DocumentNode): string | undefined {
    const definition = ast.definitions[0];
    
    if (definition.kind === 'OperationDefinition' || definition.kind === 'FragmentDefinition') {
      return definition.name?.value;
    }
    
    return undefined;
  }

  private detectOperationTypeFromString(content: string): OperationType | null {
    const trimmed = content.trim();
    
    if (trimmed.includes('query') || trimmed.match(/query\s+[\w$]/)) return 'query';
    if (trimmed.includes('mutation') || trimmed.match(/mutation\s+[\w$]/)) return 'mutation';
    if (trimmed.includes('subscription') || trimmed.match(/subscription\s+[\w$]/)) return 'subscription';
    if (trimmed.includes('fragment') || trimmed.match(/fragment\s+[\w$]/)) return 'fragment';
    
    return null;
  }

  private extractOperationNameFromString(content: string): string | undefined {
    // Try to extract operation name from templates with interpolations
    // Look for patterns like "query SomeName" or "mutation SomeName"
    const patterns = [
      /query\s+([\w]+)\s*[({$]/,
      /mutation\s+([\w]+)\s*[({$]/,
      /subscription\s+([\w]+)\s*[({$]/,
      /fragment\s+([\w]+)\s+on/
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return undefined;
  }

  /**
   * Manually extract GraphQL templates with interpolations that graphql-tag-pluck can't handle
   */
  private extractTemplatesWithInterpolations(filePath: string, content: string): ExtractedQuery[] {
    const extracted: ExtractedQuery[] = [];
    
    // Look for various GraphQL tag patterns that might contain interpolations
    const patterns = [
      // Standard gql templates with interpolations
      /gql\s*`([^`]+(?:\$\{[^}]+\}[^`]*)*)`/gs,
      /graphql\s*`([^`]+(?:\$\{[^}]+\}[^`]*)*)`/gs,
      /GraphQL\s*`([^`]+(?:\$\{[^}]+\}[^`]*)*)`/gs,
      // Computed property patterns like queries[queryName]
      /queries\s*\[\s*['"`]?([^'"`\]]+)['"`]?\s*\]\s*=\s*gql\s*`([^`]+)`/gs,
      // Dynamic query name patterns
      /gql\s*`\s*query\s+\$\{[^}]+\}[^`]*`/gs,
      // Conditional patterns
      /\$\{[^}]*\?\s*['"`][^'"`]+['"`]\s*:\s*['"`][^'"`]+['"`]\s*\}/g
    ];
    
    let queryIndex = 0;
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let queryContent = '';
        let matchIndex = match.index;
        
        // Handle different pattern types
        if (pattern.source.includes('queries')) {
          // For computed property patterns
          const [fullMatch, propertyName, templateContent] = match;
          queryContent = templateContent;
        } else {
          // For regular patterns
          queryContent = match[1] || match[0];
        }
        
        // Calculate line number by counting newlines before the match
        const beforeMatch = content.substring(0, matchIndex);
        const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;
        
        // Check if this template has interpolations or is a dynamic construction
        if (queryContent.includes('${') || match[0].includes('queries[')) {
          const type = this.detectOperationTypeFromString(queryContent) || 'query';
          const name = this.extractOperationNameFromString(queryContent);
          
          extracted.push({
            id: this.generateQueryId(filePath, queryIndex, name),
            filePath,
            content: queryContent,
            ast: null,
            location: {
              line: lineNumber,
              column: 1,
              file: filePath
            },
            name,
            type,
            metadata: {
              hasInterpolations: true,
              needsResolution: true,
              isDynamic: true
            }
          });
          
          queryIndex++;
        }
      }
    }
    
    // Also look for object literals with GraphQL queries
    const objectPattern = /const\s+queries\s*=\s*\{[\s\S]*?\}/gm;
    const objectMatches = content.match(objectPattern);
    
    if (objectMatches) {
      for (const objectMatch of objectMatches) {
        // Extract individual queries from the object
        const queryPattern = /(\w+)\s*:\s*gql\s*`([^`]+)`/g;
        let queryMatch;
        
        while ((queryMatch = queryPattern.exec(objectMatch)) !== null) {
          const [, queryName, queryContent] = queryMatch;
          
          if (queryContent.includes('${')) {
            const type = this.detectOperationTypeFromString(queryContent) || 'query';
            
            extracted.push({
              id: this.generateQueryId(filePath, queryIndex, queryName),
              filePath,
              content: queryContent,
              ast: null,
              location: {
                line: 1, // Would need proper line calculation
                column: 1,
                file: filePath
              },
              name: queryName,
              type,
              metadata: {
                hasInterpolations: true,
                needsResolution: true,
                fromObject: true
              }
            });
            
            queryIndex++;
          }
        }
      }
    }
    
    return extracted;
  }

  /**
   * Pre-resolve template literals to prevent parsing errors
   */
  private preResolveTemplates(content: string, filePath: string): string {
    try {
      // Load query names and fragments from context
      const queryNames = this.context.queryNames || {};
      
      // This is a simplified approach - we need to analyze each template function context
      // For now, let's skip pre-resolution and let the template resolver handle it
      // after extraction. The key is to extract templates with interpolations first.
      
      return content;
    } catch (error) {
      // If resolution fails, return original content
      return content;
    }
  }

  /**
   * Replace interpolated templates with placeholders to prevent graphql-tag-pluck from processing them
   */
  private replaceInterpolatedTemplates(content: string): string {
    // Pattern to match GraphQL templates with interpolations
    const patterns = [
      /gql\s*`([^`]+\$\{[^}]+\}[^`]*)+`/g,
      /graphql\s*`([^`]+\$\{[^}]+\}[^`]*)+`/g,
      /GraphQL\s*`([^`]+\$\{[^}]+\}[^`]*)+`/g
    ];
    
    let modifiedContent = content;
    
    for (const pattern of patterns) {
      modifiedContent = modifiedContent.replace(pattern, (match) => {
        // Replace with a placeholder that graphql-tag-pluck will ignore
        return `/* EXTRACTED_TEMPLATE_WITH_INTERPOLATION */`;
      });
    }
    
    return modifiedContent;
  }
}