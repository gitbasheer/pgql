import * as fs from 'fs/promises';
import * as path from 'path';
import glob from 'fast-glob';
import { logger } from '../../../utils/logger';
import {
  ExtractionOptions,
  ExtractionResult,
  ExtractedQuery,
  ResolvedQuery
} from '../types/index';
import { Endpoint } from '../../../types/pgql.types';
import { ExtractionContext } from './ExtractionContext';
import { ExtractionPipeline } from './ExtractionPipeline';
import { PluckStrategy } from '../strategies/PluckStrategy';
import { ASTStrategy } from '../strategies/ASTStrategy';
import { BaseStrategy } from '../strategies/BaseStrategy';
import { astCache } from '../../cache/CacheManager';
import { monitor } from '../../monitoring/PerformanceMonitor';
import { createHash } from 'crypto';

export class UnifiedExtractor {
  // NOTE:what does context present?
  private context: ExtractionContext;
  // pipeline for what? all items its an entry point to?
  private pipeline: ExtractionPipeline;
  // list all strategies available and when does each one get used?
  private strategies: Map<string, BaseStrategy>;

  constructor(options: ExtractionOptions) {
    this.context = new ExtractionContext(options);
    this.pipeline = new ExtractionPipeline(this.context);
    this.strategies = this.initializeStrategies();
  }

  private initializeStrategies(): Map<string, BaseStrategy> {
    const strategies = new Map<string, BaseStrategy>();

    // Always initialize both strategies
    strategies.set('pluck', new PluckStrategy(this.context));
    strategies.set('ast', new ASTStrategy(this.context));

    // NOTE: only 2 potential strategies? how do they get selected? per query per file?
    return strategies;
  }

  @monitor('extraction.full')
  async extract(): Promise<ExtractionResult> {
    const startTime = Date.now();
    logger.info(`Starting unified extraction from ${this.context.options.directory}`);

    try {
      // Phase 1: Discovery
      const files = await this.discoverFiles();
      this.context.stats.totalFiles = files.length;

      // Phase 2: Load auxiliary data
      await this.loadAuxiliaryData();

      // Phase 3: Extract queries
      const rawQueries = await this.extractQueries(files);

      // Phase 4: Process through pipeline
      const result = await this.pipeline.process(rawQueries);

      // Phase 5: Finalize stats
      result.stats = this.context.finalizeStats();

      logger.info(`Extraction completed in ${Date.now() - startTime}ms`);
      logger.info(`Extracted ${result.queries.length} queries with ${result.variants.length} variants`);

      return result;
    } catch (error) {
      logger.error('Extraction failed:', error);
      throw error;
    }
  }

  private async discoverFiles(): Promise<string[]> {
    const { directory, patterns, ignore } = this.context.options;

    logger.info(`Discovering files in ${directory} with patterns: ${patterns?.join(', ')}`);
    logger.debug('Raw patterns value:', patterns);
    logger.debug('Type of patterns:', typeof patterns);

    // Ensure patterns is always an array
    const filePatterns = patterns || ['**/*.{js,jsx,ts,tsx}'];
    logger.debug('Final filePatterns:', filePatterns);

    const files = await glob(filePatterns, {
      cwd: directory,
      absolute: true,
      ignore: ignore || ['**/node_modules/**', '**/__generated__/**', '**/*.test.*']
    });

    logger.info(`Found ${files.length} files to process`);
    return files;
  }

  private async loadAuxiliaryData(): Promise<void> {
    // Initialize query naming service with pattern-based approach
    await this.context.initializeQueryNaming();

    // Pre-load fragments if needed
    if (this.context.options.resolveFragments) {
      await this.preloadFragments();
    }
  }

  /**
   * @deprecated The old loadQueryNames method is replaced by QueryNamingService
   * This method is kept for backward compatibility but does nothing
   */
  private async loadQueryNames(): Promise<void> {
    logger.warn('loadQueryNames is deprecated. QueryNamingService handles this automatically.');
    // No-op - the QueryNamingService handles this now
  }

  private async preloadFragments(): Promise<void> {
    // This will be implemented by the FragmentResolver
    logger.debug('Fragment preloading will be handled by the pipeline');
  }

