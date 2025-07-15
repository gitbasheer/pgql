import { ResolvedQuery } from '../types/index.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';

export class NameResolver {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async resolve(queries: ResolvedQuery[]): Promise<ResolvedQuery[]> {
    // Name resolution is already handled by QueryNameAnalyzer
    // This resolver can do final adjustments if needed
    
    return queries.map(query => {
      // Ensure every query has a name
      if (!query.name) {
        query.name = this.generateFallbackName(query);
      }
      
      return query;
    });
  }

  private generateFallbackName(query: ResolvedQuery): string {
    const baseName = query.filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'unknown';
    const type = query.type.charAt(0).toUpperCase() + query.type.slice(1);
    const index = query.id.split('-').pop() || '0';
    
    return `${type}${this.capitalize(baseName)}${index}`;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}