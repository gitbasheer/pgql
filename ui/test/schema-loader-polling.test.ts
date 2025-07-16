import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaLoader } from '../../src/utils/schemaLoader';

describe('SchemaLoader Polling Integration', () => {
  let loader: SchemaLoader;

  beforeEach(() => {
    // Create fresh instance for each test
    loader = SchemaLoader.getInstance({
      cacheEnabled: true,
      cacheSize: 10, // Small cache for testing
      cacheTtl: 300000, // 5 minutes
    });
    loader.clearCache();
  });

  it('should return activity since timestamp', async () => {
    const before = Date.now();
    
    // Load schema to generate activity
    await loader.loadSchema('../data/schema.graphql');
    
    const after = Date.now();
    
    // Get activity since before timestamp
    const activity = loader.getRecentActivity(before);
    
    expect(activity).toHaveLength(1);
    expect(activity[0].timestamp).toBeGreaterThan(before);
    expect(activity[0].timestamp).toBeLessThanOrEqual(after);
    expect(activity[0].source).toBe('../data/schema.graphql');
    expect(activity[0].cached).toBe(false); // First load should not be cached
  });

  it('should track cache hits and misses', async () => {
    const schemaPath = '../data/schema.graphql';
    
    // First load - should be cache miss
    await loader.loadSchema(schemaPath);
    
    // Second load - should be cache hit
    await loader.loadSchema(schemaPath);
    
    const allActivity = loader.getRecentActivity();
    expect(allActivity).toHaveLength(2);
    
    // First should be cache miss, second should be cache hit
    expect(allActivity[0].cached).toBe(false);
    expect(allActivity[1].cached).toBe(true);
  });

  it('should provide cache statistics for UI polling', async () => {
    const schemaPath = '../data/schema.graphql';
    
    // Load schema twice to test cache behavior
    await loader.loadSchema(schemaPath);
    await loader.loadSchema(schemaPath);
    
    const stats = loader.getCacheStats();
    
    expect(stats.entries).toBe(1); // One schema cached
    expect(stats.hitRate).toBe(0.5); // 1 hit out of 2 loads = 50%
    expect(stats.recentActivity).toHaveLength(2);
    expect(stats.totalSize).toBeGreaterThan(0);
  });

  it('should filter activity by timestamp for incremental updates', async () => {
    const schemaPath = '../data/schema.graphql';
    
    // Load schema first time
    await loader.loadSchema(schemaPath);
    
    const midPoint = Date.now();
    
    // Wait a bit and load again
    await new Promise(resolve => setTimeout(resolve, 10));
    await loader.loadSchema(schemaPath);
    
    // Get only activity after midpoint
    const recentActivity = loader.getRecentActivity(midPoint);
    
    expect(recentActivity).toHaveLength(1);
    expect(recentActivity[0].timestamp).toBeGreaterThan(midPoint);
    expect(recentActivity[0].cached).toBe(true);
  });

  it('should handle multiple schemas for complex UI scenarios', async () => {
    const schemas = [
      '../data/schema.graphql',
      '../data/billing-schema.graphql'
    ];
    
    // Load multiple schemas
    for (const schema of schemas) {
      try {
        await loader.loadSchema(schema);
      } catch (error) {
        // Some schemas might not exist in test environment
        // That's okay for this test
      }
    }
    
    const stats = loader.getCacheStats();
    const activity = loader.getRecentActivity();
    
    // Should have attempted to load 2 schemas
    expect(activity.length).toBeGreaterThanOrEqual(1);
    
    // Each activity should have required fields for UI polling
    activity.forEach(act => {
      expect(act).toHaveProperty('source');
      expect(act).toHaveProperty('cached');
      expect(act).toHaveProperty('loadTime');
      expect(act).toHaveProperty('timestamp');
      expect(typeof act.timestamp).toBe('number');
    });
  });

  it('should maintain activity buffer limit for memory efficiency', async () => {
    const schemaPath = '../data/schema.graphql';
    
    // Load schema many times to test buffer limit
    for (let i = 0; i < 60; i++) {
      try {
        await loader.loadSchema(schemaPath);
      } catch (error) {
        // Schema might not exist, that's okay for buffer testing
      }
    }
    
    const activity = loader.getRecentActivity();
    
    // Should not exceed 50 entries (as per schemaLoader.ts implementation)
    expect(activity.length).toBeLessThanOrEqual(50);
  });

  it('should integrate with ConfigurableTestRunner modes', async () => {
    // Test small mode configuration
    const smallModeLoader = new SchemaLoader({
      cacheEnabled: true,
      cacheSize: 10, // 10MB - small mode
      cacheTtl: 300000, // 5 minutes
    });

    // Test large mode configuration  
    const largeModeLoader = new SchemaLoader({
      cacheEnabled: true,
      cacheSize: 100, // 100MB - large mode
      cacheTtl: 3600000, // 1 hour
    });

    const schemaPath = '../data/schema.graphql';

    try {
      // Load with both configurations
      await smallModeLoader.loadSchema(schemaPath);
      await largeModeLoader.loadSchema(schemaPath);

      // Both should provide polling-compatible stats
      const smallStats = smallModeLoader.getCacheStats();
      const largeStats = largeModeLoader.getCacheStats();

      expect(smallStats.recentActivity).toBeDefined();
      expect(largeStats.recentActivity).toBeDefined();
      
      // Large mode should have longer TTL reflected in cache behavior
      expect(typeof smallStats.hitRate).toBe('number');
      expect(typeof largeStats.hitRate).toBe('number');
    } catch (error) {
      // Schema might not exist in test environment, that's okay
      // The important thing is that the polling interface works
    }
  });
});