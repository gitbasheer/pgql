/** @fileoverview Large schema scalability tests using billing-schema.graphql */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SchemaLoader } from '../../utils/schemaLoader.js';
import { SchemaDeprecationAnalyzer } from '../../core/analyzer/SchemaDeprecationAnalyzer.js';
import { ResponseValidationService } from '../../core/validator/ResponseValidationService.js';
import { UnifiedExtractor } from '../../core/extraction/engine/UnifiedExtractor.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Large Schema Scalability Tests', () => {
  let schemaLoader: SchemaLoader;
  let analyzer: SchemaDeprecationAnalyzer;
  let validator: ResponseValidationService;
  let billingSchemaPath: string;
  let largeQuerySet: string[];

  beforeAll(async () => {
    // Initialize with production-like settings
    schemaLoader = SchemaLoader.getInstance({
      cacheEnabled: true,
      cacheSize: 100, // 100MB for large schemas
      cacheTtl: 3600000, // 1 hour
      fallbackToFile: true,
      enableWarmup: true
    });

    analyzer = new SchemaDeprecationAnalyzer();
    validator = new ResponseValidationService();
    
    // Use billing-schema.graphql as our large schema test case
    billingSchemaPath = path.join('data', 'billing-schema.graphql');
    
    // Generate 1000+ test queries for scalability testing
    largeQuerySet = generateLargeQuerySet(1000);
  });

  afterAll(() => {
    // Clear cache after tests
    schemaLoader.clearCache();
  });

  describe('Schema Loading Performance', () => {
    it('should load billing-schema.graphql efficiently', async () => {
      const startTime = Date.now();
      
      // First load (cold cache)
      const result1 = await schemaLoader.loadSchema(billingSchemaPath);
      const coldLoadTime = Date.now() - startTime;
      
      expect(result1.schema).toBeDefined();
      expect(result1.cached).toBe(false);
      expect(coldLoadTime).toBeLessThan(100); // Should load in under 100ms
      
      // Second load (warm cache)
      const startTime2 = Date.now();
      const result2 = await schemaLoader.loadSchema(billingSchemaPath);
      const warmLoadTime = Date.now() - startTime2;
      
      expect(result2.cached).toBe(true);
      expect(warmLoadTime).toBeLessThan(1); // Cached load should be instant
      
      // Performance improvement should be significant
      const improvement = coldLoadTime / warmLoadTime;
      expect(improvement).toBeGreaterThan(50); // At least 50x faster
    });

    it('should handle concurrent schema loading requests', async () => {
      // Clear cache for clean test
      schemaLoader.clearCache();
      
      // Launch 50 concurrent requests
      const concurrentRequests = 50;
      const startTime = Date.now();
      
      const promises = Array(concurrentRequests).fill(null).map(() => 
        schemaLoader.loadSchema(billingSchemaPath)
      );
      
      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All should succeed
      results.forEach(result => {
        expect(result.schema).toBeDefined();
      });
      
      // Only first should be uncached
      const uncachedCount = results.filter(r => !r.cached).length;
      expect(uncachedCount).toBe(1);
      
      // Should complete efficiently despite concurrency
      expect(totalTime).toBeLessThan(200); // Under 200ms for 50 requests
    });

    it('should maintain memory efficiency with large schemas', async () => {
      // Get initial memory usage
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Load multiple large schemas
      const schemaPaths = [
        'data/billing-schema.graphql',
        'data/schema.graphql',
        'data/deprecations-schema.graphql'
      ];
      
      for (const schemaPath of schemaPaths) {
        await schemaLoader.loadSchema(schemaPath);
      }
      
      // Check memory usage
      const currentMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (currentMemory - initialMemory) / 1024 / 1024; // MB
      
      // Should use less than 50MB for all schemas
      expect(memoryIncrease).toBeLessThan(50);
      
      // Check cache stats
      const stats = schemaLoader.getCacheStats();
      expect(stats.entries).toBe(3);
      expect(stats.totalSize).toBeLessThan(50 * 1024 * 1024); // 50MB
    });

    it('should handle LRU cache eviction properly', async () => {
      // Create a loader with small cache
      const smallCacheLoader = SchemaLoader.getInstance({
        cacheEnabled: true,
        cacheSize: 1, // 1MB - very small
        cacheTtl: 3600000
      });
      
      // Load schemas that exceed cache size
      const schemas = [];
      for (let i = 0; i < 5; i++) {
        schemas.push(await smallCacheLoader.loadSchema(billingSchemaPath));
      }
      
      const stats = smallCacheLoader.getCacheStats();
      // Should have evicted old entries
      expect(stats.entries).toBeLessThanOrEqual(2); // Small cache can hold 1-2 schemas
      expect(stats.totalSize).toBeLessThan(1024 * 1024); // Under 1MB
    });
  });

  describe('Query Validation at Scale', () => {
    it('should validate 1000+ queries efficiently', async () => {
      const schema = await schemaLoader.loadSchema(billingSchemaPath);
      
      const startTime = Date.now();
      const validationResults = await Promise.all(
        largeQuerySet.map(query => 
          validator.validateQuery(query, schema.schema)
        )
      );
      const totalTime = Date.now() - startTime;
      
      // All queries should validate
      const validCount = validationResults.filter(r => r.valid).length;
      expect(validCount).toBe(largeQuerySet.length);
      
      // Should complete in reasonable time
      const timePerQuery = totalTime / largeQuerySet.length;
      expect(timePerQuery).toBeLessThan(1); // Under 1ms per query
      
      console.log(`Validated ${largeQuerySet.length} queries in ${totalTime}ms (${timePerQuery.toFixed(2)}ms per query)`);
    });

    it('should handle batch processing efficiently', async () => {
      const schema = await schemaLoader.loadSchema(billingSchemaPath);
      const batchSize = 50;
      
      // Process queries in batches
      const startTime = Date.now();
      const results = [];
      
      for (let i = 0; i < largeQuerySet.length; i += batchSize) {
        const batch = largeQuerySet.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(query => validator.validateQuery(query, schema.schema))
        );
        results.push(...batchResults);
        
        // Simulate batch processing delay
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const totalTime = Date.now() - startTime;
      
      expect(results.length).toBe(largeQuerySet.length);
      expect(totalTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should scale with parallel processing', async () => {
      const schema = await schemaLoader.loadSchema(billingSchemaPath);
      
      // Test different concurrency levels
      const concurrencyLevels = [1, 5, 10, 20];
      const timings = {};
      
      for (const concurrency of concurrencyLevels) {
        const startTime = Date.now();
        
        // Process with limited concurrency
        const results = [];
        for (let i = 0; i < largeQuerySet.length; i += concurrency) {
          const batch = largeQuerySet.slice(i, i + concurrency);
          const batchResults = await Promise.all(
            batch.map(query => validator.validateQuery(query, schema.schema))
          );
          results.push(...batchResults);
        }
        
        timings[concurrency] = Date.now() - startTime;
      }
      
      // Higher concurrency should be faster
      expect(timings[20]).toBeLessThan(timings[1]);
      expect(timings[10]).toBeLessThan(timings[5]);
      
      // But with diminishing returns
      const speedup = timings[1] / timings[20];
      expect(speedup).toBeGreaterThan(5); // At least 5x speedup
      expect(speedup).toBeLessThan(20); // But not linear (diminishing returns)
    });
  });

  describe('Deprecation Analysis at Scale', () => {
    it('should analyze large schemas for deprecations efficiently', async () => {
      const startTime = Date.now();
      
      const deprecations = await analyzer.analyzeSchema(billingSchemaPath);
      
      const analysisTime = Date.now() - startTime;
      
      expect(deprecations).toBeDefined();
      expect(analysisTime).toBeLessThan(1000); // Should complete in under 1 second
      
      // Billing schema should have known deprecations
      expect(deprecations.length).toBeGreaterThan(0);
      
      // Check deprecation structure
      deprecations.forEach(dep => {
        expect(dep).toHaveProperty('field');
        expect(dep).toHaveProperty('type');
        expect(dep).toHaveProperty('reason');
      });
    });

    it('should transform 1000+ queries based on deprecations', async () => {
      const deprecations = await analyzer.analyzeSchema(billingSchemaPath);
      const transformer = new OptimizedSchemaTransformer();
      
      const startTime = Date.now();
      
      // Transform all queries
      const transformationResults = await Promise.all(
        largeQuerySet.map(query => 
          transformer.transformQuery(query, deprecations)
        )
      );
      
      const totalTime = Date.now() - startTime;
      
      // Check results
      const transformedCount = transformationResults.filter(r => r.transformed).length;
      expect(transformedCount).toBeGreaterThan(0); // Some queries should be transformed
      
      // Performance check
      const timePerTransformation = totalTime / largeQuerySet.length;
      expect(timePerTransformation).toBeLessThan(2); // Under 2ms per query
      
      console.log(`Transformed ${transformedCount}/${largeQuerySet.length} queries in ${totalTime}ms`);
    });
  });

  describe('Memory and Resource Management', () => {
    it('should handle memory pressure gracefully', async () => {
      // Simulate memory pressure by loading many queries
      const memoryPressureTest = async () => {
        const queries = generateLargeQuerySet(5000); // 5000 queries
        const results = [];
        
        for (const query of queries) {
          const parsed = await validator.parseQuery(query);
          results.push(parsed);
          
          // Check memory periodically
          if (results.length % 500 === 0) {
            const memUsage = process.memoryUsage();
            const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
            
            // Should stay under 500MB even with 5000 queries
            expect(heapUsedMB).toBeLessThan(500);
          }
        }
        
        return results;
      };
      
      await expect(memoryPressureTest()).resolves.toHaveLength(5000);
    });

    it('should recover from cache timeouts', async () => {
      // Create loader with short TTL
      const shortTTLLoader = SchemaLoader.getInstance({
        cacheEnabled: true,
        cacheTtl: 100 // 100ms TTL
      });
      
      // Load schema
      const result1 = await shortTTLLoader.loadSchema(billingSchemaPath);
      expect(result1.cached).toBe(false);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should reload from file
      const result2 = await shortTTLLoader.loadSchema(billingSchemaPath);
      expect(result2.cached).toBe(false); // Cache expired, had to reload
      
      // Activity tracking should show both loads
      const activity = shortTTLLoader.getRecentActivity();
      expect(activity.length).toBeGreaterThanOrEqual(2);
    });
  });
});

/**
 * Generate a large set of test queries for scalability testing
 */
function generateLargeQuerySet(count: number): string[] {
  const queries = [];
  const operations = ['query', 'mutation', 'subscription'];
  const fields = ['id', 'name', 'email', 'status', 'billing', 'subscription', 'plan'];
  
  for (let i = 0; i < count; i++) {
    const operation = operations[i % operations.length];
    const fieldCount = (i % 5) + 1; // 1-5 fields per query
    const selectedFields = fields.slice(0, fieldCount).join('\n    ');
    
    const query = `
      ${operation} TestQuery${i} {
        ${operation === 'query' ? 'user' : 'updateUser'}(id: "${i}") {
          ${selectedFields}
        }
      }
    `;
    
    queries.push(query);
  }
  
  return queries;
}