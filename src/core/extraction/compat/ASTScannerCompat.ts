/**
 * Compatibility bridge for ASTScanner
 * Provides the old interface while using modern ASTStrategy internally
 */

import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { DocumentNode, parse } from 'graphql';
import { logger } from '../../../utils/logger.js';
import { ASTStrategy } from '../strategies/ASTStrategy.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';

export interface QueryExtraction {
  query: DocumentNode;
  location: SourceLocation;
  variables: Record<string, GraphQLType>;
  operation: 'query' | 'mutation' | 'subscription';
  rawQuery: string;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  component?: string; // React component name
}

export interface GraphQLType {
  type: string;
  required: boolean;
  list: boolean;
}

/**
 * @deprecated Use ASTStrategy from core/extraction/strategies instead
 * This is a compatibility bridge to ease migration
 */
export class ASTScanner {
  private astStrategy: ASTStrategy;

  constructor() {
    // Create a minimal context for the ASTStrategy
    const context = new ExtractionContext({
      directory: process.cwd(),
      strategies: ['ast'],
    });
    this.astStrategy = new ASTStrategy(context);
  }

  // Legacy interface - simplified implementation for compatibility
  extractGraphQLQueries(path: NodePath<t.CallExpression>, file: string): QueryExtraction | null {
    try {
      if (!t.isIdentifier(path.node.callee, { name: 'gql' })) {
        return null;
      }

      const [templateLiteral] = path.node.arguments;
      if (!t.isTemplateLiteral(templateLiteral)) {
        return null;
      }

      const queryString = templateLiteral.quasis.map((q) => q.value.raw).join('');
      return this.parseAndValidateQuery(queryString, path, file);
    } catch (error) {
      logger.warn(`Failed to extract GraphQL query from ${file}:`, error);
      return null;
    }
  }

  private parseAndValidateQuery(
    queryString: string,
    path: NodePath<t.CallExpression>,
    file: string,
  ): QueryExtraction | null {
    try {
      const query = parse(queryString);
      const location = path.node.loc;
      
      // Extract operation type from the parsed query
      const operationDefinition = query.definitions.find(
        def => def.kind === 'OperationDefinition'
      ) as any;
      
      const operation = operationDefinition?.operation || 'query';

      return {
        query,
        location: {
          file,
          line: location?.start.line || 1,
          column: location?.start.column || 1,
        },
        variables: {}, // Simplified for compatibility
        operation,
        rawQuery: queryString,
      };
    } catch (error) {
      logger.warn(`Failed to parse GraphQL query in ${file}:`, error);
      return null;
    }
  }
}