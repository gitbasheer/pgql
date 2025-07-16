/**
 * @fileoverview Centralized schema loading with configurable caching for pg-migration-620.
 * Eliminates redundancy across validator and analyzer modules.
 */

import { GraphQLSchema, buildSchema, validate, parse } from 'graphql';
import { loadSchema } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { promises as fs } from 'fs';
import { logger } from './logger';
import { createHash } from 'crypto';
import { PgqlOptions } from '../types/shared.types';

export interface SchemaLoaderOptions {
  cacheEnabled?: boolean;
  cacheSize?: number;
  cacheTtl?: number;
  fallbackToFile?: boolean;
  enableWarmup?: boolean;
}

export interface CachedSchema {
  schema: GraphQLSchema;
  loadTime: number;
  size: number;
  hash: string;
}

export interface SchemaLoadResult {
  schema: GraphQLSchema;
  cached: boolean;
  loadTime: number;
}

export interface SchemaLoadActivity {
  source: string;
  cached: boolean;
  loadTime: number;
  fallback?: boolean;
  timestamp: number;
}

/**
 * Centralized schema loading and caching service
 * Configurable via PgqlOptions for different environments
 */
export class SchemaLoader {
  private static instance: SchemaLoader;
  private cache = new Map<string, CachedSchema>();
  private options: Required<SchemaLoaderOptions>;
  private recentActivity: SchemaLoadActivity[] = [];

