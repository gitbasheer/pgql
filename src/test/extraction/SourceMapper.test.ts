import { describe, it, expect, beforeEach } from 'vitest';
import * as babel from '@babel/parser';
import * as babelTypes from '@babel/types';
import { SourceMapper } from '../../core/extraction/utils/SourceMapper';
import { SourceAST } from '../../core/extraction/types/query.types';

describe('SourceMapper', () => {
  let sourceMapper: SourceMapper;

  beforeEach(async () => {
    vi.resetModules();
    sourceMapper = new SourceMapper();
    sourceMapper.clear();
  });

  describe('register and retrieval', () => {
    it('should register and retrieve source AST by query ID', () => {
      const code = 'const x = 42;';
      const ast = babel.parse(code);
      const node = ast.program.body[0];
      
      const sourceAST: SourceAST = {
        node,
        start: 0,
        end: 13,
        parent: ast.program
      };

      sourceMapper.register('query-1', sourceAST);
      
      const retrieved = sourceMapper.getSourceAST('query-1');
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(sourceAST);
    });

    it('should retrieve query ID by AST node', () => {
      const code = 'const x = 42;';
      const ast = babel.parse(code);
      const node = ast.program.body[0];
      
      const sourceAST: SourceAST = {
        node,
        start: 0,
        end: 13,
        parent: ast.program
      };

      sourceMapper.register('query-1', sourceAST);
      
      const retrievedId = sourceMapper.getQueryId(node);
      expect(retrievedId).toBe('query-1');
    });

    it('should return undefined for non-existent query ID', () => {
      const result = sourceMapper.getSourceAST('non-existent');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-registered AST node', () => {
      const code = 'const x = 42;';
      const ast = babel.parse(code);
      const node = ast.program.body[0];
      
      const result = sourceMapper.getQueryId(node);
      expect(result).toBeUndefined();
    });
  });

  describe('GraphQL tag detection', () => {
    it('should detect simple GraphQL tags', () => {
      const code = 'gql`query { test }`';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const taggedTemplate = statement.expression;
      if (taggedTemplate.type !== 'TaggedTemplateExpression') throw new Error('Expected TaggedTemplateExpression');
      
      expect(SourceMapper.isGraphQLTag(taggedTemplate.tag)).toBe(true);
    });

    it('should detect all GraphQL tag variations', () => {
      const variations = ['gql', 'graphql', 'GraphQL'];
      
      variations.forEach(tag => {
        const code = `${tag}\`query { test }\``;
        const ast = babel.parse(code);
        const statement = ast.program.body[0];
        if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
        const taggedTemplate = statement.expression;
        if (taggedTemplate.type !== 'TaggedTemplateExpression') throw new Error('Expected TaggedTemplateExpression');
        
        expect(SourceMapper.isGraphQLTag(taggedTemplate.tag)).toBe(true);
      });
    });

    it('should detect member expression GraphQL tags', () => {
      const code = 'apollo.gql`query { test }`';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const taggedTemplate = statement.expression;
      if (taggedTemplate.type !== 'TaggedTemplateExpression') throw new Error('Expected TaggedTemplateExpression');
      
      expect(SourceMapper.isGraphQLTag(taggedTemplate.tag)).toBe(true);
    });

    it('should not detect non-GraphQL tags', () => {
      const code = 'css`color: red;`';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const taggedTemplate = statement.expression;
      if (taggedTemplate.type !== 'TaggedTemplateExpression') throw new Error('Expected TaggedTemplateExpression');
      
      expect(SourceMapper.isGraphQLTag(taggedTemplate.tag)).toBe(false);
    });
  });

  describe('GraphQL call detection', () => {
    it('should detect GraphQL function calls', () => {
      const code = 'graphql(`query { test }`)';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const callExpression = statement.expression;
      
      expect(SourceMapper.isGraphQLCall(callExpression)).toBe(true);
    });

    it('should not detect non-GraphQL function calls', () => {
      const code = 'fetch(`/api/data`)';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const callExpression = statement.expression;
      
      expect(SourceMapper.isGraphQLCall(callExpression)).toBe(false);
    });

    it('should not detect GraphQL calls without template literal', () => {
      const code = 'graphql("query { test }")';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const callExpression = statement.expression;
      
      expect(SourceMapper.isGraphQLCall(callExpression)).toBe(false);
    });
  });

  describe('template literal extraction', () => {
    it('should extract template literal from tagged template', () => {
      const code = 'gql`query { test }`';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const taggedTemplate = statement.expression;
      
      const result = SourceMapper.extractTemplateLiteral(taggedTemplate);
      expect(result).toBeDefined();
      expect(result?.quasis).toHaveLength(1);
      expect(result?.expressions).toHaveLength(0);
    });

    it('should extract template literal with interpolations', () => {
      const code = 'gql`query ${name} { test }`';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const taggedTemplate = statement.expression;
      
      const result = SourceMapper.extractTemplateLiteral(taggedTemplate);
      expect(result).toBeDefined();
      expect(result?.quasis).toHaveLength(2);
      expect(result?.expressions).toHaveLength(1);
    });

    it('should extract template literal from function call', () => {
      const code = 'graphql(`query { test }`)';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const callExpression = statement.expression;
      
      const result = SourceMapper.extractTemplateLiteral(callExpression);
      expect(result).toBeDefined();
      expect(result?.quasis).toHaveLength(1);
      expect(result?.expressions).toHaveLength(0);
    });

    it('should return null for non-template expressions', () => {
      const code = 'const x = 42';
      const ast = babel.parse(code);
      const node = ast.program.body[0];
      
      const result = SourceMapper.extractTemplateLiteral(node);
      expect(result).toBeNull();
    });
  });

  describe('interpolation tracking', () => {
    it('should track interpolations in registered queries', () => {
      const code = 'gql`query ${queryNames.test} { ${fragment} }`';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const taggedTemplate = statement.expression;
      
      const sourceAST: SourceAST = {
        node: taggedTemplate,
        start: 0,
        end: 45,
        parent: ast.program,
        templateLiteral: {
          quasis: (taggedTemplate as any).quasi.quasis,
          expressions: (taggedTemplate as any).quasi.expressions
        }
      };

      sourceMapper.register('query-1', sourceAST);
      
      const interpolations = sourceMapper.getInterpolations('query-1');
      expect(interpolations).toHaveLength(2);
    });

    it('should classify interpolation types correctly', () => {
      const code = `gql\`
        query \${queryNames.myQuery} {
          user(id: \${userId}) {
            \${userFields()}
            name: \${isDetailed ? 'fullName' : 'shortName'}
            \${otherField}
          }
        }
      \``;
      
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const taggedTemplate = statement.expression;
      
      const sourceAST: SourceAST = {
        node: taggedTemplate,
        start: 0,
        end: 200,
        parent: ast.program,
        templateLiteral: {
          quasis: (taggedTemplate as any).quasi.quasis,
          expressions: (taggedTemplate as any).quasi.expressions
        }
      };

      sourceMapper.register('query-1', sourceAST);
      
      const interpolations = sourceMapper.getInterpolations('query-1');
      expect(interpolations).toHaveLength(5);
      
      // Check specific interpolation types
      expect(interpolations[0].type).toBe('queryName'); // queryNames.myQuery
      expect(interpolations[1].type).toBe('identifier'); // userId
      expect(interpolations[2].type).toBe('functionCall'); // userFields()
      expect(interpolations[3].type).toBe('conditional'); // ternary expression
      expect(interpolations[4].type).toBe('identifier'); // otherField
    });

    it('should provide interpolation context', () => {
      const code = 'gql`query ${name} { test }`';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const taggedTemplate = statement.expression;
      
      const sourceAST: SourceAST = {
        node: taggedTemplate,
        start: 0,
        end: 27,
        parent: ast.program,
        templateLiteral: {
          quasis: (taggedTemplate as any).quasi.quasis,
          expressions: (taggedTemplate as any).quasi.expressions
        }
      };

      sourceMapper.register('query-1', sourceAST);
      
      const interpolations = sourceMapper.getInterpolations('query-1');
      expect(interpolations[0].beforeText).toBe('query ');
      expect(interpolations[0].afterText).toBe(' { test }');
    });

    it('should return empty array for queries without interpolations', () => {
      const code = 'gql`query { test }`';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const taggedTemplate = statement.expression;
      if (taggedTemplate.type !== 'TaggedTemplateExpression') throw new Error('Expected TaggedTemplateExpression');
      
      const sourceAST: SourceAST = {
        node: taggedTemplate,
        start: 0,
        end: 19,
        parent: ast.program,
        // Use the actual template literal from the AST which has no expressions
        templateLiteral: {
          quasis: taggedTemplate.quasi.quasis,
          expressions: taggedTemplate.quasi.expressions as babelTypes.Expression[]
        }
      };

      // Use a unique query ID to avoid conflicts with other tests
      sourceMapper.register('query-no-interpolations', sourceAST);
      
      const interpolations = sourceMapper.getInterpolations('query-no-interpolations');
      expect(interpolations).toHaveLength(0);
    });
  });

  describe('statistics', () => {
    it('should provide accurate statistics', () => {
      // Register a query without interpolations
      const code1 = 'gql`query { test }`';
      const ast1 = babel.parse(code1);
      const statement1 = ast1.program.body[0];
      if (statement1.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const node1 = statement1.expression;
      
      sourceMapper.register('query-1', {
        node: node1,
        start: 0,
        end: 19,
        parent: ast1.program
      });

      // Register a query with interpolations
      const code2 = 'gql`query ${queryNames.test} { ${field} }`';
      const ast2 = babel.parse(code2);
      const statement2 = ast2.program.body[0];
      if (statement2.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const node2 = statement2.expression;
      if (node2.type !== 'TaggedTemplateExpression') throw new Error('Expected TaggedTemplateExpression');
      
      sourceMapper.register('query-2', {
        node: node2,
        start: 0,
        end: 42,
        parent: ast2.program,
        templateLiteral: {
          quasis: node2.quasi.quasis,
          expressions: node2.quasi.expressions as babelTypes.Expression[]
        }
      });

      const stats = sourceMapper.getStats();
      expect(stats.totalQueries).toBe(2);
      expect(stats.queriesWithInterpolations).toBe(1);
      expect(stats.interpolationTypes.queryName).toBe(1); // queryNames.test
      expect(stats.interpolationTypes.identifier).toBe(1); // field
    });

    it('should start with zero statistics', () => {
      const freshMapper = new SourceMapper();
      const stats = freshMapper.getStats();
      expect(stats.totalQueries).toBe(0);
      expect(stats.queriesWithInterpolations).toBe(0);
      expect(stats.interpolationTypes).toEqual({
        queryName: 0,
        memberAccess: 0,
        identifier: 0,
        functionCall: 0,
        conditional: 0,
        other: 0
      });
    });
  });

  describe('clear functionality', () => {
    it('should clear all mappings', () => {
      const code = 'gql`query { test }`';
      const ast = babel.parse(code);
      const statement = ast.program.body[0];
      if (statement.type !== 'ExpressionStatement') throw new Error('Expected ExpressionStatement');
      const node = statement.expression;
      
      const sourceAST: SourceAST = {
        node,
        start: 0,
        end: 19,
        parent: ast.program
      };

      sourceMapper.register('query-1', sourceAST);
      expect(sourceMapper.getSourceAST('query-1')).toBeDefined();
      
      sourceMapper.clear();
      
      expect(sourceMapper.getSourceAST('query-1')).toBeUndefined();
      expect(sourceMapper.getQueryId(node)).toBeUndefined();
      
      const stats = sourceMapper.getStats();
      expect(stats.totalQueries).toBe(0);
    });
  });
}); 