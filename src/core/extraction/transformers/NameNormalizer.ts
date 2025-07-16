import { ResolvedQuery } from '../types/index.js';
import { PatternExtractedQuery } from '../types/pattern.types.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';
import { logger } from '../../../utils/logger.js';

/**
 * @deprecated This transformer is being replaced by pattern-aware processing
 * For queries with dynamic patterns, normalization would break application logic
 */
export class NameNormalizer {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async transform(queries: ResolvedQuery[]): Promise<ResolvedQuery[]> {
    const convention = this.context.options.namingConvention || 'pascalCase';

    if (convention === 'preserve') {
      return queries;
    }

    return queries.map((query) => {
      const patternQuery = query as PatternExtractedQuery;

      // Skip normalization for queries with dynamic patterns
      if (patternQuery.namePattern) {
        logger.debug(
          `Skipping normalization for pattern query: ${patternQuery.namePattern.template}`,
        );
        return query;
      }

      // Only normalize static queries
      if (query.name) {
        const normalizedName = this.normalizeName(query.name, convention);

        if (normalizedName !== query.name) {
          logger.debug(`Normalized static query name from '${query.name}' to '${normalizedName}'`);

          if (!query.originalName) {
            query.originalName = query.name;
          }

          query.name = normalizedName;

          // Also update the content if the name appears there
          query.resolvedContent = this.updateNameInContent(
            query.resolvedContent,
            query.originalName,
            normalizedName,
          );
        }
      }

      return query;
    });
  }

  private normalizeName(name: string, convention: 'pascalCase' | 'camelCase'): string {
    // First, convert various formats to a common base
    const words = name
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase to spaces
      .replace(/[_-]+/g, ' ') // underscores and hyphens to spaces
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) return name;

    // Apply the convention
    if (convention === 'pascalCase') {
      return words.map((word) => this.capitalize(word)).join('');
    } else {
      return (
        words[0].toLowerCase() +
        words
          .slice(1)
          .map((word) => this.capitalize(word))
          .join('')
      );
    }
  }

  private capitalize(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  private updateNameInContent(content: string, oldName: string, newName: string): string {
    // Update operation name in the GraphQL content
    const operationPattern = new RegExp(
      `(query|mutation|subscription)\\s+${this.escapeRegExp(oldName)}\\s*\\(`,
      'g',
    );

    return content.replace(operationPattern, `$1 ${newName}(`);
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
