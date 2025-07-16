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
import { EventEmitter } from 'events';

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

/**
 * Centralized schema loading and caching service
 * Configurable via PgqlOptions for different environments
 */
export class SchemaLoader extends EventEmitter {
  private static instance: SchemaLoader;
  private cache = new Map<string, CachedSchema>();
  private options: Required<SchemaLoaderOptions>;

  constructor(options: SchemaLoaderOptions | PgqlOptions = {}) {
    super();
    // Extract schema config from PgqlOptions if provided
    const schemaConfig = 'schemaConfig' in options ? options.schemaConfig : options;
    this.options = {
      cacheEnabled: schemaConfig?.cacheEnabled ?? true,
      cacheSize: schemaConfig?.cacheSize ?? 50, // MB
      cacheTtl: schemaConfig?.cacheTtl ?? 3600000, // 1 hour
      fallbackToFile: schemaConfig?.fallbackToFile ?? true,
      enableWarmup: schemaConfig?.enableWarmup ?? false,
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
        this.emit('schemaLoaded', { source, cached: true, loadTime: Date.now() - startTime });
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
      this.emit('schemaLoaded', { source, cached: false, loadTime: result.loadTime });
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
        this.emit('schemaLoaded', { source, cached: false, loadTime: result.loadTime, fallback: true });
        return result;

      } catch (fallbackError) {
        logger.error(`All schema loading strategies failed for ${source}:`, {
          primary: primaryError.message,
          fallback: fallbackError.message,
        });
        throw new Error(`Failed to load schema from ${source}: ${fallbackError.message}`);
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
   * Get cache statistics
   */
  getCacheStats(): {
    entries: number;
    totalSize: number;
    hitRate: number;
  } {
    return {
      entries: this.cache.size,
      totalSize: this.getCurrentCacheSize(),
      hitRate: 0, // TODO: Add hit/miss tracking
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