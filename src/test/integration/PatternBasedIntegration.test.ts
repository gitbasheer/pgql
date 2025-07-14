import { describe, it, expect, beforeEach } from 'vitest';
import { PatternAwareExtraction } from '../../core/extraction/PatternAwareExtraction';
import { QueryNamingService } from '../../core/extraction/services/QueryNamingService';
import { QueryPatternService } from '../../core/extraction/engine/QueryPatternRegistry';
import { QueryMigrator } from '../../core/extraction/engine/QueryMigrator';
import { ExtractionContext } from '../../core/extraction/engine/ExtractionContext';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Pattern-Based Integration Test', () => {
  let tempDir: string;
  let testFiles: string[];

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'pattern-test-'));
    testFiles = [];
  });

  afterEach(async () => {
    // Cleanup test files
    for (const file of testFiles) {
      try {
        await fs.promises.unlink(file);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    try {
      await fs.promises.rmdir(tempDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  const createTestFile = async (filename: string, content: string): Promise<string> => {
    const filePath = path.join(tempDir, filename);
    await fs.promises.writeFile(filePath, content, 'utf-8');
    testFiles.push(filePath);
    return filePath;
  };

  describe('End-to-End Pattern-Based Migration', () => {
    it('should handle complete pattern-based extraction and migration workflow', async () => {
      // Create test files with various query patterns
      await createTestFile('component1.tsx', `
import { gql } from '@apollo/client';

const GET_VENTURE_DATA = gql\`
  query \${queryNames.byIdV1} {
    venture(id: $ventureId) {
      ...ventureFields
    }
  }
\`;

const GET_VENTURE_STATIC = gql\`
  query getVentureStatic {
    venture {
      id
      name
    }
  }
\`;
      `);

      await createTestFile('component2.tsx', `
import { gql } from '@apollo/client';

const GET_VENTURE_V2 = gql\`
  query \${queryNames.byIdV2} {
    venture(id: $ventureId) {
      ...ventureFields
    }
  }
\`;

// Duplicate query with different pattern
const GET_VENTURE_DUPLICATE = gql\`
  query \${queryNames.byIdV3} {
    venture(id: $ventureId) {
      ...ventureFields
    }
  }
\`;
      `);

      // Run pattern-aware extraction
      const extraction = new PatternAwareExtraction({
        directory: tempDir,
        patterns: ['**/*.tsx'],
        resolveNames: true,
        preserveSourceAST: true
      });

      const result = await extraction.extract();
      const { extraction: extractionResult, migration } = result;

      // Verify extraction results
      expect(extractionResult.queries.length).toBeGreaterThan(0);

      // Check pattern detection
      const patternQueries = extractionResult.queries.filter((q: any) => q.namePattern);
      const staticQueries = extractionResult.queries.filter((q: any) => !q.namePattern);

      expect(patternQueries.length).toBe(3); // byIdV1, byIdV2, byIdV3
      expect(staticQueries.length).toBe(1); // getVentureStatic

      // Verify pattern analysis
      const v1Query = patternQueries.find((q: any) => q.namePattern?.version === 'V1');
      const v2Query = patternQueries.find((q: any) => q.namePattern?.version === 'V2');
      const v3Query = patternQueries.find((q: any) => q.namePattern?.version === 'V3');

      expect(v1Query).toBeDefined();
      expect(v1Query.namePattern.isDeprecated).toBe(true);
      expect(v1Query.namePattern.migrationPath).toBe('V3');

      expect(v2Query).toBeDefined();
      expect(v2Query.namePattern.isDeprecated).toBe(true);
      expect(v2Query.namePattern.migrationPath).toBe('V3');

      expect(v3Query).toBeDefined();
      expect(v3Query.namePattern.isDeprecated).toBe(false);

      // Verify migration recommendations
      expect(migration.summary.totalQueries).toBe(4);
      expect(migration.summary.needsMigration).toBe(2); // V1 and V2
      expect(migration.summary.patternBasedMigrations).toBe(2);
      expect(migration.summary.staticMigrations).toBe(0);

      // Check version progression
      expect(migration.summary.versionProgression['V1 → V3']).toBe(1);
      expect(migration.summary.versionProgression['V2 → V3']).toBe(1);

      // Verify queryNames updates
      expect(migration.queryNamesUpdates.changes.length).toBe(2);

      const v1Update = migration.queryNamesUpdates.changes.find(c => c.property === 'byIdV1');
      const v2Update = migration.queryNamesUpdates.changes.find(c => c.property === 'byIdV2');

      expect(v1Update).toBeDefined();
      expect(v1Update.reason).toContain('deprecated');
      expect(v2Update).toBeDefined();
      expect(v2Update.reason).toContain('deprecated');
    });

    it('should detect duplicates using content fingerprinting', async () => {
      // Create files with identical query structures but different patterns
      await createTestFile('dup1.tsx', `
import { gql } from '@apollo/client';

const QUERY_A = gql\`
  query \${queryNames.byIdV1} {
    venture {
      id
      name
    }
  }
\`;
      `);

      await createTestFile('dup2.tsx', `
import { gql } from '@apollo/client';

const QUERY_B = gql\`
  query \${queryNames.byIdV2} {
    venture {
      id
      name
    }
  }
\`;
      `);

      const extraction = new PatternAwareExtraction({
        directory: tempDir,
        patterns: ['**/*.tsx'],
        resolveNames: true
      });

      const duplicates = await extraction.analyzeDuplicates();

      // Should find one group of duplicates
      const duplicateGroups = Array.from(duplicates.entries()).filter(([_, queries]) => queries.length > 1);
      expect(duplicateGroups.length).toBe(1);

      const [fingerprint, duplicateQueries] = duplicateGroups[0];
      expect(duplicateQueries.length).toBe(2);

      // Both queries should have different patterns but same structure
      const patterns = duplicateQueries.map(q => q.namePattern?.version).filter(Boolean);
      expect(patterns).toContain('V1');
      expect(patterns).toContain('V2');
    });
  });

  describe('Service Integration', () => {
    it('should integrate QueryNamingService with ExtractionContext', async () => {
      const patternService = new QueryPatternService();
      const namingService = new QueryNamingService(patternService);

      const context = new ExtractionContext({
        directory: tempDir,
        resolveNames: true
      }, namingService);

      // Initialize naming service
      await context.initializeQueryNaming();

      // Get the integrated service
      const retrievedService = context.getQueryNamingService();
      expect(retrievedService).toBe(namingService);
      expect(retrievedService.isInitialized()).toBe(true);
    });

    it('should handle migration workflow through services', async () => {
      const patternService = new QueryPatternService();
      const migrator = new QueryMigrator(patternService);

      // Create mock queries
      const queries = [
        {
          id: 'test-1',
          filePath: '/test/file1.ts',
          content: 'query ${queryNames.byIdV1} { venture { id } }',
          ast: null,
          location: { line: 1, column: 1, file: '/test/file1.ts' },
          type: 'query' as const,
          namePattern: {
            template: '${queryNames.byIdV1}',
            resolvedName: 'getVentureHomeDataByVentureIdDashboard',
            possibleValues: [],
            patternKey: 'getVentureById',
            version: 'V1',
            isDeprecated: true,
            migrationPath: 'V3'
          }
        }
      ];

      // Test migration workflow
      const results = await migrator.migrateQueries(queries);
      const summary = migrator.generateMigrationSummary(results);
      const updates = migrator.generateQueryNamesUpdates(results);

      expect(results.length).toBe(1);
      expect(results[0].migrationNotes.action).toBe('Update queryNames object');
      expect(summary.patternBasedMigrations).toBe(1);
      expect(updates.changes.length).toBe(1);
    });
  });

  describe('Benefits Verification', () => {
    it('should preserve application logic for dynamic queries', async () => {
      await createTestFile('dynamic.tsx', `
import { gql } from '@apollo/client';

const GET_VENTURE = gql\`
  query \${queryNames.byIdV1} {
    venture(id: $ventureId) {
      id
      name
    }
  }
\`;
      `);

      const extraction = new PatternAwareExtraction({
        directory: tempDir,
        patterns: ['**/*.tsx'],
        resolveNames: true
      });

      const result = await extraction.extract();
      const patternQuery = result.extraction.queries.find((q: any) => q.namePattern);

      // Verify the query content is preserved exactly
      expect(patternQuery.content).toContain('${queryNames.byIdV1}');
      expect(patternQuery.content).not.toContain('getVentureHomeDataByVentureIdDashboard');

      // But pattern metadata is captured
      expect(patternQuery.namePattern.template).toBe('${queryNames.byIdV1}');
      expect(patternQuery.namePattern.resolvedName).toBe('getVentureHomeDataByVentureIdDashboard');
    });

    it('should handle versioning and feature flags correctly', async () => {
      const extraction = new PatternAwareExtraction({
        directory: tempDir,
        patterns: ['**/*.tsx'],
        resolveNames: true
      });

      const registry = extraction.getPatternRegistry();
      const venturePattern = registry['getVentureById'];

      // Verify version handling
      expect(venturePattern.versions).toEqual(['V1', 'V2', 'V3', 'V3Airo']);
      expect(venturePattern.deprecations.V1).toBe('Use V3');
      expect(venturePattern.deprecations.V2).toBe('Use V3');

      // Verify feature flag conditions
      expect(venturePattern.conditions.V3).toEqual(['infinityStoneEnabled']);
      expect(venturePattern.conditions.V3Airo).toEqual(['infinityStoneEnabled', 'airoFeatureEnabled']);

      // Verify fragment mapping
      expect(venturePattern.fragments.V1).toBe('ventureFields');
      expect(venturePattern.fragments.V3).toBe('ventureInfinityStoneDataFields');
    });

    it('should provide safe migration recommendations', async () => {
      await createTestFile('migration.tsx', `
import { gql } from '@apollo/client';

const OLD_QUERY = gql\`
  query \${queryNames.byIdV1} {
    venture {
      ...ventureFields
    }
  }
\`;
      `);

      const extraction = new PatternAwareExtraction({
        directory: tempDir,
        patterns: ['**/*.tsx'],
        resolveNames: true
      });

      const result = await extraction.extract();
      const query = result.extraction.queries.find((q: any) => q.namePattern?.version === 'V1');

      const recommendations = extraction.getMigrationRecommendations([query]);
      const recommendation = recommendations[0].recommendations;

      expect(recommendation.shouldMigrate).toBe(true);
      expect(recommendation.targetPattern).toBe('queryNames.byIdV3');
      expect(recommendation.fragmentChanges).toEqual({
        from: 'ventureFields',
        to: 'ventureInfinityStoneDataFields'
      });
    });
  });
});
