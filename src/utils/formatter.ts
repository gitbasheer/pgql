import * as prettier from 'prettier';
import { logger } from './logger';

/**
 * Format GraphQL query using prettier
 */
export async function formatGraphQL(query: string): Promise<string> {
  try {
    const formatted = await prettier.format(query, {
      parser: 'graphql',
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      singleQuote: false,
      bracketSpacing: true,
    });
    
    return formatted;
  } catch (error) {
    logger.warn('Failed to format GraphQL query with prettier:', error);
    // Return original query if formatting fails
    return query;
  }
}

/**
 * Format multiple GraphQL queries
 */
export async function formatGraphQLQueries(queries: string[]): Promise<string[]> {
  return Promise.all(queries.map(query => formatGraphQL(query)));
}