import { parse, DocumentNode } from 'graphql';
import { logger } from './logger.js';

export interface ValidationResult {
  isValid: boolean;
  ast?: DocumentNode;
  error?: Error;
}

/**
 * Safely validates and parses GraphQL content without throwing errors
 */
export function safeParseGraphQL(content: string): ValidationResult {
  // Skip empty or whitespace-only content
  if (!content || content.trim().length === 0) {
    return { isValid: false, error: new Error('Empty content') };
  }
  
  // Skip content with unresolved template interpolations
  if (content.includes('${')) {
    return { isValid: false, error: new Error('Contains unresolved template interpolations') };
  }
  
  // Basic GraphQL content validation
  if (!looksLikeGraphQL(content)) {
    return { isValid: false, error: new Error('Does not appear to be GraphQL') };
  }
  
  try {
    const ast = parse(content);
    return { isValid: true, ast };
  } catch (error) {
    return { isValid: false, error: error as Error };
  }
}

/**
 * Quick heuristic to check if content looks like GraphQL
 */
function looksLikeGraphQL(content: string): boolean {
  const trimmed = content.trim();
  
  // Must start with a GraphQL keyword
  const graphqlKeywords = ['query', 'mutation', 'subscription', 'fragment'];
  const startsWithKeyword = graphqlKeywords.some(keyword => 
    trimmed.startsWith(keyword + ' ') || 
    trimmed.startsWith(keyword + '{') ||
    trimmed.startsWith(keyword + '(')
  );
  
  if (!startsWithKeyword) {
    return false;
  }
  
  // Should contain basic GraphQL structure
  const hasBasicStructure = trimmed.includes('{') && trimmed.includes('}');
  
  return hasBasicStructure;
}

/**
 * Extracts operation type without parsing
 */
export function detectOperationType(content: string): 'query' | 'mutation' | 'subscription' | 'fragment' | null {
  const trimmed = content.trim();
  
  if (trimmed.startsWith('query')) return 'query';
  if (trimmed.startsWith('mutation')) return 'mutation';
  if (trimmed.startsWith('subscription')) return 'subscription';
  if (trimmed.startsWith('fragment')) return 'fragment';
  
  return null;
}

/**
 * Checks if content has unresolved template interpolations
 */
export function hasUnresolvedInterpolations(content: string): boolean {
  return content.includes('${');
}

/**
 * Logs parsing errors in a controlled way
 */
export function logParsingError(content: string, error: Error, context: string = '') {
  const preview = content.substring(0, 100).replace(/\n/g, ' ');
  logger.debug(`GraphQL parsing failed${context ? ` in ${context}` : ''}: ${error.message}`, {
    preview,
    hasInterpolations: hasUnresolvedInterpolations(content)
  });
}