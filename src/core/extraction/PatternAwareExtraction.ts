// @ts-nocheck
import { ExtractionOptions, ExtractionResult } from './types/index';
import { PatternExtractedQuery, MigrationResult } from './types/pattern.types';
import { ExtractionContext } from './engine/ExtractionContext';
import { createDefaultQueryServices, QueryServices, QueryServicesConfig } from './services/QueryServicesFactory';
import { ExtractionPipeline } from './engine/ExtractionPipeline';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import { glob } from 'glob';

/**
 * Unified interface for pattern-aware GraphQL extraction and migration
 * This replaces the old scattered extraction logic with a centralized approach
 */
export class PatternAwareExtraction {
  private context: ExtractionContext;
  private services: QueryServices;
  private pipeline: ExtractionPipeline;
  private options: ExtractionOptions;

  constructor(options: ExtractionOptions, servicesConfig?: Partial<QueryServicesConfig>) {
    this.options = options;
    // Services will be initialized async in extract()
  }

  private async ensureInitialized(): Promise<void> {
    if (this.services) return;

    logger.debug('Initializing PatternAwareExtraction with factory...');

    // Use factory to create services - eliminates tight coupling
    this.services = await createDefaultQueryServices(this.options);

    // Initialize context with services
    this.context = new ExtractionContext(this.options, this.services.namingService);
    this.pipeline = new ExtractionPipeline(this.context);

    logger.debug('PatternAwareExtraction initialized successfully');
  }

    /**
   * Extract queries with pattern awareness and migration analysis
   */
  async extract(): Promise<{
    extraction: ExtractionResult;
    migration: {
      results: MigrationResult[];
      summary: any;
      queryNamesUpdates: any;
    };
    cacheStats?: any;
  }> {
    await this.ensureInitialized();
    logger.info('Starting pattern-aware extraction and migration analysis');

    try {
      // Find all files to process
      const files = await this.findFiles();
      logger.info(`Found ${files.length} files to process`);

      // Extract queries with pattern awareness
      const allQueries: PatternExtractedQuery[] = [];

      for (const file of files) {
        logger.debug(`Processing file: ${file}`);
        const content = await fs.promises.readFile(file, 'utf-8');
        const queries = await this.services.strategy.extract(file, content);
        allQueries.push(...queries);
      }

      logger.info(`Extracted ${allQueries.length} queries with pattern analysis`);

      // Process through pipeline
      const extractionResult = await this.pipeline.process(allQueries);

      // Generate migration analysis
      const migrationResults = await this.services.migrator.migrateQueries(allQueries);
      const migrationSummary = this.services.migrator.generateMigrationSummary(migrationResults);
      const queryNamesUpdates = this.services.migrator.generateQueryNamesUpdates(migrationResults);

      // Log insights and cache stats
      this.logInsights(allQueries, migrationSummary);
      const cacheStats = this.services.cacheManager.getStats();
      logger.debug('Cache performance:', cacheStats);

      return {
        extraction: extractionResult,
        migration: {
          results: migrationResults,
          summary: migrationSummary,
          queryNamesUpdates
        },
        cacheStats
      };

    } catch (error) {
      logger.error(`Pattern-aware extraction failed: ${error}`);
      throw error;
    }
  }

    /**
   * Get duplicate analysis using content fingerprinting
   */
  async analyzeDuplicates(): Promise<Map<string, PatternExtractedQuery[]>> {
    await this.ensureInitialized();

    const files = await this.findFiles();
    const allQueries: PatternExtractedQuery[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const queries = await this.services.strategy.extract(file, content);
      allQueries.push(...queries);
    }

    return this.services.namingService.groupDuplicates(allQueries);
  }

  /**
   * Get migration recommendations for specific queries
   */
  async getMigrationRecommendations(queries: PatternExtractedQuery[]) {
    await this.ensureInitialized();
    return this.services.namingService.getMigrationRecommendations(queries);
  }

  /**
   * Get pattern registry information
   */
  async getPatternRegistry() {
    await this.ensureInitialized();
    return this.services.patternService.getRegisteredPatterns();
  }

  /**
   * Get migration manifest
   */
  async getMigrationManifest() {
    await this.ensureInitialized();
    return this.services.patternService.getMigrationManifest();
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    await this.ensureInitialized();
    return this.services.cacheManager.getStats();
  }

  /**
   * Clear pattern analysis cache
   */
  async clearCache() {
    await this.ensureInitialized();
    this.services.cacheManager.clear();
  }

  private async findFiles(): Promise<string[]> {
    const patterns = this.context.options.patterns || ['**/*.{ts,tsx,js,jsx}'];
    const ignore = this.context.options.ignore || ['**/node_modules/**'];

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: this.context.options.directory,
        ignore,
        absolute: true
      });
      allFiles.push(...files);
    }

    return [...new Set(allFiles)]; // Remove duplicates
  }

  private logInsights(queries: PatternExtractedQuery[], migrationSummary: any): void {
    const patternQueries = queries.filter(q => q.namePattern);
    const staticQueries = queries.filter(q => !q.namePattern);

    logger.info('\n📊 Pattern-Aware Extraction Insights');
    logger.info('═'.repeat(50));
    logger.info(`Total queries: ${queries.length}`);
    logger.info(`Dynamic pattern queries: ${patternQueries.length}`);
    logger.info(`Static queries: ${staticQueries.length}`);

    if (patternQueries.length > 0) {
      const deprecatedPatterns = patternQueries.filter(q => q.namePattern?.isDeprecated).length;
      logger.info(`Deprecated patterns: ${deprecatedPatterns}`);

      logger.info('\n🔄 Migration Summary:');
      logger.info(`Queries needing migration: ${migrationSummary.needsMigration}`);
      logger.info(`Manual review required: ${migrationSummary.requiresManualReview}`);
      logger.info(`Pattern-based migrations: ${migrationSummary.patternBasedMigrations}`);
    }

    logger.info('\n✅ Benefits Realized:');
    logger.info('  • Application logic preserved');
    logger.info('  • Pattern metadata tracked');
    logger.info('  • Content-based duplicate detection');
    logger.info('  • Safe migration recommendations');
  }
}

/**
 * Convenience function for simple pattern-aware extraction with factory-based services
 */
export async function extractWithPatterns(options: ExtractionOptions, servicesConfig?: Partial<QueryServicesConfig>) {
  const extraction = new PatternAwareExtraction(options, servicesConfig);
  return extraction.extract();
}

/**
 * Convenience function for migration analysis only
 */
export async function analyzeMigration(options: ExtractionOptions, servicesConfig?: Partial<QueryServicesConfig>) {
  const extraction = new PatternAwareExtraction(options, servicesConfig);
  const result = await extraction.extract();
  return result.migration;
}

/**
 * Convenience function to create services directly
 */
export async function createPatternServices(options: ExtractionOptions, config?: Partial<QueryServicesConfig>) {
  return createDefaultQueryServices(options);
}
