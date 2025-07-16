import { UnifiedVariantExtractor } from '../../core/extraction/strategies/UnifiedVariantExtractor.js';
import { EnhancedDynamicExtractor } from '../../core/scanner/EnhancedDynamicExtractor.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DocumentNode, parse, print } from 'graphql';

describe('UnifiedVariantExtractor', () => {
  let extractor: UnifiedVariantExtractor;
  let testDir: string;

  beforeEach(async () => {
    extractor = new UnifiedVariantExtractor({
      enableIncrementalExtraction: false, // Disable for tests
    });

    // Create temp directory for test files
    testDir = path.join(__dirname, '.test-unified-extractor');
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Basic Extraction', () => {
    it('should extract a simple GraphQL query', async () => {
      const testFile = path.join(testDir, 'simple.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query = gql\`
          query GetUser {
            user {
              id
              name
            }
          }
        \`;
      `,
      );

      const queries = await extractor.extractFromFile(testFile);

      expect(queries).toHaveLength(1);
      expect(queries[0].name).toBe('GetUser');
      expect(queries[0].type).toBe('query');
      expect(queries[0].content).toContain('user');
    });

    it('should extract multiple queries from a file', async () => {
      const testFile = path.join(testDir, 'multiple.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query1 = gql\`
          query GetUser {
            user { id }
          }
        \`;
        
        const query2 = gql\`
          mutation UpdateUser {
            updateUser { id }
          }
        \`;
      `,
      );

      const queries = await extractor.extractFromFile(testFile);

      expect(queries).toHaveLength(2);
      expect(queries[0].type).toBe('query');
      expect(queries[1].type).toBe('mutation');
    });
  });

  describe('Variant Detection', () => {
    it('should detect and generate variants for fragment conditions', async () => {
      const testFile = path.join(testDir, 'variants.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query = gql\`
          query GetData {
            data {
              id
              ...\${isDetailed ? 'DetailedFragment' : 'BasicFragment'}
            }
          }
        \`;
      `,
      );

      const result = await extractor.extractWithVariants(testDir);

      expect(result.summary.totalVariants).toBe(2);
      expect(result.summary.totalSwitches).toBe(1);
      expect(result.switches.has('isDetailed')).toBe(true);

      const variants = result.variants;
      expect(variants).toHaveLength(2);

      // Check variant with isDetailed=true
      const detailedVariant = variants.find(
        (v) => v.variantMetadata?.conditions.isDetailed === true,
      );
      expect(detailedVariant?.content).toContain('...DetailedFragment');

      // Check variant with isDetailed=false
      const basicVariant = variants.find((v) => v.variantMetadata?.conditions.isDetailed === false);
      expect(basicVariant?.content).toContain('...BasicFragment');
    });

    it('should handle multiple conditions', async () => {
      const testFile = path.join(testDir, 'multiple-conditions.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query = gql\`
          query GetData {
            data {
              id
              ...\${showDetails ? 'Details' : 'Basic'}
              ...\${includeStats ? 'Stats' : 'NoStats'}
            }
          }
        \`;
      `,
      );

      const result = await extractor.extractWithVariants(testDir);

      expect(result.summary.totalVariants).toBe(4); // 2^2 combinations
      expect(result.summary.totalSwitches).toBe(2);

      const conditions = Array.from(result.switches.keys()).sort();
      expect(conditions).toEqual(['includeStats', 'showDetails']);
    });

    it('should handle field-level conditions', async () => {
      const testFile = path.join(testDir, 'field-conditions.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query = gql\`
          query GetData {
            data {
              id
              \${includeEmail ? 'email' : 'username'}
            }
          }
        \`;
      `,
      );

      const result = await extractor.extractWithVariants(testDir);

      expect(result.summary.totalVariants).toBe(2);

      const emailVariant = result.variants.find(
        (v) => v.variantMetadata?.conditions.includeEmail === true,
      );
      expect(emailVariant?.content).toContain('email');
      expect(emailVariant?.content).not.toContain('username');
    });
  });

  describe('Backward Compatibility', () => {
    it('should produce similar results to EnhancedDynamicExtractor', async () => {
      const testFile = path.join(testDir, 'compatibility.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query = gql\`
          query TestQuery {
            data {
              id
              ...\${useAdvanced ? 'AdvancedFields' : 'BasicFields'}
            }
          }
        \`;
      `,
      );

      // Test with old extractor
      const oldExtractor = new EnhancedDynamicExtractor();
      const oldQueries = await oldExtractor.extractFromFile(testFile);

      // Test with new extractor
      const newQueries = await extractor.extractFromFile(testFile);

      // Both should detect variants
      expect(newQueries.length).toBeGreaterThanOrEqual(oldQueries.length);

      // Verify the base query is extracted
      const baseQuery = newQueries.find((q) => !q.variantMetadata);
      expect(baseQuery).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid GraphQL gracefully', async () => {
      const testFile = path.join(testDir, 'invalid.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query = gql\`
          query {
            invalid syntax here
          }
        \`;
      `,
      );

      const queries = await extractor.extractFromFile(testFile);

      // Should still attempt extraction but may return empty or error
      expect(queries).toBeDefined();
      expect(Array.isArray(queries)).toBe(true);
    });

    it('should handle files without GraphQL', async () => {
      const testFile = path.join(testDir, 'no-graphql.ts');
      await fs.writeFile(
        testFile,
        `
        // Just a regular TypeScript file
        export function hello() {
          return 'world';
        }
      `,
      );

      const queries = await extractor.extractFromFile(testFile);

      expect(queries).toHaveLength(0);
    });
  });

  describe('Incremental Extraction', () => {
    it('should use cache on second run', async () => {
      const cacheDir = path.join(testDir, '.cache');
      const cachedExtractor = new UnifiedVariantExtractor({
        enableIncrementalExtraction: true,
        cacheDir,
      });

      const testFile = path.join(testDir, 'cached.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query = gql\`
          query CachedQuery {
            data { id }
          }
        \`;
      `,
      );

      // First extraction
      const queries1 = await cachedExtractor.extractFromFile(testFile);
      expect(queries1).toHaveLength(1);

      // Second extraction should use cache
      const queries2 = await cachedExtractor.extractFromFile(testFile);
      expect(queries2).toEqual(queries1);

      // Verify cache file exists
      const cacheFile = path.join(cacheDir, '.graphql-extraction-cache.json');
      const cacheExists = await fs
        .access(cacheFile)
        .then(() => true)
        .catch(() => false);
      expect(cacheExists).toBe(true);
    });

    it('should invalidate cache when file changes', async () => {
      const cacheDir = path.join(testDir, '.cache');
      const cachedExtractor = new UnifiedVariantExtractor({
        enableIncrementalExtraction: true,
        cacheDir,
      });

      const testFile = path.join(testDir, 'changing.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query = gql\`
          query Version1 {
            data { id }
          }
        \`;
      `,
      );

      // First extraction
      const queries1 = await cachedExtractor.extractFromFile(testFile);
      expect(queries1[0].name).toBe('Version1');

      // Modify file
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query = gql\`
          query Version2 {
            data { id, name }
          }
        \`;
      `,
      );

      // Second extraction should detect change
      const queries2 = await cachedExtractor.extractFromFile(testFile);
      expect(queries2[0].name).toBe('Version2');
      expect(queries2[0].content).toContain('name');
    });
  });

  describe('Variant Report Generation', () => {
    it('should generate comprehensive variant report', async () => {
      const testFile = path.join(testDir, 'report.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query1 = gql\`
          query Query1 {
            data {
              ...\${cond1 ? 'Frag1' : 'Frag2'}
            }
          }
        \`;
        
        const query2 = gql\`
          query Query2 {
            data {
              ...\${cond1 ? 'Frag1' : 'Frag3'}
              ...\${cond2 ? 'Extra' : 'Basic'}
            }
          }
        \`;
      `,
      );

      await extractor.extractFromDirectory(testDir);
      const report = await extractor.generateVariantReport();

      expect(report.conditions).toHaveLength(2);
      expect(report.summary.totalConditions).toBe(2);
      expect(report.summary.totalQueriesWithVariants).toBe(2);
      expect(report.summary.totalPossibleCombinations).toBe(4);

      // Check condition details
      const cond1 = report.conditions.find((c) => c.variable === 'cond1');
      expect(cond1).toBeDefined();
      expect(cond1?.usage).toHaveLength(2); // Used in both queries
    });
  });

  describe('Save Variants', () => {
    it('should save variants to individual files', async () => {
      const testFile = path.join(testDir, 'save.ts');
      await fs.writeFile(
        testFile,
        `
        import { gql } from 'graphql-tag';
        
        const query = gql\`
          query SaveTest {
            data {
              ...\${flag ? 'FragA' : 'FragB'}
            }
          }
        \`;
      `,
      );

      const result = await extractor.extractWithVariants(testDir);
      const outputDir = path.join(testDir, 'output');

      await extractor.saveVariants(outputDir, result.variants);

      // Check files were created
      const files = await fs.readdir(outputDir);
      expect(files.length).toBe(2); // Two variants
      expect(files.every((f) => f.endsWith('.graphql'))).toBe(true);

      // Verify content
      const variant1 = await fs.readFile(path.join(outputDir, files[0]), 'utf-8');
      expect(variant1).toMatch(/query SaveTest/);
      expect(variant1).toMatch(/\.\.\.Frag[AB]/);
    });
  });
});
