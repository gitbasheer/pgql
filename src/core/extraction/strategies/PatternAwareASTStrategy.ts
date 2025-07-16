// @ts-nocheck
import { BaseStrategy } from './BaseStrategy.js';
import { PatternExtractedQuery } from '../types/pattern.types.js';
import { ExtractedQuery, SourceAST } from '../types/query.types.js';
import { QueryPatternService } from '../engine/QueryPatternRegistry.js';
import { logger } from '../../../utils/logger.js';
import { parse as parseGraphQL, DocumentNode } from 'graphql';
import { parse as parseBabel } from '@babel/parser';
import * as traverseModule from '@babel/traverse';
const traverse = (traverseModule as any).default || traverseModule;
import * as babel from '@babel/types';

export class PatternAwareASTStrategy extends BaseStrategy {
  private patternService: QueryPatternService;

  constructor(patternService: QueryPatternService) {
    super();
    this.patternService = patternService;
  }

  async extract(filePath: string, content: string): Promise<PatternExtractedQuery[]> {
    const queries: PatternExtractedQuery[] = [];

    try {
      // Parse the file with Babel
      const ast = parseBabel(content, {
        sourceType: 'module',
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'functionBind',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'dynamicImport',
          'nullishCoalescingOperator',
          'optionalChaining',
        ],
      });

      // Extract queries with enhanced pattern awareness
      (traverse as any)(ast, {
        TaggedTemplateExpression: (path) => {
          if (this.isGraphQLTag(path.node.tag)) {
            const query = this.extractPatternQuery(path, filePath, content);
            if (query) {
              queries.push(query);
            }
          }
        },
      });

      // Apply pattern analysis to all extracted queries
      for (const query of queries) {
        this.patternService.analyzeQueryPattern(query);
      }
    } catch (error) {
      logger.error(`Failed to extract queries from ${filePath}: ${error}`);
      return [];
    }

