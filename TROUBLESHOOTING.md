# 🔧 Pattern-Based Migration Troubleshooting Guide

## Quick Diagnostics

### 🚨 Pattern Not Detected

**Symptoms:**

- Queries show as "static" when they should be "dynamic patterns"
- `namePattern` is undefined on extracted queries
- No migration recommendations generated

**Solutions:**

1. **Check Pattern Registry Configuration**

   ```bash
   # Run with verbose logging
   npx tsx src/cli/pattern-based-migration.ts analyze --directory ./src --verbose
   ```

2. **Verify queryNames Usage Format**

   ```typescript
   // ✅ CORRECT: This will be detected
   const query = gql`query ${queryNames.byIdV1} { ... }`;

   // ❌ INCORRECT: This won't be detected
   const queryName = queryNames.byIdV1;
   const query = gql`query ${queryName} { ... }`;
   ```

3. **Check Template Literal Structure**

   ```typescript
   // ✅ CORRECT: Direct interpolation
   gql`query ${queryNames.byIdV1} { venture { id } }`;

   // ❌ INCORRECT: Computed property
   gql`query ${queryNames[getVersionKey()]} { venture { id } }`;
   ```

4. **Validate File Patterns**
   ```typescript
   // Ensure your files match the pattern
   {
     patterns: ['**/*.{ts,tsx,js,jsx}'], // Default
     exclude: ['**/node_modules/**']     // Default
   }
   ```

**Debug Commands:**

```bash
# Check what patterns are registered
node -e "
  const { QueryPatternService } = require('./dist/core/extraction');
  const service = new QueryPatternService();
  console.log(JSON.stringify(service.getRegisteredPatterns(), null, 2));
"

# Test specific file
npx tsx src/cli/pattern-based-migration.ts analyze --directory ./src/specific-file.tsx --verbose
```

---

### 🚨 Migration Recommendations Incorrect

**Symptoms:**

- Wrong target versions suggested
- Missing fragment change recommendations
- Deprecation warnings not showing

**Solutions:**

1. **Verify Pattern Registry is Current**

   ```typescript
   // Check if your registry matches your actual queryNames
   const registry = await extraction.getPatternRegistry();
   console.log('Registry patterns:', registry);
   ```

2. **Check Version Detection Logic**

   ```typescript
   // Ensure property naming follows convention
   const queryNames = {
     byIdV1: 'getVentureHomeDataByVentureIdDashboard', // ✅ Detected as V1
     byIdV2: 'getVentureHomeDataByVentureIdDashboardV2', // ✅ Detected as V2
     byIdV3: 'getVentureHomeDataByVentureIdDashboardV3', // ✅ Detected as V3
     byIdCustom: 'customQuery', // ❌ Version not detected
   };
   ```

3. **Update Pattern Registry**

   ```typescript
   // Add custom patterns to registry
   const patternService = new QueryPatternService();
   // Override with custom registry if needed
   ```

4. **Check Migration Manifest**
   ```typescript
   const manifest = await extraction.getMigrationManifest();
   console.log('Migration rules:', manifest.patterns);
   ```

**Debug Commands:**

```bash
# Check migration recommendations for specific query
npx tsx -e "
  const { PatternAwareExtraction } = require('./dist/core/extraction');
  const extraction = new PatternAwareExtraction({ directory: './src' });
  // ... test specific query
"
```

---

### 🚨 Performance Issues

**Symptoms:**

- Slow pattern analysis
- High memory usage
- Cache misses

**Solutions:**

1. **Enable and Tune Caching**

   ```typescript
   import { createQueryServices } from './src/core/extraction';

   const services = await createQueryServices({
     options: { directory: './src' },
     enableCaching: true,
     cacheMaxSize: 100 * 1024 * 1024, // 100MB
     cacheTTL: 3600000, // 1 hour
   });
   ```

2. **Check Cache Performance**

   ```typescript
   const stats = await extraction.getCacheStats();
   console.log('Cache stats:', stats);

   // Look for:
   // - Low hit rate (< 80%)
   // - High memory usage
   // - Frequent evictions
   ```

3. **Optimize File Patterns**

   ```typescript
   // Be more specific to reduce files processed
   {
     patterns: ['src/components/**/*.tsx'], // Instead of '**/*.tsx'
     exclude: [
       '**/node_modules/**',
       '**/dist/**',
       '**/*.test.*',
       '**/*.spec.*'
     ]
   }
   ```

4. **Use Incremental Extraction**
   ```typescript
   const options = {
     directory: './src',
     enableIncrementalExtraction: true, // Only process changed files
   };
   ```

**Monitor Commands:**

```bash
# Monitor memory usage
node --max-old-space-size=4096 your-script.js

# Profile performance
node --prof your-script.js
```

---

### 🚨 Service Initialization Errors

**Symptoms:**

- "Service not initialized" errors
- Factory creation failures
- Undefined service references

**Solutions:**

1. **Use Factory Pattern Correctly**

   ```typescript
   // ✅ CORRECT: Use factory
   import { createDefaultQueryServices } from './src/core/extraction';
   const services = await createDefaultQueryServices(options);

   // ❌ INCORRECT: Manual instantiation
   const patternService = new QueryPatternService();
   const namingService = new QueryNamingService(patternService);
   ```

