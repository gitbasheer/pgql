import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager } from '../../core/cache/CacheManager';
import { Level } from 'level';
import { performance } from 'perf_hooks';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../utils/logger';

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('level', () => ({
  Level: vi.fn()
}));

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  const testCachePath = '.test-cache';
  
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Clean up test cache directory
    try {
      await fs.rm(testCachePath, { recursive: true, force: true });
    } catch (error) {
      // Directory doesn't exist, ignore
    }
  });

  afterEach(async () => {
    if (cacheManager) {
      await cacheManager.close();
    }
    
    // Clean up test cache directory
    try {
      await fs.rm(testCachePath, { recursive: true, force: true });
    } catch (error) {
      // Directory doesn't exist, ignore
    }
  });

  describe('initialization', () => {
    it('should initialize with memory-only cache', () => {
      cacheManager = new CacheManager({
        maxSize: 100,
        ttl: 1000,
      });

      expect(cacheManager).toBeDefined();
      expect(cacheManager.getStats()).toEqual({
        hits: 0,
        misses: 0,
        evictions: 0,
        size: 0,
        hitRate: 0,
      });
    });

    it('should initialize with persistent cache when enabled', async () => {
      const mockOpen = vi.fn().mockResolvedValue(undefined);
      const mockLevel = {
        open: mockOpen,
        close: vi.fn().mockResolvedValue(undefined),
      };
      
      (Level as any).mockImplementation(() => mockLevel as any);

      cacheManager = new CacheManager({
        maxSize: 100,
        persistent: true,
        dbPath: testCachePath,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(Level).toHaveBeenCalledWith(testCachePath, { valueEncoding: 'json' });
      expect(mockOpen).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(`Persistent cache initialized at ${testCachePath}`);
    });

    it('should handle locked database gracefully', async () => {
      const mockOpen = vi.fn().mockRejectedValue({ code: 'LEVEL_LOCKED' });
      const mockLevel = {
        open: mockOpen,
        close: vi.fn(),
      };
      
      (Level as any).mockImplementation(() => mockLevel as any);

      cacheManager = new CacheManager({
        maxSize: 100,
        persistent: true,
        dbPath: testCachePath,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(logger.warn).toHaveBeenCalledWith('Database locked, falling back to memory cache only');
    });

    it('should handle database initialization errors', async () => {
      const mockOpen = vi.fn().mockRejectedValue(new Error('DB Error'));
      const mockLevel = {
        open: mockOpen,
        close: vi.fn(),
      };
      
      (Level as any).mockImplementation(() => mockLevel as any);

      cacheManager = new CacheManager({
        maxSize: 100,
        persistent: true,
        dbPath: testCachePath,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(logger.error).toHaveBeenCalledWith('Failed to initialize persistent cache:', expect.any(Error));
    });

    it('should warm cache on init when requested', async () => {
      const warmCacheSpy = vi.spyOn(CacheManager.prototype as any, 'warmCache');
      
      cacheManager = new CacheManager({
        maxSize: 100,
        warmOnInit: true,
      });

      expect(warmCacheSpy).toHaveBeenCalled();
    });
  });

  describe('get/set operations', () => {
    beforeEach(() => {
      cacheManager = new CacheManager({
        maxSize: 100,
        ttl: 1000,
      });
    });

    it('should set and get values from memory cache', async () => {
      const value = { data: 'test' };
      await cacheManager.set('namespace', 'key', value);
      
      const retrieved = await cacheManager.get('namespace', 'key');
      expect(retrieved).toEqual(value);
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1);
    });

    it('should return undefined for missing keys', async () => {
      const result = await cacheManager.get('namespace', 'missing');
      expect(result).toBeUndefined();
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
    });

    it('should respect TTL settings', async () => {
      await cacheManager.set('namespace', 'key', 'value', 50); // 50ms TTL
      
      // Should exist immediately
      expect(await cacheManager.get('namespace', 'key')).toBe('value');
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should be gone
      expect(await cacheManager.get('namespace', 'key')).toBeUndefined();
    });

    it('should handle different data types', async () => {
      const testData = [
        { key: 'string', value: 'test string' },
        { key: 'number', value: 123 },
        { key: 'boolean', value: true },
        { key: 'array', value: [1, 2, 3] },
        { key: 'object', value: { nested: { data: 'value' } } },
        { key: 'null', value: null },
      ];

      for (const { key, value } of testData) {
        await cacheManager.set('types', key, value);
        const retrieved = await cacheManager.get('types', key);
        expect(retrieved).toEqual(value);
      }
    });

    it('should generate consistent cache keys', async () => {
      const value1 = 'test1';
      const value2 = 'test2';
      
      await cacheManager.set('namespace', 'key', value1);
      await cacheManager.set('namespace', 'key', value2); // Overwrite
      
      const retrieved = await cacheManager.get('namespace', 'key');
      expect(retrieved).toBe(value2); // Should get the latest value
    });
  });

  describe('persistent cache operations', () => {
    let mockLevel: any;

    beforeEach(() => {
      mockLevel = {
        open: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
        del: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      
      (Level as any).mockImplementation(() => mockLevel as any);
    });

    it('should persist values to LevelDB', async () => {
      cacheManager = new CacheManager({
        maxSize: 100,
        persistent: true,
        dbPath: testCachePath,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      const value = { data: 'persistent' };
      await cacheManager.set('namespace', 'key', value);

      expect(mockLevel.put).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(value)
      );
    });

    it('should retrieve from persistent cache when not in memory', async () => {
      cacheManager = new CacheManager({
        maxSize: 100,
        persistent: true,
        dbPath: testCachePath,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      const value = { data: 'persistent' };
      mockLevel.get.mockResolvedValue(JSON.stringify(value));

      const retrieved = await cacheManager.get('namespace', 'key');
      expect(retrieved).toEqual(value);
      expect(mockLevel.get).toHaveBeenCalled();
    });

    it('should handle persistent cache errors gracefully', async () => {
      cacheManager = new CacheManager({
        maxSize: 100,
        persistent: true,
        dbPath: testCachePath,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      mockLevel.put.mockRejectedValue(new Error('DB Error'));
      
      // Should not throw
      await expect(cacheManager.set('namespace', 'key', 'value')).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Failed to persist cache entry:', expect.any(Error));
    });

    it('should handle LEVEL_NOT_FOUND errors silently', async () => {
      cacheManager = new CacheManager({
        maxSize: 100,
        persistent: true,
        dbPath: testCachePath,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      mockLevel.get.mockRejectedValue({ code: 'LEVEL_NOT_FOUND' });
      
      const result = await cacheManager.get('namespace', 'missing');
      expect(result).toBeUndefined();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('delete operations', () => {
    beforeEach(() => {
      cacheManager = new CacheManager({
        maxSize: 100,
      });
    });

    it('should delete values from cache', async () => {
      await cacheManager.set('namespace', 'key', 'value');
      expect(await cacheManager.get('namespace', 'key')).toBe('value');
      
      await cacheManager.delete('namespace', 'key');
      expect(await cacheManager.get('namespace', 'key')).toBeUndefined();
    });

    it('should handle deleting non-existent keys', async () => {
      // Should not throw
      await expect(cacheManager.delete('namespace', 'nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('clear operations', () => {
    beforeEach(() => {
      cacheManager = new CacheManager({
        maxSize: 100,
      });
    });

    it('should clear entire cache', async () => {
      await cacheManager.set('ns1', 'key1', 'value1');
      await cacheManager.set('ns2', 'key2', 'value2');
      
      await cacheManager.clear();
      
      expect(await cacheManager.get('ns1', 'key1')).toBeUndefined();
      expect(await cacheManager.get('ns2', 'key2')).toBeUndefined();
      expect(cacheManager.getStats().size).toBe(0);
    });

    it('should clear specific namespace', async () => {
      await cacheManager.set('ns1', 'key1', 'value1');
      await cacheManager.set('ns1', 'key2', 'value2');
      await cacheManager.set('ns2', 'key3', 'value3');
      
      await cacheManager.clear('ns1');
      
      expect(await cacheManager.get('ns1', 'key1')).toBeUndefined();
      expect(await cacheManager.get('ns1', 'key2')).toBeUndefined();
      expect(await cacheManager.get('ns2', 'key3')).toBe('value3');
    });
  });

  describe('eviction and statistics', () => {
    it('should evict oldest entries when cache is full', async () => {
      cacheManager = new CacheManager({
        maxSize: 3,
      });

      await cacheManager.set('namespace', 'key1', 'value1');
      await cacheManager.set('namespace', 'key2', 'value2');
      await cacheManager.set('namespace', 'key3', 'value3');
      
      const statsBefore = cacheManager.getStats();
      expect(statsBefore.size).toBe(3);
      expect(statsBefore.evictions).toBe(0);
      
      // This should evict key1
      await cacheManager.set('namespace', 'key4', 'value4');
      
      const statsAfter = cacheManager.getStats();
      expect(statsAfter.size).toBe(3);
      expect(statsAfter.evictions).toBe(1);
      
      expect(await cacheManager.get('namespace', 'key1')).toBeUndefined();
      expect(await cacheManager.get('namespace', 'key4')).toBe('value4');
    });

    it('should calculate hit rate correctly', async () => {
      cacheManager = new CacheManager({
        maxSize: 100,
      });

      await cacheManager.set('namespace', 'key', 'value');
      
      // 3 hits
      await cacheManager.get('namespace', 'key');
      await cacheManager.get('namespace', 'key');
      await cacheManager.get('namespace', 'key');
      
      // 2 misses
      await cacheManager.get('namespace', 'missing1');
      await cacheManager.get('namespace', 'missing2');
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.6); // 3/(3+2)
    });
  });

  describe('performance metrics', () => {
    beforeEach(() => {
      cacheManager = new CacheManager({
        maxSize: 100,
      });
    });

    it('should track performance metrics', async () => {
      await cacheManager.set('namespace', 'key', 'value');
      await cacheManager.get('namespace', 'key'); // hit
      await cacheManager.get('namespace', 'missing'); // miss
      
      const metrics = cacheManager.getPerformanceMetrics();
      
      expect(metrics).toHaveProperty('set');
      expect(metrics).toHaveProperty('get:hit');
      expect(metrics).toHaveProperty('get:miss');
      
      expect(metrics.set.count).toBe(1);
      expect(metrics['get:hit'].count).toBe(1);
      expect(metrics['get:miss'].count).toBe(1);
      
      // Check that metrics have reasonable values
      Object.values(metrics).forEach(metric => {
        expect(metric.avg).toBeGreaterThanOrEqual(0);
        expect(metric.min).toBeGreaterThanOrEqual(0);
        expect(metric.max).toBeGreaterThanOrEqual(metric.min);
      });
    });

    it('should limit performance metric history', async () => {
      cacheManager = new CacheManager({
        maxSize: 100,
      });

      // Generate more than 1000 operations
      for (let i = 0; i < 1100; i++) {
        await cacheManager.set('namespace', `key${i}`, `value${i}`);
      }
      
      const metrics = cacheManager.getPerformanceMetrics();
      expect(metrics.set.count).toBe(1000); // Should be capped at 1000
    });
  });

  describe('cache warming', () => {
    beforeEach(() => {
      cacheManager = new CacheManager({
        maxSize: 100,
      });
    });

    it('should warm cache with predefined data', async () => {
      const setSpy = vi.spyOn(cacheManager, 'set');
      
      await cacheManager.warmCache();
      
      expect(logger.info).toHaveBeenCalledWith('Warming cache...');
      expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/Cache warmed in \d+\.\d+ms/));
      
      // Check that various items were cached
      expect(setSpy).toHaveBeenCalledWith('schema', expect.any(String), null, 3600000);
      expect(setSpy).toHaveBeenCalledWith('pattern', expect.any(String), expect.any(String));
      expect(setSpy).toHaveBeenCalledWith('transform-rule', expect.any(String), expect.any(Object));
    });

    it('should handle warming errors gracefully', async () => {
      vi.spyOn(cacheManager, 'set').mockRejectedValue(new Error('Warming error'));
      
      await cacheManager.warmCache();
      
      expect(logger.error).toHaveBeenCalledWith('Cache warming failed:', expect.any(Error));
    });
  });

  describe('memoize decorator', () => {
    it('should cache method results', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');
      
      class TestClass {
        @CacheManager.memoize('test-namespace', 1000)
        async testMethod(arg: string) {
          return mockFn(arg);
        }
      }
      
      const instance = new TestClass();
      
      // First call
      const result1 = await instance.testMethod('arg1');
      expect(result1).toBe('result');
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      // Second call with same args - should use cache
      const result2 = await instance.testMethod('arg1');
      expect(result2).toBe('result');
      expect(mockFn).toHaveBeenCalledTimes(1); // Still 1
      
      // Call with different args
      const result3 = await instance.testMethod('arg2');
      expect(result3).toBe('result');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('close operations', () => {
    it('should close persistent cache connection', async () => {
      const mockClose = vi.fn().mockResolvedValue(undefined);
      const mockLevel = {
        open: vi.fn().mockResolvedValue(undefined),
        close: mockClose,
      };
      
      (Level as any).mockImplementation(() => mockLevel as any);

      cacheManager = new CacheManager({
        maxSize: 100,
        persistent: true,
        dbPath: testCachePath,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      await cacheManager.close();
      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      const mockClose = vi.fn().mockRejectedValue(new Error('Close error'));
      const mockLevel = {
        open: vi.fn().mockResolvedValue(undefined),
        close: mockClose,
      };
      
      (Level as any).mockImplementation(() => mockLevel as any);

      cacheManager = new CacheManager({
        maxSize: 100,
        persistent: true,
        dbPath: testCachePath,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      await cacheManager.close();
      expect(logger.error).toHaveBeenCalledWith('Error closing cache:', expect.any(Error));
    });

    it('should ignore LEVEL_DATABASE_NOT_OPEN errors on close', async () => {
      const mockClose = vi.fn().mockRejectedValue({ code: 'LEVEL_DATABASE_NOT_OPEN' });
      const mockLevel = {
        open: vi.fn().mockResolvedValue(undefined),
        close: mockClose,
      };
      
      (Level as any).mockImplementation(() => mockLevel as any);

      cacheManager = new CacheManager({
        maxSize: 100,
        persistent: true,
        dbPath: testCachePath,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      await cacheManager.close();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});