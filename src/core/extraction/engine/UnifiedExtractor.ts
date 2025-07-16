import * as fs from 'fs/promises';
import * as path from 'path';
import glob from 'fast-glob';
import { logger } from '../../../utils/logger.js';
import {
  ExtractionOptions,
  ExtractionResult,
  ExtractedQuery as InternalExtractedQuery,
  ResolvedQuery,
} from '../types/index.js';
import { Endpoint, ExtractedQuery } from '../../../types/shared.types.js';
import { ExtractionContext } from './ExtractionContext.js';
import { ExtractionPipeline } from './ExtractionPipeline.js';
import { PluckStrategy } from '../strategies/PluckStrategy.js';
import { ASTStrategy } from '../strategies/ASTStrategy.js';
import { PatternAwareASTStrategy } from '../strategies/PatternAwareASTStrategy.js';
import { BaseStrategy } from '../strategies/BaseStrategy.js';
import { astCache } from '../../cache/CacheManager.js';
import { monitor } from '../../monitoring/PerformanceMonitor.js';
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

    // Initialize strategies based on configuration
    const requestedStrategies = this.context.options.strategies || ['pluck', 'ast'];

    for (const strategyName of requestedStrategies) {
      switch (strategyName) {
        case 'pluck':
          strategies.set('pluck', new PluckStrategy(this.context));
          break;
        case 'ast':
          strategies.set('ast', new ASTStrategy(this.context));
          break;
        case 'pattern-aware':
          strategies.set('pattern-aware', new PatternAwareASTStrategy(this.context));
          break;
        default:
          logger.warn(`Unknown strategy: ${strategyName}, skipping`);
      }
    }

    // Ensure at least one strategy is available
    if (strategies.size === 0) {
      logger.warn('No valid strategies configured, falling back to AST strategy');
      strategies.set('ast', new ASTStrategy(this.context));
    }

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
      logger.info(
        `Extracted ${result.queries.length} queries with ${result.variants.length} variants`,
      );

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
      ignore: ignore || ['**/node_modules/**', '**/__generated__/**', '**/*.test.*'],
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

  private async extractQueries(files: string[]): Promise<InternalExtractedQuery[]> {
    const allQueries: InternalExtractedQuery[] = [];
    const { parallel, maxConcurrency } = this.context.options;

    if (parallel) {
      // Process files in batches
      const batchSize = maxConcurrency || 4;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((file) => this.extractFromFile(file)));
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
  async extractFromFile(filePath: string): Promise<InternalExtractedQuery[]> {
    try {
      // Check AST cache first (aggressive caching)
      const cachedQueries = await astCache.get<InternalExtractedQuery[]>('queries', filePath);
      if (cachedQueries) {
        logger.debug(`Cache hit for ${filePath}`);
        return cachedQueries;
      }

      // Check context cache (in-memory)
      const cached = this.context.getCached<InternalExtractedQuery[]>('file', filePath);
      if (cached) {
        return cached;
      }

      // Read and pre-process content for template resolution
      let content = await fs.readFile(filePath, 'utf-8');

      // CRITICAL: Resolve templates in raw content BEFORE extraction
      content = await this.preResolveTemplateContent(content, filePath);

      const queries: InternalExtractedQuery[] = [];

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

      // Resolve template variables before enhancement
      const resolvedQueries = await this.resolveTemplateVariables(queries, filePath);

      // Enhance queries with endpoint classification
      const enhancedQueries = resolvedQueries.map((query) => ({
        ...query,
        endpoint: this.determineEndpoint(filePath, content),
        sourceFile: filePath,
      }));

      // Cache results (both in-memory and persistent)
      this.context.setCached('file', filePath, enhancedQueries);
      await astCache.set('queries', filePath, enhancedQueries, 3600000); // 1 hour TTL
      this.context.incrementStat('processedFiles');

      return enhancedQueries;
    } catch (error) {
      this.context.addError(
        filePath,
        `Failed to process file: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Pre-resolve template content BEFORE extraction to handle ${queryNames.xxx} patterns
   * This allows GraphQL extractors to parse valid GraphQL syntax
   */
  private async preResolveTemplateContent(content: string, filePath: string): Promise<string> {
    try {
      // Load queryNames from multiple sources
      const queryNamesData = await this.loadAllQueryNames(filePath);

      if (!queryNamesData || Object.keys(queryNamesData).length === 0) {
        return content;
      }

      let resolvedContent = content;

      // Replace ${queryNames.xxx} patterns
      Object.entries(queryNamesData).forEach(([key, value]) => {
        const pattern = new RegExp(`\\$\\{queryNames\\.${key}\\}`, 'g');
        resolvedContent = resolvedContent.replace(pattern, value as string);
      });

      // Replace ${SAMPLE_QUERY_NAMES.xxx} patterns (for test files)
      Object.entries(queryNamesData).forEach(([key, value]) => {
        const samplePattern = new RegExp(`\\$\\{SAMPLE_QUERY_NAMES\\.${key}\\}`, 'g');
        resolvedContent = resolvedContent.replace(samplePattern, value as string);
      });

      // Replace generic ${variable} patterns with constants
      resolvedContent = this.resolveGenericTemplatePatterns(resolvedContent, filePath);

      return resolvedContent;
    } catch (error) {
      logger.warn(`Failed to pre-resolve template content for ${filePath}:`, error);
      return content;
    }
  }

  /**
   * Enhanced template variable resolution for ${queryNames.xxx} patterns
   * Loads from queryNames.js via fs.readFile and resolves all interpolations
   */
  private async resolveTemplateVariables(
    queries: InternalExtractedQuery[],
    filePath: string,
  ): Promise<InternalExtractedQuery[]> {
    try {
      // Load queryNames from multiple sources
      const queryNamesData = await this.loadAllQueryNames(filePath);

      if (!queryNamesData || Object.keys(queryNamesData).length === 0) {
        return queries;
      }

      return queries.map((query) => {
        let resolvedContent = query.content;

        // Replace ${queryNames.xxx} patterns
        Object.entries(queryNamesData).forEach(([key, value]) => {
          const pattern = new RegExp(`\\$\\{queryNames\\.${key}\\}`, 'g');
          resolvedContent = resolvedContent.replace(pattern, value as string);
        });

        // Replace ${SAMPLE_QUERY_NAMES.xxx} patterns (for test files)
        Object.entries(queryNamesData).forEach(([key, value]) => {
          const samplePattern = new RegExp(`\\$\\{SAMPLE_QUERY_NAMES\\.${key}\\}`, 'g');
          resolvedContent = resolvedContent.replace(samplePattern, value as string);
        });

        // Replace generic ${variable} patterns with constants
        resolvedContent = this.resolveGenericTemplatePatterns(resolvedContent, filePath);

        // Only update if changes were made
        if (resolvedContent !== query.content) {
          return {
            ...query,
            content: resolvedContent,
            source: resolvedContent,
            fullExpandedQuery: resolvedContent,
          };
        }

        return query;
      });
    } catch (error) {
      logger.warn(`Failed to resolve template variables for ${filePath}:`, error);
      return queries;
    }
  }

  /**
   * Load queryNames from multiple sources using fs.readFile as requested
   */
  private async loadAllQueryNames(filePath: string): Promise<Record<string, string> | null> {
    try {
      const directory = path.dirname(filePath);
      let queryNamesData: Record<string, string> = {};

      // 1. Load from queryNames.js using fs.readFile
      const queryNamesFromFile = await this.loadQueryNamesFromFile(directory);
      if (queryNamesFromFile) {
        queryNamesData = { ...queryNamesData, ...queryNamesFromFile };
      }

      // 2. Load from SAMPLE_QUERY_NAMES in same file (for test files)
      const sampleQueryNames = await this.extractSampleQueryNames(filePath);
      if (sampleQueryNames) {
        queryNamesData = { ...queryNamesData, ...sampleQueryNames };
      }

      return Object.keys(queryNamesData).length > 0 ? queryNamesData : null;
    } catch (error) {
      logger.debug(`Could not load all queryNames for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Load queryNames.js using fs.readFile as specifically requested
   */
  private async loadQueryNamesFromFile(directory: string): Promise<Record<string, string> | null> {
    const possiblePaths = [
      path.join(directory, 'queryNames.js'),
      path.join(path.dirname(directory), 'queryNames.js'),
      path.join(directory, '..', 'queryNames.js'),
    ];

    for (const queryNamesPath of possiblePaths) {
      try {
        await fs.access(queryNamesPath);
        const content = await fs.readFile(queryNamesPath, 'utf-8');

        // Parse JavaScript content to extract queryNames object
        const queryNamesMatch = content.match(
          /(?:export\s+const\s+queryNames|const\s+queryNames)\s*=\s*\{([^}]+)\}/s,
        );
        if (queryNamesMatch) {
          const objContent = queryNamesMatch[1];
          const queryNames: Record<string, string> = {};

          // Extract key-value pairs with regex
          const pairs = objContent.match(/(\w+):\s*['"`]([^'"`]+)['"`]/g);
          if (pairs) {
            pairs.forEach((pair) => {
              const [, key, value] = pair.match(/(\w+):\s*['"`]([^'"`]+)['"`]/) || [];
              if (key && value) {
                queryNames[key] = value;
              }
            });
          }

          return Object.keys(queryNames).length > 0 ? queryNames : null;
        }
      } catch {
        // Continue to next path
      }
    }

    return null;
  }

  /**
   * Extract SAMPLE_QUERY_NAMES from TypeScript files
   */
  private async extractSampleQueryNames(filePath: string): Promise<Record<string, string> | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Look for SAMPLE_QUERY_NAMES constant
      const sampleQueryNamesMatch = content.match(
        /export\s+const\s+SAMPLE_QUERY_NAMES\s*=\s*\{([^}]+)\}/s,
      );
      if (sampleQueryNamesMatch) {
        const objContent = sampleQueryNamesMatch[1];
        const queryNames: Record<string, string> = {};

        // Extract key-value pairs
        const pairs = objContent.match(/(\w+):\s*['"`]([^'"`]+)['"`]/g);
        if (pairs) {
          pairs.forEach((pair) => {
            const [, key, value] = pair.match(/(\w+):\s*['"`]([^'"`]+)['"`]/) || [];
            if (key && value) {
              queryNames[key] = value;
            }
          });
        }

        return Object.keys(queryNames).length > 0 ? queryNames : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve generic ${variable} patterns with common constants
   */
  private resolveGenericTemplatePatterns(content: string, filePath: string): string {
    let resolved = content;

    // Common pattern replacements
    const patterns = {
      '${includeEmail}': 'email',
      '${additionalFields}': 'metadata { createdAt updatedAt }',
      '${fragment}': '',
      '${queryArgs}': '',
      '${ventureQuery}': 'venture',
      '${ventureArgs}': '$ventureId: UUID!',
    };

    Object.entries(patterns).forEach(([pattern, replacement]) => {
      resolved = resolved.replace(
        new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        replacement,
      );
    });

    return resolved;
  }

  private async loadQueryNamesForFile(filePath: string): Promise<Record<string, string> | null> {
    try {
      const directory = path.dirname(filePath);
      const queryNamesPath = path.join(directory, 'queryNames.js');

      // Check if queryNames.js exists in the same directory
      try {
        await fs.access(queryNamesPath);
        const queryNamesModule = await import(queryNamesPath);
        return queryNamesModule.queryNames || queryNamesModule.default || null;
      } catch {
        // Try parent directory
        const parentDir = path.dirname(directory);
        const parentQueryNamesPath = path.join(parentDir, 'queryNames.js');

        try {
          await fs.access(parentQueryNamesPath);
          const queryNamesModule = await import(parentQueryNamesPath);
          return queryNamesModule.queryNames || queryNamesModule.default || null;
        } catch {
          return null;
        }
      }
    } catch (error) {
      logger.debug(`Could not load queryNames for ${filePath}:`, error);
      return null;
    }
  }

  private async extractWithStrategy(
    strategyName: string,
    filePath: string,
    content: string,
  ): Promise<InternalExtractedQuery[]> {
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

  private mergeResults(
    pluckResults: InternalExtractedQuery[],
    astResults: InternalExtractedQuery[],
  ): InternalExtractedQuery[] {
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
    if (
      content.includes('useOfferGraphMutation') ||
      content.includes('getClientSideOGClient') ||
      content.includes('offerGraphClient') ||
      content.includes('transitions') ||
      content.includes('modifyBasket') ||
      content.includes('FindUnifiedBillDetails')
    ) {
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
    return queries.map((q) => {
      const standardized: ExtractedQuery = {
        // Required identity
        id: q.id || this.generateUniqueName(q),
        type: q.type || 'query',
        
        // Identity
        id: q.id || this.generateUniqueName(q),
        queryName: this.generateUniqueName(q),
        content: q.content,
        fullExpandedQuery: q.resolvedContent || q.content,

        // Location
        filePath: q.filePath || 'unknown.js',
        lineNumber: q.location?.line || 1,

        // GraphQL metadata
        type: this.extractOperationType(q) || 'query',
        operation: this.extractOperationType(q),
        variables: this.extractVariables(q),
        fragments: q.fragments || [],
        hasVariables: Object.keys(this.extractVariables(q)).length > 0,

        // Classification
        endpoint: (q as any).endpoint || 'productGraph',
        isNested: (q.metadata?.isNested as boolean) || false,

        // Additional context
        source: (q.metadata?.source as string) || 'ast',
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
      query.variables.forEach((v) => {
        variables[v.name] = v.type;
      });
    }

    return variables;
  }

  private extractOperationType(
    query: ResolvedQuery,
  ): 'query' | 'mutation' | 'subscription' | undefined {
    const content = query.resolvedContent || query.content;

    // Check for operation type in the query
    if (content.match(/^\s*mutation\s+/m)) {
      return 'mutation';
    } else if (content.match(/^\s*subscription\s+/m)) {
      return 'subscription';
    } else if (content.match(/^\s*query\s+/m) || content.match(/^\s*{\s*/m)) {
      return 'query';
    }

    return undefined;
  }
}
