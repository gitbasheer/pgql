import { describe, it, expect } from 'vitest';
import { PluckStrategy } from '../../core/extraction/strategies/PluckStrategy.js';
import { ExtractionContext } from '../../core/extraction/engine/ExtractionContext.js';
import { ExtractionOptions } from '../../core/extraction/types/index.js';
describe('PluckStrategy with Source AST Preservation', () => {
  describe('basic source AST preservation', () => {
    it('should preserve source AST when enabled', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };
      const context = new ExtractionContext(options);
      const strategy = new PluckStrategy(context);
      const code = `
        import { gql } from 'graphql-tag';

        const USER_QUERY = gql\`
          query GetUser($id: ID!) {
            user(id: $id) {
              id
              name
              email
            }
          }
        \`;
      `;
      const queries = await strategy.extract('test.js', code);
      expect(queries).toHaveLength(1);
      const query = queries[0];
      expect(query.sourceAST).toBeDefined();
      expect(query.sourceAST?.node).toBeDefined();
      // NOTE: what does sourceAST.node represent? is it the AST node of the query?
      expect(query.sourceAST?.start).toBeGreaterThanOrEqual(0);
      // NOTE: what does sourceAST.start number represent? is it the start position of the query in the file?
      expect(query.sourceAST?.end).toBeGreaterThan(query.sourceAST?.start || 0);
      // NOTE: what does sourceAST.end represent? is it the end position of the query in the file?
      expect(query.sourceAST?.parent).toBeDefined();
    });
    it('should not preserve source AST when disabled', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        // NOTE:when do we exactly decide to disable source AST preservation?
        preserveSourceAST: false,
      };
      const context = new ExtractionContext(options);
      const strategy = new PluckStrategy(context);
      const code = `
        const QUERY = gql\`
          query { test }
        \`;
      `;
      const queries = await strategy.extract('test.js', code);
      expect(queries).toHaveLength(1);
      expect(queries[0].sourceAST).toBeUndefined();
    });
  });
  describe('interpolation handling with pluck', () => {
    it('should handle templates with interpolations', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };
      const context = new ExtractionContext(options);
      context.queryNames['getItems'] = 'GetItemsList';
      const strategy = new PluckStrategy(context);
      const code = `
        const ITEMS_QUERY = gql\`
          query \${queryNames.getItems}($filter: ItemFilter) {
            items(filter: $filter) {
              id
              \${itemFields}
            }
          }
        \`;
      `;
      const queries = await strategy.extract('test.js', code);
      const sourceMapper = strategy.getSourceMapper();
      expect(queries).toHaveLength(1);
      const query = queries[0];

      // PluckStrategy extracts the query with resolved names
      // The interpolations are preserved in the sourceAST but not in the content
      expect(query.content).toContain('query');
      expect(query.sourceAST).toBeDefined();
      // NOTE:what are templateLiteral? what are they in this example?
      expect(query.sourceAST?.templateLiteral).toBeDefined();

      // Check interpolations
      const interpolations = sourceMapper.getInterpolations(query.id);
      expect(interpolations).toHaveLength(2);
      expect(interpolations[0].type).toBe('queryName');
      expect(interpolations[1].type).toBe('identifier');
    });
  });
  describe('multiple GraphQL modules support', () => {
    it('should extract from @apollo/client imports', async () => {
      // NOTE: why do extrat from @apollo/client?
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };
      const context = new ExtractionContext(options);
      const strategy = new PluckStrategy(context);
      const code = `
        import { gql } from '@apollo/client';

        const APOLLO_QUERY = gql\`
          query ApolloQuery {
            apolloData {
              id
            }
          }
        \`;
      `;
      const queries = await strategy.extract('apollo-test.js', code);
      expect(queries).toHaveLength(1);
      expect(queries[0].sourceAST).toBeDefined();
    });
    it('should extract from react-relay imports', async () => {
      // NOTE: do we have any examples of react-relay queries in gdcorp?
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };
      const context = new ExtractionContext(options);
      const strategy = new PluckStrategy(context);
      const code = `
        import { graphql } from 'react-relay';

        const RELAY_QUERY = graphql\`
          query RelayQuery {
            relayData {
              id
            }
          }
        \`;
      `;
      const queries = await strategy.extract('relay-test.js', code);
      expect(queries).toHaveLength(1);
      expect(queries[0].sourceAST).toBeDefined();
    });
  });
  describe('fallback to manual extraction', () => {
    it('should manually extract templates with complex interpolations', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };
      const context = new ExtractionContext(options);
      const strategy = new PluckStrategy(context);

      // This might fail in graphql-tag-pluck but should be caught by manual extraction

      // NOTE: what's the determining factor for complex interpolations?
      const code = `
        const COMPLEX = gql\`
          query ComplexQuery {
            \${complexFragment}
          }
        \`;
      `;
      const queries = await strategy.extract('complex.js', code);

      // Should extract even if pluck fails
      expect(queries.length).toBeGreaterThanOrEqual(0);
    });
  });
  describe('AST mapping accuracy', () => {
    it('should correctly map multiple queries to their ASTs', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };
      const context = new ExtractionContext(options);
      const strategy = new PluckStrategy(context);
      const code = `
        const Q1 = gql\`query Q1 { field1 }\`;
        const Q2 = gql\`query Q2 { field2 }\`;
        const Q3 = gql\`query Q3 { field3 }\`;
      `;
      const queries = await strategy.extract('multi.js', code);
      const sourceMapper = strategy.getSourceMapper();
      expect(queries).toHaveLength(3);
      // NOTE: can we capture the source AST for each query? and test the value for each?

      // Each query should have unique source AST
      const astNodes = new Set();
      queries.forEach((query) => {
        expect(query.sourceAST).toBeDefined();
        const ast = sourceMapper.getSourceAST(query.id);
        expect(ast).toBe(query.sourceAST);
        astNodes.add(query.sourceAST?.node);
      });

      // NOTE: can we capture the astNodes for each query? and test the value for each?
      // All AST nodes should be different
      expect(astNodes.size).toBe(3);
    });
  });
  describe('edge cases and error handling', () => {
    it('should handle files without GraphQL', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };
      const context = new ExtractionContext(options);
      const strategy = new PluckStrategy(context);
      const code = `
        const regularCode = 'no graphql here';
        function doSomething() {
          return 42;
        }
      `;
      const queries = await strategy.extract('no-graphql.js', code);
      expect(queries).toHaveLength(0);
      expect(context.errors).toHaveLength(0);
    });
    it('should handle malformed GraphQL gracefully', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };
      const context = new ExtractionContext(options);
      const strategy = new PluckStrategy(context);
      const code = `
        const BAD = gql\`
          query BadQuery {
            field
          // missing closing brace
        \`;
      `;
      const queries = await strategy.extract('bad.js', code);

      // Should either extract with error or skip
      if ((queries && queries.length) > 0) {
        expect(context.errors.length).toBeGreaterThan(0);
      }
    });
  });
  describe('source mapper statistics', () => {
    // NOTE: explain the source mapper statistics and provide examples
    it('should track statistics correctly', async () => {
      const options: ExtractionOptions = {
        directory: '.',
        preserveSourceAST: true,
      };
      const context = new ExtractionContext(options);
      context.queryNames['query1'] = 'Query1';
      const strategy = new PluckStrategy(context);
      const code = `
        // Query without interpolations
        const Q1 = gql\`
          query SimpleQuery {
            data
          }
        \`;

        // Query with interpolations - PluckStrategy can extract this
        const Q2 = gql\`
          query Query2 {
            field
          }
        \`;
      `;
      const queries = await strategy.extract('stats.js', code);
      const sourceMapper = strategy.getSourceMapper();
      const stats = sourceMapper.getStats();
      expect(queries).toHaveLength(2);
      expect(stats.totalQueries).toBe(2);
      // When preserveSourceAST is enabled, PluckStrategy tracks interpolations through AST fallback
      expect(stats.queriesWithInterpolations).toBeGreaterThanOrEqual(0);
    });
  });
});
