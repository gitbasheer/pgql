import { ExtractedQuery, QueryContext } from '../types/index';
import { ExtractionContext } from '../engine/ExtractionContext';
import { logger } from '../../../utils/logger';

export class QueryNameAnalyzer {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async analyze(queries: ExtractedQuery[]): Promise<ExtractedQuery[]> {
    return queries.map(query => {
      const enhancedName = this.enhanceQueryName(query);
      
      if (enhancedName !== query.name) {
        logger.debug(`Enhanced query name from '${query.name}' to '${enhancedName}'`);
        query.originalName = query.name;
        query.name = enhancedName;
      }
      
      // Normalize for duplicates
      if (query.name) {
        const normalizedName = this.context.normalizeQueryName(query.name, query.content);
        if (normalizedName !== query.name) {
          logger.debug(`Normalized duplicate query name from '${query.name}' to '${normalizedName}'`);
          if (!query.originalName) {
            query.originalName = query.name;
          }
          query.name = normalizedName;
        }
      }
      
      return query;
    });
  }

  private enhanceQueryName(query: ExtractedQuery): string | undefined {
    // If we already have a good name, keep it
    if (query.name && !query.name.startsWith('$') && query.name !== 'unnamed') {
      return query.name;
    }
    
    // Try to extract from the query content
    const contentName = this.extractNameFromContent(query.content);
    if (contentName) {
      return contentName;
    }
    
    // Try to infer from context
    if (query.context) {
      return this.inferNameFromContext(query.context, query.type);
    }
    
    // Try to infer from file path
    return this.inferNameFromPath(query.filePath, query.type);
  }

  private extractNameFromContent(content: string): string | undefined {
    // Look for operation name in the GraphQL
    const match = content.match(/^[\s\S]*?(query|mutation|subscription|fragment)\s+([A-Za-z_$][\w$]*)/m);
    if (match && match[2]) {
      return match[2];
    }
    return undefined;
  }

  private inferNameFromContext(context: QueryContext, type: string): string | undefined {
    if (context.functionName) {
      return this.formatName(context.functionName, type);
    }
    
    if (context.componentName) {
      return this.formatName(`${context.componentName}${this.capitalize(type)}`, type);
    }
    
    if (context.exportName) {
      return this.formatName(context.exportName, type);
    }
    
    return undefined;
  }

  private inferNameFromPath(filePath: string, type: string): string | undefined {
    const fileName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'unknown';
    
    // Skip generic names
    if (['index', 'queries', 'graphql'].includes(fileName.toLowerCase())) {
      return undefined;
    }
    
    return this.formatName(fileName, type);
  }

  private formatName(baseName: string, type: string): string {
    // Remove common suffixes
    baseName = baseName.replace(/(Query|Mutation|Subscription|Fragment)$/i, '');
    
    // Add type prefix if not present
    const typePrefix = this.capitalize(type);
    if (!baseName.toLowerCase().includes(type.toLowerCase())) {
      return `${typePrefix}${this.capitalize(baseName)}`;
    }
    
    return this.capitalize(baseName);
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  validateOperation(operation: any): boolean {
    // Default implementation
    return true;
  }

  analyzeOperation(operation: any): any {
    // Default implementation
    return { valid: true };
  }
}