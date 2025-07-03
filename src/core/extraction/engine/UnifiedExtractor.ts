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
import { ExtractionContext } from './ExtractionContext';
import { ExtractionPipeline } from './ExtractionPipeline';
import { PluckStrategy } from '../strategies/PluckStrategy';
import { ASTStrategy } from '../strategies/ASTStrategy';
import { BaseStrategy } from '../strategies/BaseStrategy';
import { astCache } from '../../cache/CacheManager';
import { monitor } from '../../monitoring/PerformanceMonitor';

export class UnifiedExtractor {
  private context: ExtractionContext;
  private pipeline: ExtractionPipeline;
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
    // Load query names if available
    if (this.context.options.resolveNames) {
      await this.loadQueryNames();
    }
    
    // Pre-load fragments if needed
    if (this.context.options.resolveFragments) {
      await this.preloadFragments();
    }
  }

  private async loadQueryNames(): Promise<void> {
    const possiblePaths = [
      // Check the target directory first
      path.join(this.context.options.directory, 'queryNames.js'),
      // Then check relative paths from project root
      path.resolve('data/sample_data/queryNames.js'),
      path.resolve('src/queryNames.js'),
      path.resolve('graphql/queryNames.js')
    ];

    for (const queryNamesPath of possiblePaths) {
      try {
        const content = await fs.readFile(queryNamesPath, 'utf-8');
        // Use AST strategy to parse the queryNames
        const astStrategy = this.strategies.get('ast') as ASTStrategy;
        
        // Simple extraction of queryNames object
        const match = content.match(/export\s+const\s+queryNames\s*=\s*({[\s\S]*?});/);
        if (match) {
          try {
            // Safely evaluate the object
            const queryNamesObj = eval(`(${match[1]})`);
            Object.assign(this.context.queryNames, queryNamesObj);
            logger.info(`Loaded ${Object.keys(queryNamesObj).length} query names from ${queryNamesPath}`);
            break;
          } catch (e) {
            logger.warn(`Failed to parse queryNames from ${queryNamesPath}`);
          }
        }
      } catch (error) {
        // File doesn't exist, continue
      }
    }
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
  private async extractFromFile(filePath: string): Promise<ExtractedQuery[]> {
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
      
      // Cache results (both in-memory and persistent)
      this.context.setCached('file', filePath, queries);
      await astCache.set('queries', filePath, queries, 3600000); // 1 hour TTL
      this.context.incrementStat('processedFiles');
      
      return queries;
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
}