    return queries;
  }

  /**
   * Extract query with pattern awareness
   */
  private extractPatternQuery(
    path: babel.NodePath<babel.TaggedTemplateExpression>,
    filePath: string,
    content: string,
  ): PatternExtractedQuery | null {
    try {
      const { node } = path;
      const quasi = node.quasi;

      // Build the complete query string
      const queryString = this.buildQueryString(quasi);

      // Parse GraphQL AST
      let graphqlAST: DocumentNode | null = null;
      try {
        graphqlAST = parseGraphQL(queryString);
      } catch (parseError) {
        logger.warn(`Failed to parse GraphQL in ${filePath}: ${parseError}`);
      }

      // Extract source AST information
      const sourceAST: SourceAST = {
        node: node,
        start: node.start || 0,
        end: node.end || 0,
        templateLiteral: {
          quasis: quasi.quasis,
          expressions: quasi.expressions,
        },
        parent: path.parent,
      };

      // Create base query object
      const baseQuery: ExtractedQuery = {
        id: this.generateQueryId(filePath, node.start || 0),
        filePath,
        content: queryString,
        ast: graphqlAST,
        location: {
          line: node.loc?.start.line || 1,
          column: node.loc?.start.column || 0,
          file: filePath,
        },
        type: this.determineOperationType(queryString),
        sourceAST,
        context: this.extractQueryContext(path),
        metadata: {
          hasInterpolations: quasi.expressions.length > 0,
          needsResolution: this.needsResolution(quasi),
          fileContent: content,
        },
      };

      // Convert to pattern-aware query
      const patternQuery: PatternExtractedQuery = {
        ...baseQuery,
        // Pattern information will be added by analyzeQueryPattern
      };

      return patternQuery;
    } catch (error) {
      logger.error(`Failed to extract query from AST: ${error}`);
      return null;
    }
  }

  /**
   * Build query string from template literal
   */
  private buildQueryString(quasi: babel.TemplateLiteral): string {
    let queryString = '';

    for (let i = 0; i < quasi.quasis.length; i++) {
      queryString += quasi.quasis[i].value.cooked || quasi.quasis[i].value.raw;

      if (i < quasi.expressions.length) {
        const expr = quasi.expressions[i];

        // Handle queryNames interpolations specially
        if (
          expr.type === 'MemberExpression' &&
          expr.object.type === 'Identifier' &&
          expr.object.name === 'queryNames'
        ) {
          // Keep the interpolation as-is for pattern tracking
          queryString += `\${queryNames.${(expr.property as babel.Identifier).name}}`;
        } else {
          // For other interpolations, use placeholder
          queryString += `__INTERPOLATION_${i}__`;
        }
      }
    }

    return queryString;
  }

  /**
   * Check if template literal needs resolution
   */
  private needsResolution(quasi: babel.TemplateLiteral): boolean {
    return quasi.expressions.some((expr) => {
      // QueryNames expressions need pattern tracking, not resolution
      if (
        expr.type === 'MemberExpression' &&
        expr.object.type === 'Identifier' &&
        expr.object.name === 'queryNames'
      ) {
        return false;
      }
      // Other expressions might need resolution
      return true;
    });
  }

  /**
   * Extract query context information
   */
  private extractQueryContext(path: babel.NodePath<babel.TaggedTemplateExpression>): any {
    const context: any = {};

    // Find containing function/component
    const functionPath = path.getFunctionParent();
    if (functionPath) {
      if (functionPath.node.type === 'FunctionDeclaration' && functionPath.node.id) {
        context.functionName = functionPath.node.id.name;
      } else if (functionPath.node.type === 'ArrowFunctionExpression') {
        // Look for variable declaration
        const varPath = functionPath.findParent((p) => p.isVariableDeclarator());
        if (
          varPath &&
          varPath.node.type === 'VariableDeclarator' &&
          varPath.node.id.type === 'Identifier'
        ) {
          context.functionName = varPath.node.id.name;
        }
      }
    }

    // Check if this is an export
    const exportPath = path.findParent((p) => p.isExportDeclaration());
    if (exportPath) {
      context.isExported = true;
      context.isDefaultExport = exportPath.node.type === 'ExportDefaultDeclaration';
    }

    return context;
  }

  /**
   * Determine operation type from query string
   */
  private determineOperationType(
    queryString: string,
  ): 'query' | 'mutation' | 'subscription' | 'fragment' {
    const trimmed = queryString.trim();

    if (trimmed.startsWith('query') || trimmed.includes('${queryNames.')) {
      return 'query';
    }
    if (trimmed.startsWith('mutation')) {
      return 'mutation';
    }
    if (trimmed.startsWith('subscription')) {
      return 'subscription';
    }
    if (trimmed.startsWith('fragment')) {
      return 'fragment';
    }

    // Default to query for dynamic names
    return 'query';
  }

  /**
   * Check if a node is a GraphQL tag
   */
  private isGraphQLTag(tag: babel.Expression): boolean {
    // Handle direct identifiers
    if (tag.type === 'Identifier') {
      return ['gql', 'graphql', 'query', 'mutation', 'subscription'].includes(tag.name);
    }

    // Handle member expressions (e.g., apollo.gql)
    if (tag.type === 'MemberExpression' && tag.property.type === 'Identifier') {
      return ['gql', 'graphql', 'query', 'mutation', 'subscription'].includes(tag.property.name);
    }

    return false;
  }

  /**
   * Generate unique query ID
   */
  private generateQueryId(filePath: string, position: number): string {
    const fileName =
      filePath
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') || 'unknown';
    return `${fileName}-${position}-${Date.now()}`;
  }

  /**
   * Group queries by content fingerprint for duplicate detection
   */
  async groupDuplicates(
    queries: PatternExtractedQuery[],
  ): Promise<Map<string, PatternExtractedQuery[]>> {
    return this.patternService.groupByFingerprint(queries);
  }

  /**
   * Get migration recommendations for queries
   */
  getMigrationRecommendations(queries: PatternExtractedQuery[]): Array<{
    query: PatternExtractedQuery;
    recommendations: ReturnType<QueryPatternService['getMigrationRecommendations']>;
  }> {
    return queries.map((query) => ({
      query,
      recommendations: this.patternService.getMigrationRecommendations(query),
    }));
  }

  /**
   * Override the name - this strategy doesn't need it
   */
  get name(): string {
    return 'pattern-aware-ast';
  }
}
