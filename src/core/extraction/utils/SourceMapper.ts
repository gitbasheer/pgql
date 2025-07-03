import * as babel from '@babel/types';
import { SourceAST } from '../types/query.types';

/**
 * Service for managing bidirectional mapping between Query IDs and Source ASTs
 * Handles template literal interpolations and supports all GraphQL tag variations
 */
export class SourceMapper {
  private queryToAst: Map<string, SourceAST> = new Map();
  private astToQuery: Map<babel.Node, string> = new Map();
  private interpolationMap: Map<string, InterpolationInfo[]> = new Map();

  /**
   * Register a mapping between a query ID and its source AST
   */
  register(queryId: string, sourceAST: SourceAST): void {
    this.queryToAst.set(queryId, sourceAST);
    this.astToQuery.set(sourceAST.node, queryId);

    // Track interpolations if present - only when there are actual expressions
    if (sourceAST.templateLiteral && sourceAST.templateLiteral.expressions && sourceAST.templateLiteral.expressions.length > 0) {
      const interpolations = this.extractInterpolations(sourceAST.templateLiteral);
      this.interpolationMap.set(queryId, interpolations);
    }
  }

  /**
   * Get source AST by query ID
   */
  getSourceAST(queryId: string): SourceAST | undefined {
    return this.queryToAst.get(queryId);
  }

  /**
   * Get mapping by query ID (alias for getSourceAST for compatibility)
   */
  getMapping(queryId: string): SourceAST | undefined {
    return this.getSourceAST(queryId);
  }

  /**
   * Get query ID by AST node
   */
  getQueryId(node: babel.Node): string | undefined {
    return this.astToQuery.get(node);
  }

  /**
   * Get interpolation information for a query
   */
  getInterpolations(queryId: string): InterpolationInfo[] {
    return this.interpolationMap.get(queryId) || [];
  }

  /**
   * Check if a node represents a GraphQL tag
   */
  static isGraphQLTag(node: babel.Node): boolean {
    if (babel.isIdentifier(node)) {
      return ['gql', 'graphql', 'GraphQL'].includes(node.name);
    }
    if (babel.isMemberExpression(node)) {
      return SourceMapper.isGraphQLTag(node.property);
    }
    return false;
  }

  /**
   * Check if a call expression is a GraphQL call
   */
  static isGraphQLCall(node: babel.Node): boolean {
    return babel.isCallExpression(node) &&
           babel.isIdentifier(node.callee) &&
           ['gql', 'graphql', 'GraphQL'].includes(node.callee.name) &&
           node.arguments.length > 0 &&
           babel.isTemplateLiteral(node.arguments[0]);
  }

  /**
   * Extract template literal structure for preservation
   */
  static extractTemplateLiteral(node: babel.Node): { quasis: babel.TemplateElement[], expressions: babel.Expression[] } | null {
    if (babel.isTaggedTemplateExpression(node)) {
      return {
        quasis: node.quasi.quasis,
        expressions: node.quasi.expressions as babel.Expression[]
      };
    }
    if (babel.isCallExpression(node) && node.arguments[0] && babel.isTemplateLiteral(node.arguments[0])) {
      const template = node.arguments[0];
      return {
        quasis: template.quasis,
        expressions: template.expressions as babel.Expression[]
      };
    }
    return null;
  }

  /**
   * Extract detailed interpolation information
   */
  private extractInterpolations(template: { quasis: babel.TemplateElement[], expressions: babel.Expression[] }): InterpolationInfo[] {
    const interpolations: InterpolationInfo[] = [];

    for (let i = 0; i < template.expressions.length; i++) {
      const expr = template.expressions[i];
      const prevQuasi = template.quasis[i];
      const nextQuasi = template.quasis[i + 1];

      interpolations.push({
        index: i,
        expression: expr,
        beforeText: prevQuasi.value.raw,
        afterText: nextQuasi?.value.raw || '',
        position: {
          start: prevQuasi.end ?? 0,
          end: nextQuasi?.start ?? 0
        },
        type: this.classifyExpression(expr)
      });
    }

    return interpolations;
  }

  /**
   * Classify the type of interpolation expression
   */
  private classifyExpression(expr: babel.Expression): InterpolationType {
    if (babel.isMemberExpression(expr)) {
      if (babel.isIdentifier(expr.object) && expr.object.name === 'queryNames') {
        return 'queryName';
      }
      return 'memberAccess';
    }
    if (babel.isIdentifier(expr)) {
      return 'identifier';
    }
    if (babel.isCallExpression(expr)) {
      return 'functionCall';
    }
    if (babel.isConditionalExpression(expr)) {
      return 'conditional';
    }
    return 'other';
  }

  /**
   * Clear all mappings
   */
  clear(): void {
    this.queryToAst.clear();
    this.astToQuery.clear();
    this.interpolationMap.clear();
  }

  /**
   * Get statistics about mapped queries
   */
  getStats(): SourceMapperStats {
    return {
      totalQueries: this.queryToAst.size,
      queriesWithInterpolations: this.interpolationMap.size,
      interpolationTypes: this.getInterpolationTypeStats()
    };
  }

  private getInterpolationTypeStats(): Record<InterpolationType, number> {
    const stats: Record<InterpolationType, number> = {
      queryName: 0,
      memberAccess: 0,
      identifier: 0,
      functionCall: 0,
      conditional: 0,
      other: 0
    };

    for (const interpolations of this.interpolationMap.values()) {
      for (const info of interpolations) {
        stats[info.type]++;
      }
    }

    return stats;
  }
}

interface InterpolationInfo {
  index: number;
  expression: babel.Expression;
  beforeText: string;
  afterText: string;
  position: {
    start: number;
    end: number;
  };
  type: InterpolationType;
}

type InterpolationType = 'queryName' | 'memberAccess' | 'identifier' | 'functionCall' | 'conditional' | 'other';

interface SourceMapperStats {
  totalQueries: number;
  queriesWithInterpolations: number;
  interpolationTypes: Record<InterpolationType, number>;
}
