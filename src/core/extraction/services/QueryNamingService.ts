import { logger } from '../../../utils/logger';
import { QueryPatternService } from '../engine/QueryPatternRegistry';
import { PatternExtractedQuery } from '../types/pattern.types';
import { ExtractedQuery } from '../types/query.types';
import { ExtractionOptions } from '../types/extraction.types';

/**
 * Centralized service for handling all query naming concerns
 * Replaces the scattered normalization logic with pattern-based approach
 */
export class QueryNamingService {
  private patternService: QueryPatternService;
  private initialized = false;

  constructor(patternService?: QueryPatternService) {
    this.patternService = patternService || new QueryPatternService();
  }

  /**
   * Initialize the service - replaces the old loadQueryNames logic
   */
  async initialize(options: ExtractionOptions): Promise<void> {
    if (this.initialized) return;

    try {
      // Load pattern registry instead of trying to eval queryNames files
      await this.patternService.loadPatterns(options.directory);
      this.initialized = true;
      logger.info('QueryNamingService initialized with pattern-based approach');
    } catch (error) {
      logger.warn(`Failed to initialize QueryNamingService: ${error}`);
      // Continue with default patterns
      this.initialized = true;
    }
  }

  /**
   * Process a query with pattern awareness - replaces normalizeQueryName
   */
  processQuery(query: ExtractedQuery): PatternExtractedQuery {
    const patternQuery = query as PatternExtractedQuery;

    // Apply pattern analysis instead of normalization
    return this.patternService.analyzeQueryPattern(patternQuery);
  }

  /**
   * Process multiple queries efficiently
   */
  processQueries(queries: ExtractedQuery[]): PatternExtractedQuery[] {
    return queries.map(query => this.processQuery(query));
  }

  /**
   * Group queries by content fingerprint - replaces old duplicate detection
   */
  groupDuplicates(queries: PatternExtractedQuery[]): Map<string, PatternExtractedQuery[]> {
    return this.patternService.groupByFingerprint(queries);
  }

  /**
   * Get migration recommendations - replaces old migration logic
   */
  getMigrationRecommendations(queries: PatternExtractedQuery[]) {
    return queries.map(query => ({
      query,
      recommendations: this.patternService.getMigrationRecommendations(query)
    }));
  }

  /**
   * Check if a query uses dynamic patterns - replaces old pattern detection
   */
  isDynamicPattern(query: PatternExtractedQuery): boolean {
    return !!query.namePattern;
  }

  /**
   * Get pattern service for advanced operations
   */
  getPatternService(): QueryPatternService {
    return this.patternService;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance for backward compatibility
let defaultInstance: QueryNamingService | null = null;

export function getQueryNamingService(): QueryNamingService {
  if (!defaultInstance) {
    defaultInstance = new QueryNamingService();
  }
  return defaultInstance;
}

export function setQueryNamingService(service: QueryNamingService): void {
  defaultInstance = service;
}
