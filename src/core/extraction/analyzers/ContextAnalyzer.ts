import { ExtractedQuery, QueryContext } from '../types/index.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';

export class ContextAnalyzer {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async analyze(queries: ExtractedQuery[]): Promise<ExtractedQuery[]> {
    // Context is already extracted by ASTStrategy
    // This analyzer can enhance it further if needed

    return queries.map((query) => {
      if (!query.context) {
        query.context = this.createDefaultContext(query);
      } else {
        query.context = this.enhanceContext(query.context, query);
      }
      return query;
    });
  }

  private createDefaultContext(query: ExtractedQuery): QueryContext {
    const fileName =
      query.filePath
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') || 'unknown';

    return {
      functionName: undefined,
      componentName: undefined,
      exportName: fileName,
      isExported: false,
      isDefaultExport: false,
    };
  }

  private enhanceContext(context: QueryContext, query: ExtractedQuery): QueryContext {
    // Add any additional context enhancements here

    // Example: Infer component name from file path if not present
    if (!context.componentName && query.filePath.includes('components/')) {
      const pathParts = query.filePath.split('/');
      const componentIndex = pathParts.indexOf('components');
      if (componentIndex >= 0 && componentIndex < pathParts.length - 1) {
        context.componentName = pathParts[componentIndex + 1];
      }
    }

    return context;
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
