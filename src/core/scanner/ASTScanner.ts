import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { DocumentNode, parse } from 'graphql';
import { logger } from '../../utils/logger.js';

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
  component?: string;  // React component name
}

export interface GraphQLType {
  type: string;
  required: boolean;
  list: boolean;
}

export class ASTScanner {
  // Type-safe visitor pattern
  extractGraphQLQueries(
    path: NodePath<t.CallExpression>,
    file: string
  ): QueryExtraction | null {
    if (!t.isIdentifier(path.node.callee, { name: 'gql' })) {
      return null;
    }

    const [templateLiteral] = path.node.arguments;
    if (!t.isTemplateLiteral(templateLiteral)) {
      return null;  // TypeScript catches this
    }

    // Now we KNOW it's a template literal
    const queryString = templateLiteral.quasis
      .map(q => q.value.raw)
      .join('');

    return this.parseAndValidateQuery(queryString, path, file);
  }

  private parseAndValidateQuery(
    queryString: string,
    path: NodePath<t.CallExpression>,
    file: string
  ): QueryExtraction | null {
    try {
      const query = parse(queryString);
      const operation = this.detectOperationType(query);
      const variables = this.extractVariables(query);
      
      const location: SourceLocation = {
        file,
        line: path.node.loc?.start.line || 0,
        column: path.node.loc?.start.column || 0,
        component: this.findParentComponent(path)
      };

      return {
        query,
        location,
        variables,
        operation,
        rawQuery: queryString
      };
    } catch (error) {
      logger.warn(`Failed to parse GraphQL query in ${file}:`, error);
      return null;
    }
  }

  private detectOperationType(query: DocumentNode): 'query' | 'mutation' | 'subscription' {
    const definition = query.definitions[0];
    if (definition.kind === 'OperationDefinition') {
      return definition.operation;
    }
    return 'query';
  }

  private extractVariables(query: DocumentNode): Record<string, GraphQLType> {
    const variables: Record<string, GraphQLType> = {};
    
    const definition = query.definitions[0];
    if (definition.kind === 'OperationDefinition' && definition.variableDefinitions) {
      definition.variableDefinitions.forEach(varDef => {
        const name = varDef.variable.name.value;
        const type = this.parseGraphQLType(varDef.type);
        variables[name] = type;
      });
    }

    return variables;
  }

  private parseGraphQLType(typeNode: any): GraphQLType {
    let type = '';
    let required = false;
    let list = false;

    // Handle NonNullType
    if (typeNode.kind === 'NonNullType') {
      required = true;
      typeNode = typeNode.type;
    }

    // Handle ListType
    if (typeNode.kind === 'ListType') {
      list = true;
      typeNode = typeNode.type;
    }

    // Handle NamedType
    if (typeNode.kind === 'NamedType') {
      type = typeNode.name.value;
    }

    return { type, required, list };
  }

  private findParentComponent(path: NodePath): string | undefined {
    let parent = path.parentPath;
    
    while (parent) {
      // React function component
      if (t.isFunctionDeclaration(parent.node)) {
        const id = parent.node.id;
        if (id && t.isIdentifier(id)) {
          return id.name;
        }
      }
      
      // Arrow function assigned to variable
      if (t.isArrowFunctionExpression(parent.node) && parent.parentPath) {
        const variableDeclarator = parent.parentPath.node;
        if (t.isVariableDeclarator(variableDeclarator) && t.isIdentifier(variableDeclarator.id)) {
          return variableDeclarator.id.name;
        }
      }
      
      // React class component
      if (t.isClassDeclaration(parent.node)) {
        const id = parent.node.id;
        if (id && t.isIdentifier(id)) {
          return id.name;
        }
      }

      parent = parent.parentPath;
    }

    return undefined;
  }
}