  constructor(options: SchemaLoaderOptions | PgqlOptions = {}) {
    // Extract schema config from PgqlOptions if provided
    const schemaConfig = 'schemaConfig' in options ? options.schemaConfig : options;
    this.options = {
      cacheEnabled: (schemaConfig as any)?.cacheEnabled ?? true,
      cacheSize: (schemaConfig as any)?.cacheSize ?? 50, // MB
      cacheTtl: (schemaConfig as any)?.cacheTtl ?? 3600000, // 1 hour
      fallbackToFile: (schemaConfig as any)?.fallbackToFile ?? true,
      enableWarmup: (schemaConfig as any)?.enableWarmup ?? false,
    };

    if (this.options.enableWarmup) {
      this.warmCache().catch(error => 
        logger.warn('Schema cache warmup failed:', error)
      );
    }
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(options?: SchemaLoaderOptions | PgqlOptions): SchemaLoader {
    if (!SchemaLoader.instance) {
      SchemaLoader.instance = new SchemaLoader(options);
    }
    return SchemaLoader.instance;
  }

  /**
   * Load schema with caching and fallback strategies
   */
  async loadSchema(source: string): Promise<SchemaLoadResult> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(source);

    // Check cache first
    if (this.options.cacheEnabled) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        logger.debug(`Schema cache hit for ${source}`);
        this.recordActivity({ source, cached: true, loadTime: Date.now() - startTime, timestamp: Date.now() });
        return {
          schema: cached.schema,
          cached: true,
          loadTime: Date.now() - startTime,
        };
      }
    }

    try {
      // Primary strategy: Use GraphQL tools loader
      logger.debug(`Loading schema from ${source} using GraphQL tools`);
      const schema = await loadSchema(source, {
        loaders: [new GraphQLFileLoader()],
      });

      const result = {
        schema,
        cached: false,
        loadTime: Date.now() - startTime,
      };

      // Cache the loaded schema
      if (this.options.cacheEnabled) {
        await this.addToCache(cacheKey, schema, source);
      }

      logger.info(`Schema loaded successfully from ${source} in ${result.loadTime}ms`);
      this.recordActivity({ source, cached: false, loadTime: result.loadTime, timestamp: Date.now() });
      return result;

    } catch (primaryError) {
      logger.warn(`Primary schema loading failed for ${source}:`, primaryError);

      if (!this.options.fallbackToFile) {
        throw primaryError;
      }

      // Fallback strategy: Manual file reading
      try {
        logger.debug(`Fallback: Loading schema from ${source} via file read`);
        const schemaContent = await fs.readFile(source, 'utf-8');
        const schema = buildSchema(schemaContent);

        const result = {
          schema,
          cached: false,
          loadTime: Date.now() - startTime,
        };

        // Cache the fallback schema
        if (this.options.cacheEnabled) {
          await this.addToCache(cacheKey, schema, source);
        }

        logger.info(`Schema loaded via fallback from ${source} in ${result.loadTime}ms`);
        this.recordActivity({ source, cached: false, loadTime: result.loadTime, fallback: true, timestamp: Date.now() });
        return result;

      } catch (fallbackError) {
        logger.error(`All schema loading strategies failed for ${source}:`, {
          primary: primaryError instanceof Error ? primaryError.message : String(primaryError),
          fallback: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
        throw new Error(`Failed to load schema from ${source}: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    }
  }

  /**
   * Quick schema validation for basic syntax checking
   */
  async validateSchemaContent(query: string, schema: GraphQLSchema): Promise<boolean> {
    try {
      const document = parse(query);
      const errors = validate(schema, document);
      return errors.length === 0;
    } catch (error) {
      logger.debug('Schema validation failed:', error);
      return false;
    }
  }

  /**
   * Get schema from cache if valid
   */
  private getFromCache(key: string): CachedSchema | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check TTL
    const age = Date.now() - cached.loadTime;
    if (age > this.options.cacheTtl) {
      this.cache.delete(key);
      logger.debug(`Schema cache entry expired for ${key}`);
      return null;
    }

    return cached;
  }

  /**
   * Add schema to cache with LRU eviction
   */
  private async addToCache(key: string, schema: GraphQLSchema, source: string): Promise<void> {
    const size = this.estimateSchemaSize(schema);
    const totalSize = this.getCurrentCacheSize() + size;

    // LRU eviction if cache is full
    if (totalSize > this.options.cacheSize * 1024 * 1024) {
      this.evictOldestEntries(size);
    }

    const cached: CachedSchema = {
      schema,
      loadTime: Date.now(),
      size,
      hash: this.generateContentHash(source),
    };

    this.cache.set(key, cached);
    logger.debug(`Schema cached for ${key} (${size} bytes)`);
  }

  /**
   * Evict oldest cache entries to make room
   */
  private evictOldestEntries(requiredSpace: number): void {
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.loadTime - b.loadTime);

    let freedSpace = 0;
    for (const [key, entry] of entries) {
      this.cache.delete(key);
      freedSpace += entry.size;
      logger.debug(`Evicted schema cache entry ${key}`);
      
      if (freedSpace >= requiredSpace) break;
    }
  }

  /**
   * Estimate schema size for cache management
   */
  private estimateSchemaSize(schema: GraphQLSchema): number {
    const typeMap = schema.getTypeMap();
    const typeCount = Object.keys(typeMap).length;
    // Rough estimation: ~1KB per type
    return typeCount * 1024;
  }

  /**
   * Get current total cache size
   */
  private getCurrentCacheSize(): number {
    return Array.from(this.cache.values())
      .reduce((total, cached) => total + cached.size, 0);
  }

  /**
   * Generate cache key from source path
   */
  private generateCacheKey(source: string): string {
    return createHash('md5').update(source).digest('hex');
  }

  /**
   * Generate content hash for cache validation
   */
  private generateContentHash(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * Warm cache with common schemas
   */
  private async warmCache(): Promise<void> {
    const commonSchemas = [
      'data/schema.graphql',
      'data/deprecations-schema.graphql',
    ];

    logger.info('Warming schema cache...');
    const warmupPromises = commonSchemas.map(async (schemaPath) => {
      try {
        await this.loadSchema(schemaPath);
      } catch (error) {
        logger.debug(`Cache warmup failed for ${schemaPath}:`, error);
      }
    });

    await Promise.all(warmupPromises);
    logger.info(`Schema cache warmed with ${this.cache.size} entries`);
  }

  /**
   * Clear all cached schemas
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Schema cache cleared');
  }

  /**
   * Record schema loading activity for UI polling
   */
  private recordActivity(activity: SchemaLoadActivity): void {
    this.recentActivity.push(activity);
    // Keep only last 50 activities for polling
    if (this.recentActivity.length > 50) {
      this.recentActivity.shift();
    }
  }

  /**
   * Get recent schema loading activity (for UI polling)
   */
  getRecentActivity(since?: number): SchemaLoadActivity[] {
    if (since) {
      return this.recentActivity.filter(activity => activity.timestamp > since);
    }
    return [...this.recentActivity];
  }

  /**
   * Get cache statistics with recent activity for UI polling
   */
  getCacheStats(): {
    entries: number;
    totalSize: number;
    hitRate: number;
    recentActivity: SchemaLoadActivity[];
  } {
    const totalLoads = this.recentActivity.length;
    const cacheHits = this.recentActivity.filter(a => a.cached).length;
    const hitRate = totalLoads > 0 ? cacheHits / totalLoads : 0;

    return {
      entries: this.cache.size,
      totalSize: this.getCurrentCacheSize(),
      hitRate,
      recentActivity: this.getRecentActivity(),
    };
  }
}

/**
 * Default schema loader instance
 * Configured for production use
 */
export const defaultSchemaLoader = SchemaLoader.getInstance({
  cacheEnabled: true,
  cacheSize: 100, // 100MB
  cacheTtl: 3600000, // 1 hour
  fallbackToFile: true,
  enableWarmup: process.env.NODE_ENV === 'production',
});

/**
 * Convenience function for quick schema loading
 */
export async function loadSchemaWithCache(
  source: string, 
  options?: SchemaLoaderOptions | PgqlOptions
): Promise<GraphQLSchema> {
  const loader = options ? new SchemaLoader(options) : defaultSchemaLoader;
  const result = await loader.loadSchema(source);
  return result.schema;
}