2. **Ensure Async Initialization**

   ```typescript
   // ✅ CORRECT: Await initialization
   const extraction = new PatternAwareExtraction(options);
   const result = await extraction.extract(); // Handles initialization

   // ❌ INCORRECT: Synchronous access
   const extraction = new PatternAwareExtraction(options);
   extraction.getPatternRegistry(); // Error: not initialized
   ```

3. **Handle Initialization Errors**
   ```typescript
   try {
     const extraction = new PatternAwareExtraction(options);
     const result = await extraction.extract();
   } catch (error) {
     if (error.message.includes('not initialized')) {
       // Handle initialization failure
       logger.error('Service initialization failed:', error);
     }
   }
   ```

**Debug Commands:**

```bash
# Test service factory
npx tsx -e "
  const { createDefaultQueryServices } = require('./dist/core/extraction');
  createDefaultQueryServices({ directory: './src' })
    .then(services => console.log('Services created:', Object.keys(services)))
    .catch(err => console.error('Factory failed:', err));
"
```

---

### 🚨 Type Errors

**Symptoms:**

- TypeScript compilation errors
- Missing type definitions
- Import resolution failures

**Solutions:**

1. **Check Type Imports**

   ```typescript
   // ✅ CORRECT: Import types and runtime
   import {
     PatternAwareExtraction,
     QueryServicesConfig,
     PatternExtractedQuery,
   } from './src/core/extraction';

   // ❌ INCORRECT: Missing types
   const extraction = new PatternAwareExtraction(options); // Type error
   ```

2. **Verify TypeScript Configuration**

   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "moduleResolution": "node",
       "allowSyntheticDefaultImports": true,
       "esModuleInterop": true
     }
   }
   ```

3. **Check Build Output**

   ```bash
   # Ensure dist/ directory is up to date
   npm run build

   # Check type definitions exist
   ls dist/core/extraction/types/
   ```

**Debug Commands:**

```bash
# Check TypeScript compilation
npx tsc --noEmit --project ./tsconfig.json

# Verify type exports
npx tsx -e "
  const types = require('./dist/core/extraction/types');
  console.log('Available types:', Object.keys(types));
"
```

---

## 📊 Diagnostics Commands

### Health Check Script

```typescript
// health-check.ts
import { PatternAwareExtraction } from './src/core/extraction';

async function healthCheck() {
  console.log('🔍 Pattern-Based Migration Health Check\n');

  try {
    // Test basic extraction
    const extraction = new PatternAwareExtraction({
      directory: './src',
      patterns: ['**/*.{ts,tsx}'],
    });

    // Test cache
    const cacheStats = await extraction.getCacheStats();
    console.log('✅ Cache Status:', cacheStats);

    // Test pattern registry
    const registry = await extraction.getPatternRegistry();
    console.log('✅ Pattern Registry:', Object.keys(registry));

    // Test small extraction
    const result = await extraction.extract();
    console.log('✅ Extraction:', {
      queries: result.extraction.queries.length,
      migrations: result.migration.summary.needsMigration,
    });

    console.log('\n🎉 Health check passed!');
  } catch (error) {
    console.error('❌ Health check failed:', error);
    process.exit(1);
  }
}

healthCheck();
```

### Performance Profiling

```bash
# Create performance profile
node --prof --prof-process npx tsx health-check.ts

# Analyze memory usage
node --inspect npx tsx health-check.ts
# Then connect Chrome DevTools
```

### Cache Analysis

```typescript
// cache-analysis.ts
import { PatternAwareExtraction } from './src/core/extraction';

async function analyzeCachePerformance() {
  const extraction = new PatternAwareExtraction({
    directory: './src',
    patterns: ['**/*.tsx'],
  });

  // Run extraction twice to test caching
  console.time('First run (cold cache)');
  await extraction.extract();
  console.timeEnd('First run (cold cache)');

  console.time('Second run (warm cache)');
  await extraction.extract();
  console.timeEnd('Second run (warm cache)');

  const stats = await extraction.getCacheStats();
  console.log('Cache performance:', stats);
}
```

---

## 🔗 Quick Reference Links

- **Pattern Registry**: `src/core/extraction/engine/QueryPatternRegistry.ts`
- **Service Factory**: `src/core/extraction/services/QueryServicesFactory.ts`
- **Main CLI**: `src/cli/pattern-based-migration.ts`
- **Integration Tests**: `src/test/integration/PatternBasedIntegration.test.ts`

---

## 📞 Getting Help

1. **Enable Debug Logging**

   ```bash
   DEBUG=pattern-migration* npx tsx your-script.ts
   ```

2. **Check Integration Tests**

   ```bash
   npm test src/test/integration/PatternBasedIntegration.test.ts
   ```

3. **Run Demo Mode**

   ```bash
   npx tsx src/cli/pattern-based-migration.ts demo
   ```

4. **Create Minimal Reproduction**

   ```typescript
   // minimal-repro.ts
   import { PatternAwareExtraction } from './src/core/extraction';

   const extraction = new PatternAwareExtraction({
     directory: './test-files', // Small test directory
     patterns: ['*.tsx'],
   });

   extraction
     .extract()
     .then((result) => console.log('Success:', result))
     .catch((error) => console.error('Error:', error));
   ```

Remember: The pattern-based system is designed to **preserve your application logic** while providing **safe migration guidance**. When in doubt, check that your queries maintain their `${queryNames.property}` structure! 🎯