  private async extractQueries(files: string[]): Promise<ExtractedQuery[]> {
    const allQueries: ExtractedQuery[] = [];
    const { parallel, maxConcurrency } = this.context.options;

    if (parallel) {
      // Process files in batches
      const batchSize = maxConcurrency || 4;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(file => this.extractFromFile(file))
        );
        allQueries.push(...batchResults.flat());
      }
    } else {
      // Process sequentially
      for (const file of files) {
        const queries = await this.extractFromFile(file);
        allQueries.push(...queries);
      }
    }

    this.context.stats.totalQueries = allQueries.length;
    return allQueries;
  }

  @monitor('extraction.file')
  async extractFromFile(filePath: string): Promise<ExtractedQuery[]> {
    try {
      // Check AST cache first (aggressive caching)
      const cachedQueries = await astCache.get<ExtractedQuery[]>('queries', filePath);
      if (cachedQueries) {
        logger.debug(`Cache hit for ${filePath}`);
        return cachedQueries;
      }

      // Check context cache (in-memory)
      const cached = this.context.getCached<ExtractedQuery[]>('file', filePath);
      if (cached) {
        return cached;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const queries: ExtractedQuery[] = [];

      // Determine which strategy to use
      const strategyNames = this.context.options.strategies || ['hybrid'];

      for (const strategyName of strategyNames) {
        if (strategyName === 'hybrid') {
          // Use both strategies and merge results
          const pluckResults = await this.extractWithStrategy('pluck', filePath, content);
          const astResults = await this.extractWithStrategy('ast', filePath, content);

          // Merge results, preferring AST for better context
          queries.push(...this.mergeResults(pluckResults, astResults));
        } else {
          const results = await this.extractWithStrategy(strategyName, filePath, content);
          queries.push(...results);
        }
      }

      // Enhance queries with endpoint classification
      const enhancedQueries = queries.map(query => ({
        ...query,
        endpoint: this.determineEndpoint(filePath, content),
        sourceFile: filePath
      }));

      // Cache results (both in-memory and persistent)
      this.context.setCached('file', filePath, enhancedQueries);
      await astCache.set('queries', filePath, enhancedQueries, 3600000); // 1 hour TTL
      this.context.incrementStat('processedFiles');

      return enhancedQueries;
    } catch (error) {
      this.context.addError(
        filePath,
        `Failed to process file: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  private async extractWithStrategy(
    strategyName: string,
    filePath: string,
    content: string
  ): Promise<ExtractedQuery[]> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      logger.warn(`Strategy ${strategyName} not found`);
      return [];
    }

    if (!strategy.canHandle(filePath)) {
      return [];
    }

    try {
      return await strategy.extract(filePath, content);
    } catch (error) {
      logger.warn(`Strategy ${strategyName} failed for ${filePath}:`, error);
      return [];
    }
  }

  private mergeResults(pluckResults: ExtractedQuery[], astResults: ExtractedQuery[]): ExtractedQuery[] {
    // If AST extraction succeeded and found queries, prefer it
    if (astResults.length > 0) {
      return astResults;
    }

    // Otherwise use pluck results
    return pluckResults;
  }

  private determineEndpoint(filePath: string, content: string): Endpoint {
    // Check file path patterns
    if (filePath.includes('offer-graph')) {
      return 'offerGraph';
    }
    
    // Check content patterns for Offer Graph
    if (content.includes('useOfferGraphMutation') || 
        content.includes('getClientSideOGClient') ||
        content.includes('offerGraphClient') ||
        content.includes('transitions') ||
        content.includes('modifyBasket') ||
        content.includes('FindUnifiedBillDetails')) {
      return 'offerGraph';
    }
    
    // Default to Product Graph
    return 'productGraph';
  }

  async extractFromRepo(): Promise<ExtractedQuery[]> {
    // EVENT_PLACEHOLDER: Publish to Event Bus instead of direct socket
    // e.g., await eventBusClient.publish({ 
    //   source: 'pgql.pipeline', 
    //   detailType: 'progress', 
    //   detail: { stage: 'extraction', message: 'Starting repository extraction' } 
    // });
    
    const result = await this.extract();
    
    // EVENT_PLACEHOLDER: Publish extraction progress
    // e.g., await eventBusClient.publish({ 
    //   source: 'pgql.pipeline', 
    //   detailType: 'progress', 
    //   detail: { stage: 'extraction', message: `Found ${result.queries.length} queries` } 
    // });
    
    return this.standardizeQueries(result.queries);
  }

  private standardizeQueries(queries: ResolvedQuery[]): ExtractedQuery[] {
    return queries.map(q => {
      const standardized: ExtractedQuery = {
        query: q.content,
        fullExpandedQuery: q.resolvedContent || q.content,
        name: this.generateUniqueName(q),
        variables: this.extractVariables(q),
        fragments: q.fragments || [],
        endpoint: (q as any).endpoint || 'productGraph',
        sourceFile: q.filePath || 'unknown.js'
      };
      return standardized;
    });
  }

  private generateUniqueName(query: ResolvedQuery): string {
    // Use operation name if available
    if (query.name) {
      return query.name;
    }
    
    // Generate hash-based name as fallback
    const hash = createHash('sha256')
      .update(query.resolvedContent || query.content)
      .digest('hex')
      .slice(0, 10);
    
    return `Query_${hash}`;
  }

  private extractVariables(query: ResolvedQuery): Record<string, string> {
    const variables: Record<string, string> = {};
    
    // Extract from AST if available
    if (query.ast && query.variables) {
      query.variables.forEach(v => {
        variables[v.name] = v.type;
      });
    }
    
    return variables;
  }
}
