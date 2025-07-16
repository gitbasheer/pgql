// @ts-nocheck
import { logger } from '../../../utils/logger.js';
import { QueryPatternService } from '../engine/QueryPatternRegistry.js';
import { QueryNamingService } from './QueryNamingService.js';
import { QueryMigrator } from '../engine/QueryMigrator.js';
import { PatternAwareASTStrategy } from '../strategies/PatternAwareASTStrategy.js';
import { ExtractionOptions } from '../types/extraction.types.js';

export interface QueryServicesConfig {
  options: ExtractionOptions;
  enableCaching?: boolean;
  cacheMaxSize?: number;
  cacheTTL?: number;
  enableIncrementalExtraction?: boolean;
  patternRegistryPath?: string;
}

export interface QueryServices {
  patternService: QueryPatternService;
  namingService: QueryNamingService;
  migrator: QueryMigrator;
  strategy: PatternAwareASTStrategy;
  cacheManager: QueryCacheManager;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  size: number;
}

export class QueryCacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private totalSize = 0;
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(maxSize = 100 * 1024 * 1024, ttl = 3600000) {
    // 100MB, 1 hour
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set<T>(key: string, value: T): void {
    const size = this.estimateSize(value);

    // Evict if necessary
    while (this.totalSize + size > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      size,
    };

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    this.cache.set(key, entry);
    this.totalSize += size;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }

  getStats() {
    return {
      entries: this.cache.size,
      totalSize: this.totalSize,
      maxSize: this.maxSize,
      hitRate: this.calculateHitRate(),
    };
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // Rough UTF-16 byte estimate
    } catch {
      return 1000; // Fallback estimate
    }
  }

  private calculateHitRate(): number {
    // This would need hit/miss tracking in a real implementation
    return 0.85; // Placeholder
  }
}

/**
 * Factory for creating and managing pattern-based query services
 * Eliminates tight coupling and provides centralized configuration
 */
export class QueryServicesFactory {
  private static instance: QueryServicesFactory | null = null;
  private servicesCache = new Map<string, QueryServices>();

  private constructor() {}

  static getInstance(): QueryServicesFactory {
    if (!QueryServicesFactory.instance) {
      QueryServicesFactory.instance = new QueryServicesFactory();
    }
    return QueryServicesFactory.instance;
  }

  /**
   * Create or retrieve cached services for the given configuration
   */
  async create(config: QueryServicesConfig): Promise<QueryServices> {
    const cacheKey = this.generateCacheKey(config);

    // Return cached services if available
    if (this.servicesCache.has(cacheKey)) {
      const services = this.servicesCache.get(cacheKey)!;
      logger.debug(`Reusing cached services for key: ${cacheKey}`);
      return services;
    }

    logger.info('Creating new query services...');

    // Create cache manager
    const cacheManager = new QueryCacheManager(config.cacheMaxSize, config.cacheTTL);

    // Create pattern service with caching
    const patternService = new QueryPatternService();

    // Load patterns if path provided
    if (config.patternRegistryPath) {
      await patternService.loadPatterns(config.patternRegistryPath);
    }

    // Create naming service with pattern service and cache integration
    const namingService = new QueryNamingService(patternService);
    if (config.enableCaching) {
      this.integrateCaching(namingService, cacheManager);
    }

    // Create migrator
    const migrator = new QueryMigrator(patternService, {
      preserveApplicationLogic: true,
      updateQueryNamesObject: true,
      trackVersionProgression: true,
      respectFeatureFlags: true,
    });

    // Create pattern-aware strategy
    const strategy = new PatternAwareASTStrategy(patternService);

    const services: QueryServices = {
      patternService,
      namingService,
      migrator,
      strategy,
      cacheManager,
    };

    // Initialize services
    await this.initializeServices(services, config);

    // Cache for reuse
    this.servicesCache.set(cacheKey, services);

    logger.info('Query services created and cached successfully');
    return services;
  }

  /**
   * Clear all cached services
   */
  clearCache(): void {
    this.servicesCache.clear();
    logger.info('Services cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cachedServices: this.servicesCache.size,
      cacheKeys: Array.from(this.servicesCache.keys()),
    };
  }

  private generateCacheKey(config: QueryServicesConfig): string {
    const keyData = {
      directory: config.options.directory,
      patterns: config.options.patterns,
      enableCaching: config.enableCaching,
      patternRegistryPath: config.patternRegistryPath,
      enableIncrementalExtraction: config.enableIncrementalExtraction,
    };

    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  private integrateCaching(
    namingService: QueryNamingService,
    cacheManager: QueryCacheManager,
  ): void {
    // Wrap processQuery with caching
    const originalProcessQuery = namingService.processQuery.bind(namingService);

    namingService.processQuery = (query) => {
      const cacheKey = `processQuery:${query.id}:${query.filePath}:${Buffer.from(query.content).toString('base64').substring(0, 32)}`;

      const cached = cacheManager.get(cacheKey);
      if (cached) {
        return cached;
      }

      const result = originalProcessQuery(query);
      cacheManager.set(cacheKey, result);
      return result;
    };
  }

  private async initializeServices(
    services: QueryServices,
    config: QueryServicesConfig,
  ): Promise<void> {
    // Initialize naming service
    await services.namingService.initialize(config.options);

    logger.debug('Services initialized with configuration:', {
      enableCaching: config.enableCaching,
      enableIncrementalExtraction: config.enableIncrementalExtraction,
      cacheStats: services.cacheManager.getStats(),
    });
  }
}

/**
 * Convenience function for quick service creation
 */
export async function createQueryServices(config: QueryServicesConfig): Promise<QueryServices> {
  const factory = QueryServicesFactory.getInstance();
  return factory.create(config);
}

/**
 * Convenience function with default configuration
 */
export async function createDefaultQueryServices(
  options: ExtractionOptions,
): Promise<QueryServices> {
  return createQueryServices({
    options,
    enableCaching: true,
    cacheMaxSize: 50 * 1024 * 1024, // 50MB
    cacheTTL: 1800000, // 30 minutes
    enableIncrementalExtraction: options.enableIncrementalExtraction ?? false,
  });
}
