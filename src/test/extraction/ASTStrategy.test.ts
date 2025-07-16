import { describe, it, expect, beforeEach } from 'vitest';
import { ASTStrategy } from '../../core/extraction/strategies/ASTStrategy.js';
import { ExtractionContext } from '../../core/extraction/engine/ExtractionContext.js';
import { ExtractionOptions } from '../../core/extraction/types/index.js';

describe('ASTStrategy with Source AST Preservation', () => {
  describe('basic source AST preservation', () => {
    it('should preserve source AST when enabled', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };

      const context = new ExtractionContext(options);
      const strategy = new ASTStrategy(context);

      const code = `
        import { gql } from '@apollo/client';

        const GET_USER = gql\`
          query GetUser($id: ID!) {
            user(id: $id) {
              id
              name
            }
          }
        \`;
      `;

      const queries = await strategy.extract('test.js', code);

      expect(queries).toHaveLength(1);
      const query = queries[0];

      // NOTE: shoul preserve if query uses a variable and what is the variable?
      expect(query.sourceAST).toBeDefined();
      expect(query.sourceAST?.node.type).toBe('TaggedTemplateExpression');
      expect(query.sourceAST?.start).toBeGreaterThanOrEqual(0);
      expect(query.sourceAST?.end).toBeGreaterThan(query.sourceAST?.start || 0);
      expect(query.sourceAST?.parent).toBeDefined();
      expect(query.sourceAST?.templateLiteral).toBeDefined();
      expect(query.sourceAST?.templateLiteral?.quasis.length).toBeGreaterThan(0);
    });

    it('should not preserve source AST when disabled', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: false,
      };

      const context = new ExtractionContext(options);
      const strategy = new ASTStrategy(context);

      const code = `
        const QUERY = gql\`query { test }\`;
      `;

      const queries = await strategy.extract('test.js', code);

      expect(queries).toHaveLength(1);
      expect(queries[0].sourceAST).toBeUndefined();
    });
  });

  describe('template literal interpolation handling', () => {
    it('should preserve template literal structure with interpolations', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };

      const context = new ExtractionContext(options);
      context.queryNames['getUserDetails'] = 'GetUserWithDetails';
      const strategy = new ASTStrategy(context);

      // NOTE: we should define additionalFields and resolve it in the query
      const additionalFields = 'email, phone';
      const code = `
        const QUERY = gql\`
          query \${queryNames.getUserDetails}($id: ID!) {
            user(id: $id) {
              id
              name
              ${additionalFields}
            }
          }
        \`;
      `;

      const queries = await strategy.extract('test.js', code);
      const sourceMapper = strategy.getSourceMapper();

      expect(queries).toHaveLength(1);
      const query = queries[0];

      expect(query.sourceAST).toBeDefined();
      expect(query.sourceAST?.templateLiteral).toBeDefined();
      expect(query.sourceAST?.templateLiteral?.expressions).toHaveLength(2);
      expect(query.metadata?.hasInterpolations).toBe(true);

      // Check interpolation tracking
      const interpolations = sourceMapper.getInterpolations(query.id);
      expect(interpolations).toHaveLength(2);
      expect(interpolations[0].type).toBe('queryName');
      // NOTE:lets add a test to check if we're preserving the fragment variable name/resolution value?
    });
  });

  describe('function call syntax', () => {
    it('should preserve source AST for graphql() function calls', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };

      const context = new ExtractionContext(options);
      const strategy = new ASTStrategy(context);

      const code = `
        const QUERY = graphql(\`
          query GetItem($id: ID!) {
            item(id: $id) {
              id
              title
            }
          }
        \`);
      `;

      const queries = await strategy.extract('test.js', code);

      expect(queries).toHaveLength(1);
      const query = queries[0];

      expect(query.sourceAST).toBeDefined();
      expect(query.sourceAST?.node.type).toBe('CallExpression');
      expect(query.sourceAST?.templateLiteral).toBeDefined();
    });
  });

  describe('multiple queries in file', () => {
    it('should preserve source AST for all queries', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };

      const context = new ExtractionContext(options);
      const strategy = new ASTStrategy(context);

      const code = `
        const QUERY1 = gql\`query Query1 { test1 }\`;
        const QUERY2 = gql\`query Query2 { test2 }\`;
        const QUERY3 = graphql(\`query Query3 { test3 }\`);
      `;

      const queries = await strategy.extract('test.js', code);
      const sourceMapper = strategy.getSourceMapper();

      expect(queries).toHaveLength(3);

      queries.forEach((query, index) => {
        expect(query.sourceAST).toBeDefined();
        expect(sourceMapper.getSourceAST(query.id)).toBeDefined();
        expect(sourceMapper.getSourceAST(query.id)).toBe(query.sourceAST);
      });

      const stats = sourceMapper.getStats();
      expect(stats.totalQueries).toBe(3);

      // None of these queries have interpolations - they're all static
      expect(stats.queriesWithInterpolations).toBe(0);
    });
  });

  describe('complex interpolations', () => {
    it('should handle various interpolation types', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };

      const context = new ExtractionContext(options);
      context.queryNames['dynamicName'] = 'DynamicQuery';
      const strategy = new ASTStrategy(context);

      const code = `
        const COMPLEX_QUERY = gql\`
          query \${queryNames.dynamicName}($id: ID!, $detailed: Boolean!) {
            user(id: $id) {
              id
              \${getUserFields()}
              profile {
                \${detailed ? 'fullBio' : 'shortBio'}
                avatar
              }
            }
          }
        \`;
      `;

      const queries = await strategy.extract('test.js', code);
      const sourceMapper = strategy.getSourceMapper();

      expect(queries).toHaveLength(1);
      const query = queries[0];

      const interpolations = sourceMapper.getInterpolations(query.id);
      expect(interpolations).toHaveLength(3);

      // NOTE:what does interpolations exactly mean? do we have any code that classifies what interpolations are and assigns them proper field names?
      // Verify interpolation types
      const types = interpolations.map((i) => i.type);
      expect(types).toContain('queryName'); // queryNames.dynamicName
      expect(types).toContain('functionCall'); // getUserFields()
      expect(types).toContain('conditional'); // ternary expression
    });
  });

  describe('context preservation', () => {
    it('should preserve parent node context', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
        analyzeContext: true,
      };

      const context = new ExtractionContext(options);
      const strategy = new ASTStrategy(context);

      const code = `
        export function useUserQuery() {
          const query = gql\`
            query GetUser($id: ID!) {
              user(id: $id) {
                id
                name
              }
            }
          \`;
          return query;
        }
      `;

      const queries = await strategy.extract('test.js', code);

      expect(queries).toHaveLength(1);
      const query = queries[0];

      expect(query.sourceAST).toBeDefined();
      expect(query.sourceAST?.parent).toBeDefined();
      expect(query.context?.functionName).toBe('useUserQuery');
      expect(query.context?.isExported).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty template literals', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };

      const context = new ExtractionContext(options);
      const strategy = new ASTStrategy(context);

      const code = `const EMPTY = gql\`\`;`;

      const queries = await strategy.extract('test.js', code);

      expect(queries).toHaveLength(0); // Empty GraphQL should be invalid
    });

    it('should handle parsing errors gracefully', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };

      const context = new ExtractionContext(options);
      const strategy = new ASTStrategy(context);

      const code = `const INVALID = gql\`query { test\`;`; // Missing closing brace

      const queries = await strategy.extract('test.js', code);

      expect(queries).toHaveLength(0);
      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].message).toContain('Invalid GraphQL');
    });
  });
});
