import { ExtractedQuery, QueryContext } from '../types/index.js';
import { PatternExtractedQuery } from '../types/pattern.types.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';
import { logger } from '../../../utils/logger.js';

/**
 * @deprecated Use QueryNamingService directly for pattern-based analysis
 * This analyzer is being refactored to use the new pattern-based approach
 */
export class QueryNameAnalyzer {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async analyze(queries: ExtractedQuery[]): Promise<PatternExtractedQuery[]> {
    const namingService = this.context.getQueryNamingService();

    // Use the centralized naming service for pattern-based processing
    const patternQueries = namingService.processQueries(queries);

    // Still apply name enhancement for queries without patterns
    return patternQueries.map((query) => {
      if (!query.namePattern) {
        const enhancedName = this.enhanceQueryName(query);
        if (enhancedName && enhancedName !== query.name) {
          query.name = enhancedName;
          logger.debug(`Enhanced static query name to '${enhancedName}'`);
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
      const contextName = this.inferNameFromContext(query.context, query.type);
      if (contextName) {
        return contextName;
      }
    }

    // Try to infer from file path
    const pathName = this.inferNameFromPath(query.filePath, query.type);
    if (pathName) {
      return pathName;
    }

    // Return the original name if nothing better found
    return query.name;
  }

  private extractNameFromContent(content: string): string | undefined {
    // Look for operation name in the GraphQL
    const match = content.match(
      /^[\s\S]*?(query|mutation|subscription|fragment)\s+([A-Za-z_$][\w$]*)/m,
    );
    if (match && match[2]) {
      return match[2];
    }
    return undefined;
  }

  private inferNameFromContext(context: QueryContext, type: string): string | undefined {
    if (context.functionName) {
      return this.formatName(context.functionName, type, 'function');
    }

    if (context.componentName) {
      // For components, add type suffix
      return `${this.capitalize(context.componentName)}${this.capitalize(type)}`;
    }

    if (context.exportName) {
      // Keep export names as-is if they're all caps, otherwise format
      if (context.exportName === context.exportName.toUpperCase()) {
        return context.exportName;
      }
      return this.formatName(context.exportName, type, 'export');
    }

    return undefined;
  }

  private inferNameFromPath(filePath: string, type: string): string | undefined {
    const fileName =
      filePath
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') || 'unknown';

    // Skip generic names
    if (['index', 'queries', 'graphql'].includes(fileName.toLowerCase())) {
      return undefined;
    }

    return this.formatName(fileName, type);
  }

  private formatName(baseName: string, type: string, source?: string): string {
    // Store original to check if it had type suffix
    const originalName = baseName;
    const hadTypeSuffix = /(Query|Mutation|Subscription|Fragment)$/i.test(originalName);

    // Remove common suffixes
    baseName = baseName.replace(/(Query|Mutation|Subscription|Fragment)$/i, '');

    // Handle different formatting based on source
    if (source === 'function') {
      // For functions, preserve the type suffix if it was there
      if (hadTypeSuffix) {
        return this.capitalize(originalName);
      }
      // For action names (get, create, etc.), just capitalize
      const isActionName =
        baseName.toLowerCase().startsWith('get') ||
        baseName.toLowerCase().startsWith('create') ||
        baseName.toLowerCase().startsWith('update') ||
        baseName.toLowerCase().startsWith('delete') ||
        baseName.toLowerCase().startsWith('on');

      if (isActionName) {
        return this.capitalize(baseName);
      }

      // For non-action function names, add type prefix
      return `${this.capitalize(type)}${this.capitalize(baseName)}`;
    }

    // For general cases
    const isActionName =
      baseName.toLowerCase().startsWith('get') ||
      baseName.toLowerCase().startsWith('create') ||
      baseName.toLowerCase().startsWith('update') ||
      baseName.toLowerCase().startsWith('delete') ||
      baseName.toLowerCase().startsWith('on');

    // If original had type suffix and it's an action name, preserve it
    if (hadTypeSuffix && isActionName) {
      return this.capitalize(originalName);
    }

    // Check if type is already in the name
    const hasType = baseName.toLowerCase().includes(type.toLowerCase());

    if (!hasType && !isActionName) {
      // For non-action names without type, prepend Query/Mutation/etc
      return `${this.capitalize(type)}${this.capitalize(baseName)}`;
    }

    // Otherwise just capitalize
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
