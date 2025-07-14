import { LRUCache } from 'lru-cache';
import { Level } from 'level';
import { createHash } from 'crypto';
import { logger } from '../../utils/logger';
import { performance } from 'perf_hooks';
import type { GraphQLSchema } from 'graphql';
import type { ExtractedQuery } from '../extraction/types';
import type { TransformResult } from '../transformer/types';

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

interface CacheOptions {
  maxSize: number;
  ttl?: number;
  persistent?: boolean;
  dbPath?: string;
  warmOnInit?: boolean;
}

type CacheValue = any;

/**
 * High-performance caching manager with LRU eviction and optional persistence
 */
export class CacheManager {
  private memoryCache: LRUCache<string, CacheValue>;
  private persistentCache?: Level<string, string>;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    hitRate: 0,
  };
  private performanceMetrics: Map<string, number[]> = new Map();

  constructor(private options: CacheOptions) {
    // Initialize LRU cache
    this.memoryCache = new LRUCache<string, CacheValue>({
      max: options.maxSize,
      ttl: options.ttl,
      dispose: () => {
        this.stats.evictions++;
      },
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    // Initialize persistent cache if enabled
    if (options.persistent && options.dbPath) {
      this.initPersistentCache(options.dbPath);
    }

    // Warm cache if requested
    if (options.warmOnInit) {
      this.warmCache();
    }
  }

  private async initPersistentCache(dbPath: string) {
    try {
      this.persistentCache = new Level(dbPath, {
        valueEncoding: 'json',
      });
      try {
        await this.persistentCache.open();
      } catch (error: any) {
        if (error.code === 'LEVEL_LOCKED') {
          // Database is already open in another process, use in-memory only
          this.persistentCache = undefined;
          logger.warn('Database locked, falling back to memory cache only');
          return;
        }
        throw error;
      }
      logger.info(`Persistent cache initialized at ${dbPath}`);
    } catch (error) {
      logger.error('Failed to initialize persistent cache:', error);
    }
  }

  /**
   * Generate cache key from inputs
   */
  private generateKey(...args: any[]): string {
    const hash = createHash('sha256');
    hash.update(JSON.stringify(args));
    return hash.digest('hex');
  }

  /**
   * Get value from cache
   */
  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    const start = performance.now();
    const cacheKey = this.generateKey(namespace, key);

    // Check memory cache first
    let value = this.memoryCache.get(cacheKey);

    if (value !== undefined) {
      this.stats.hits++;
      this.recordPerformance('get:hit', performance.now() - start);
      return value as T;
    }

    // Check persistent cache if available
    if (this.persistentCache) {
      try {
        const persistedValue = await this.persistentCache.get(cacheKey);
        if (persistedValue) {
          value = JSON.parse(persistedValue);
          // Promote to memory cache
          this.memoryCache.set(cacheKey, value);
          this.stats.hits++;
          this.recordPerformance('get:persistent', performance.now() - start);
          return value as T;
        }
      } catch (error: any) {
        // Key not found or database issues - continue without error
        if (error.code !== 'LEVEL_NOT_FOUND' &&
            error.code !== 'LEVEL_DATABASE_NOT_OPEN' &&
            error.code !== 'LEVEL_LOCKED') {
          logger.error('Cache get error:', error);
        }
      }
    }

    this.stats.misses++;
    this.recordPerformance('get:miss', performance.now() - start);
    return undefined;
  }

  /**
   * Set value in cache
   */
  async set<T>(namespace: string, key: string, value: T, ttl?: number): Promise<void> {
    const start = performance.now();
    const cacheKey = this.generateKey(namespace, key);

    // Set in memory cache
    this.memoryCache.set(cacheKey, value, { ttl });

    // Persist if enabled
    if (this.persistentCache) {
      try {
        await this.persistentCache.put(cacheKey, JSON.stringify(value));
      } catch (error: any) {
        if (error.code !== 'LEVEL_DATABASE_NOT_OPEN' && error.code !== 'LEVEL_LOCKED') {
          logger.error('Failed to persist cache entry:', error);
        }
        // Continue with in-memory cache only
      }
    }

    this.stats.size = this.memoryCache.size;
    this.recordPerformance('set', performance.now() - start);
  }

  /**
   * Delete value from cache
   */
  async delete(namespace: string, key: string): Promise<void> {
    const cacheKey = this.generateKey(namespace, key);

    this.memoryCache.delete(cacheKey);

    if (this.persistentCache) {
      try {
        await this.persistentCache.del(cacheKey);
      } catch (error: any) {
        // Ignore if key doesn't exist or database issues
        if (error.code !== 'LEVEL_NOT_FOUND' &&
            error.code !== 'LEVEL_DATABASE_NOT_OPEN' &&
            error.code !== 'LEVEL_LOCKED') {
          logger.error('Cache delete error:', error);
        }
      }
    }

    this.stats.size = this.memoryCache.size;
  }

  /**
   * Clear entire cache or namespace
   */
  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      // Clear specific namespace
      const keysToDelete: string[] = [];
      this.memoryCache.forEach((_value: CacheValue, key: string) => {
        if (key.startsWith(namespace)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => this.memoryCache.delete(key));
    } else {
      // Clear entire cache
      this.memoryCache.clear();
    }

    if (this.persistentCache && !namespace) {
      try {
        await this.persistentCache.clear();
      } catch (error: any) {
        if (error.code !== 'LEVEL_DATABASE_NOT_OPEN') {
          throw error;
        }
        // Ignore if database is not open
      }
    }

    this.stats.size = this.memoryCache.size;
  }

  /**
   * Warm cache with frequently used data
   */
  async warmCache(): Promise<void> {
    logger.info('Warming cache...');
    const start = performance.now();

    try {
      // Pre-load schemas
      await this.warmSchemas();

      // Pre-load common patterns
      await this.warmPatterns();

      // Pre-load transformations
      await this.warmTransformations();

      logger.info(`Cache warmed in ${(performance.now() - start).toFixed(2)}ms`);
    } catch (error) {
      logger.error('Cache warming failed:', error);
    }
  }

  private async warmSchemas(): Promise<void> {
    // Pre-load commonly used schemas
    const commonSchemas = ['./data/schema.graphql', './schema.graphql'];
    for (const schemaPath of commonSchemas) {
      // Schema loading will be handled by SchemaValidator
      await this.set('schema', schemaPath, null, 3600000); // 1 hour TTL
    }
  }

  private async warmPatterns(): Promise<void> {
    // Pre-load common GraphQL patterns
    const patterns = [
      { pattern: /gql`[\s\S]*?`/g, name: 'gql-template' },
      { pattern: /graphql`[\s\S]*?`/g, name: 'graphql-template' },
      { pattern: /query\s+(\w+)/g, name: 'query-name' },
      { pattern: /fragment\s+(\w+)/g, name: 'fragment-name' },
    ];

    for (const { pattern, name } of patterns) {
      await this.set('pattern', name, pattern.source);
    }
  }

  private async warmTransformations(): Promise<void> {
    // Pre-load common transformation rules
    const rules = [
      { from: 'deprecated_field', to: 'new_field' },
      { from: 'oldType', to: 'newType' },
    ];

    for (const rule of rules) {
      await this.set('transform-rule', rule.from, rule);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.stats.size = this.memoryCache.size;
    this.stats.hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0;
    return { ...this.stats };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const metrics: Record<string, any> = {};

    this.performanceMetrics.forEach((times, operation) => {
      metrics[operation] = {
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        count: times.length,
      };
    });

    return metrics;
  }

  private recordPerformance(operation: string, duration: number): void {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }
    const times = this.performanceMetrics.get(operation)!;
    times.push(duration);

    // Keep only last 1000 measurements
    if (times.length > 1000) {
      times.shift();
    }
  }

  /**
   * Cache decorators for methods
   */
  static memoize(namespace: string, ttl?: number) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;
      const cache = new CacheManager({ maxSize: 1000, ttl });

      descriptor.value = async function (...args: any[]) {
        const key = JSON.stringify(args);
        const cached = await cache.get(namespace, key);

        if (cached !== undefined) {
          return cached;
        }

        const result = await originalMethod.apply(this, args);
        await cache.set(namespace, key, result);
        return result;
      };

      return descriptor;
    };
  }

  /**
   * Close persistent cache connection
   */
  async close(): Promise<void> {
    if (this.persistentCache) {
      try {
        await this.persistentCache.close();
      } catch (error: any) {
        // Ignore close errors
        if (error.code !== 'LEVEL_DATABASE_NOT_OPEN') {
          logger.error('Error closing cache:', error);
        }
      }
    }
  }
}

// Global cache instances - with better error handling
export const astCache = new CacheManager({
  maxSize: 1000,
  ttl: 3600000, // 1 hour
  persistent: process.env.NODE_ENV !== 'test',
  dbPath: '.cache/ast',
});

export const validationCache = new CacheManager({
  maxSize: 5000,
  ttl: 1800000, // 30 minutes
  persistent: process.env.NODE_ENV !== 'test',
  dbPath: '.cache/validation',
});

export const transformCache = new CacheManager({
  maxSize: 2000,
  ttl: 3600000, // 1 hour
  persistent: process.env.NODE_ENV !== 'test',
  dbPath: '.cache/transform',
});

export const schemaCache = new CacheManager({
  maxSize: 100,
  ttl: 7200000, // 2 hours
  persistent: process.env.NODE_ENV !== 'test',
  dbPath: '.cache/schema',
  warmOnInit: process.env.NODE_ENV !== 'test',
});
