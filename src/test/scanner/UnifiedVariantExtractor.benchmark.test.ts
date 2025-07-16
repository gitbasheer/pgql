import { UnifiedVariantExtractor } from '../../core/extraction/strategies/UnifiedVariantExtractor.js';
import { EnhancedDynamicExtractor } from '../../core/scanner/EnhancedDynamicExtractor.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('UnifiedVariantExtractor Performance Benchmark', () => {
  let testDir: string;
  const NUM_FILES = 50;
  const QUERIES_PER_FILE = 5;

  beforeAll(async () => {
    // Create test directory with many files
    testDir = path.join(__dirname, '.benchmark-test');
    await fs.mkdir(testDir, { recursive: true });

    // Generate test files
    for (let i = 0; i < NUM_FILES; i++) {
      let fileContent = `import { gql } from 'graphql-tag';\n\n`;

      for (let j = 0; j < QUERIES_PER_FILE; j++) {
        fileContent += `
          const query${j} = gql\`
            query TestQuery${i}_${j} {
              data {
                id
                name
                ...\${condition${j % 3} ? 'Fragment${j}A' : 'Fragment${j}B'}
                \${showExtra${j % 2} ? 'extraField' : 'basicField'}
              }
            }
          \`;
        `;
      }

      await fs.writeFile(path.join(testDir, `file${i}.ts`), fileContent);
    }
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should perform better than EnhancedDynamicExtractor', async () => {
    // Benchmark old extractor
    const oldExtractor = new EnhancedDynamicExtractor();
    const oldStart = Date.now();
    const oldQueries = await oldExtractor.extractFromDirectory(testDir);
    const oldTime = Date.now() - oldStart;

    // Benchmark new extractor (without cache)
    const newExtractor = new UnifiedVariantExtractor({
      enableIncrementalExtraction: false,
    });
    const newStart = Date.now();
    const newQueries = await newExtractor.extractFromDirectory(testDir);
    const newTime = Date.now() - newStart;

    console.log(`Old Extractor: ${oldTime}ms for ${oldQueries.length} queries`);
    console.log(`New Extractor: ${newTime}ms for ${newQueries.length} queries`);
    console.log(`Performance improvement: ${(((oldTime - newTime) / oldTime) * 100).toFixed(1)}%`);

    // New should be at least as fast
    expect(newTime).toBeLessThanOrEqual(oldTime * 1.1); // Allow 10% margin

    // Should extract similar number of queries
    expect(newQueries.length).toBeGreaterThanOrEqual(oldQueries.length * 0.9);
  });

  it('should show significant improvement with incremental extraction', async () => {
    const cacheDir = path.join(testDir, '.cache');
    const cachedExtractor = new UnifiedVariantExtractor({
      enableIncrementalExtraction: true,
      cacheDir,
    });

    // First run - no cache
    const firstStart = Date.now();
    const firstQueries = await cachedExtractor.extractFromDirectory(testDir);
    const firstTime = Date.now() - firstStart;

    // Second run - with cache
    const secondStart = Date.now();
    const secondQueries = await cachedExtractor.extractFromDirectory(testDir);
    const secondTime = Date.now() - secondStart;

    console.log(`First run (no cache): ${firstTime}ms`);
    console.log(`Second run (cached): ${secondTime}ms`);
    console.log(`Cache speedup: ${(((firstTime - secondTime) / firstTime) * 100).toFixed(1)}%`);

    // Cached run should be much faster
    expect(secondTime).toBeLessThan(firstTime * 0.2); // At least 80% faster
    expect(secondQueries).toEqual(firstQueries);
  });

  it('should handle partial cache invalidation efficiently', async () => {
    const cacheDir = path.join(testDir, '.cache-partial');
    const cachedExtractor = new UnifiedVariantExtractor({
      enableIncrementalExtraction: true,
      cacheDir,
    });

    // First run
    await cachedExtractor.extractFromDirectory(testDir);

    // Modify one file
    const modifiedFile = path.join(testDir, 'file0.ts');
    const content = await fs.readFile(modifiedFile, 'utf-8');
    await fs.writeFile(modifiedFile, content + '\n// Modified');

    // Second run - should only reprocess modified file
    const start = Date.now();
    const queries = await cachedExtractor.extractFromDirectory(testDir);
    const time = Date.now() - start;

    console.log(`Partial invalidation time: ${time}ms`);

    // Should be much faster than full extraction
    expect(time).toBeLessThan(100); // Should be very fast for single file
    expect(queries.length).toBeGreaterThan(0);
  });
});
