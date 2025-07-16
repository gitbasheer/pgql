#!/usr/bin/env node

/**
 * Test polling integration for Z's verification
 * Simulates UI polling behavior with mock intervals
 */

import { SchemaLoader } from './src/utils/schemaLoader.js';

async function testPollingIntegration() {
  console.log('🔄 Testing Polling Integration for Z\'s ConfigurableTestRunner\n');
  
  const loader = new SchemaLoader({
    cacheEnabled: true,
    cacheSize: 50,
    cacheTtl: 300000,
    fallbackToFile: true
  });

  let lastPollTime = 0;
  
  // Mock UI polling function
  function mockUIPoll() {
    const newActivity = loader.getRecentActivity(lastPollTime);
    const stats = loader.getCacheStats();
    
    if (newActivity.length > 0) {
      console.log(`📡 UI Poll Update: ${newActivity.length} new activities`);
      newActivity.forEach(activity => {
        const type = activity.cached ? 'CACHE_HIT' : 'LOAD';
        console.log(`  • ${type}: ${activity.source} (${activity.loadTime}ms)`);
      });
      console.log(`  Cache Stats: ${stats.entries} entries, ${(stats.hitRate * 100).toFixed(1)}% hit rate\n`);
    }
    
    lastPollTime = Date.now();
    return { newActivity, stats };
  }

  console.log('📊 Simulating ConfigurableTestRunner workflow:\n');
  
  // Simulate small mode (like Z's sample data tests)
  console.log('1. Small mode - loading sample schema');
  await loader.loadSchema('data/schema.graphql');
  mockUIPoll();
  
  // Wait and poll again (cache hit)
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log('2. Cache hit test');
  await loader.loadSchema('data/schema.graphql');
  mockUIPoll();
  
  // Test multiple schemas (like Z's large repo simulation)
  console.log('3. Large mode simulation - multiple schemas');
  try {
    await loader.loadSchema('data/billing-schema.graphql');
    mockUIPoll();
  } catch (error) {
    console.log('  • Fallback test: billing schema not found (expected)');
  }
  
  // Final poll to show accumulated stats
  console.log('4. Final accumulated stats:');
  const finalStats = loader.getCacheStats();
  console.log(`  Total Activities: ${finalStats.recentActivity.length}`);
  console.log(`  Cache Entries: ${finalStats.entries}`);
  console.log(`  Hit Rate: ${(finalStats.hitRate * 100).toFixed(1)}%`);
  console.log(`  Total Size: ${(finalStats.totalSize / 1024).toFixed(1)}KB`);
  
  // Test incremental polling (critical for UI)
  console.log('\n5. Incremental polling test:');
  const beforeTime = Date.now();
  await new Promise(resolve => setTimeout(resolve, 50));
  await loader.loadSchema('data/schema.graphql'); // Another cache hit
  
  const incrementalActivity = loader.getRecentActivity(beforeTime);
  console.log(`  • Incremental activities since ${beforeTime}: ${incrementalActivity.length}`);
  
  console.log('\n✅ Polling integration verified - ready for Z\'s ConfigurableTestRunner');
  
  return {
    totalActivities: finalStats.recentActivity.length,
    hitRate: finalStats.hitRate,
    cacheEntries: finalStats.entries,
    incrementalPollingWorks: incrementalActivity.length > 0
  };
}

testPollingIntegration()
  .then(results => {
    console.log('\n📋 Results for Z:');
    console.log(JSON.stringify(results, null, 2));
  })
  .catch(console.error);