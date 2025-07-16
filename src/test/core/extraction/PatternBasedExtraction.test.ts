import { describe, it, expect, beforeEach } from 'vitest';
import { QueryPatternService } from '../../../core/extraction/engine/QueryPatternRegistry.js';
import { QueryMigrator } from '../../../core/extraction/engine/QueryMigrator.js';
import { PatternAwareASTStrategy } from '../../../core/extraction/strategies/PatternAwareASTStrategy.js';
import { PatternExtractedQuery } from '../../../core/extraction/types/pattern.types.js';

describe('Pattern-Based Extraction', () => {
  let patternService: QueryPatternService;
  let migrator: QueryMigrator;
  let strategy: PatternAwareASTStrategy;

  beforeEach(() => {
    patternService = new QueryPatternService();
    migrator = new QueryMigrator(patternService);
    strategy = new PatternAwareASTStrategy(patternService);
  });

  describe('QueryPatternService', () => {
    it('should detect pattern queries correctly', async () => {
      const mockQuery: PatternExtractedQuery = {
        id: 'test-1',
        filePath: '/test/file.ts',
        content: 'query ${queryNames.byIdV1} { venture { id name } }',
        ast: null,
        location: { line: 1, column: 1, file: '/test/file.ts' },
        type: 'query',
        sourceAST: {
          node: {} as any,
          start: 0,
          end: 50,
          templateLiteral: {
            quasis: [
              { value: { raw: 'query ', cooked: 'query ' } } as any,
              {
                value: { raw: ' { venture { id name } }', cooked: ' { venture { id name } }' },
              } as any,
            ],
            expressions: [
              {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: 'queryNames' },
                property: { type: 'Identifier', name: 'byIdV1' },
              } as any,
            ],
          },
          parent: {} as any,
        },
      };

      const result = patternService.analyzeQueryPattern(mockQuery);

      expect(result.namePattern).toBeDefined();
      expect(result.namePattern?.template).toBe('${queryNames.byIdV1}');
      expect(result.namePattern?.version).toBe('V1');
      expect(result.namePattern?.isDeprecated).toBe(true);
      expect(result.namePattern?.migrationPath).toBe('V3');
      expect(result.contentFingerprint).toBeDefined();
    });

    it('should generate content fingerprints for duplicate detection', () => {
      const query1: PatternExtractedQuery = {
        id: 'test-1',
        filePath: '/test/file1.ts',
        content: 'query ${queryNames.byIdV1} { venture { id name } }',
        ast: null,
        location: { line: 1, column: 1, file: '/test/file1.ts' },
        type: 'query',
      };

      const query2: PatternExtractedQuery = {
        id: 'test-2',
        filePath: '/test/file2.ts',
        content: 'query ${queryNames.byIdV2} { venture { id name } }',
        ast: null,
        location: { line: 10, column: 1, file: '/test/file2.ts' },
        type: 'query',
      };

      const fingerprint1 = patternService.generateContentFingerprint(query1);
      const fingerprint2 = patternService.generateContentFingerprint(query2);

      // Same structure, different patterns - should have same fingerprint
      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should group queries by fingerprint', () => {
      const queries: PatternExtractedQuery[] = [
        {
          id: 'test-1',
          filePath: '/test/file1.ts',
          content: 'query ${queryNames.byIdV1} { venture { id } }',
          ast: null,
          location: { line: 1, column: 1, file: '/test/file1.ts' },
          type: 'query',
          contentFingerprint: 'abc123',
        },
        {
          id: 'test-2',
          filePath: '/test/file2.ts',
          content: 'query ${queryNames.byIdV2} { venture { id } }',
          ast: null,
          location: { line: 1, column: 1, file: '/test/file2.ts' },
          type: 'query',
          contentFingerprint: 'abc123',
        },
        {
          id: 'test-3',
          filePath: '/test/file3.ts',
          content: 'query ${queryNames.byIdV1} { venture { name } }',
          ast: null,
          location: { line: 1, column: 1, file: '/test/file3.ts' },
          type: 'query',
          contentFingerprint: 'def456',
        },
      ];

      const groups = patternService.groupByFingerprint(queries);

      expect(groups.size).toBe(2);
      expect(groups.get('abc123')).toHaveLength(2);
      expect(groups.get('def456')).toHaveLength(1);
    });
  });

  describe('QueryMigrator', () => {
    it('should preserve application logic for pattern queries', async () => {
      const query: PatternExtractedQuery = {
        id: 'test-1',
        filePath: '/test/file.ts',
        content: 'query ${queryNames.byIdV1} { venture { id name } }',
        ast: null,
        location: { line: 1, column: 1, file: '/test/file.ts' },
        type: 'query',
        namePattern: {
          template: '${queryNames.byIdV1}',
          resolvedName: 'getVentureHomeDataByVentureIdDashboard',
          possibleValues: [
            'getVentureHomeDataByVentureIdDashboard',
            'getVentureHomeDataByVentureIdDashboardV3',
          ],
          patternKey: 'getVentureById',
          version: 'V1',
          isDeprecated: true,
          migrationPath: 'V3',
        },
      };

      const result = await migrator.migrateQuery(query);

      expect(result.query.content).toBe('query ${queryNames.byIdV1} { venture { id name } }');
      expect(result.migrationNotes.action).toBe('Update queryNames object');
      expect(result.migrationNotes.currentVersion).toBe('V1');
      expect(result.migrationNotes.targetVersion).toBe('V3');
      expect(result.migrationNotes.changes).toHaveLength(2); // queryNames + fragment
    });

    it('should generate queryNames object updates', async () => {
      const queries: PatternExtractedQuery[] = [
        {
          id: 'test-1',
          filePath: '/test/file.ts',
          content: 'query ${queryNames.byIdV1} { venture { id } }',
          ast: null,
          location: { line: 1, column: 1, file: '/test/file.ts' },
          type: 'query',
          namePattern: {
            template: '${queryNames.byIdV1}',
            resolvedName: 'getVentureHomeDataByVentureIdDashboard',
            possibleValues: [],
            patternKey: 'getVentureById',
            version: 'V1',
            isDeprecated: true,
            migrationPath: 'V3',
          },
        },
      ];

      const results = await migrator.migrateQueries(queries);
      const updates = migrator.generateQueryNamesUpdates(results);

      expect(updates.changes).toHaveLength(1);
      expect(updates.changes[0].property).toBe('byIdV1');
      expect(updates.changes[0].reason).toContain('deprecated');
    });

    it('should provide migration summary', async () => {
      const queries: PatternExtractedQuery[] = [
        {
          id: 'test-1',
          filePath: '/test/file.ts',
          content: 'query ${queryNames.byIdV1} { venture { id } }',
          ast: null,
          location: { line: 1, column: 1, file: '/test/file.ts' },
          type: 'query',
          namePattern: {
            template: '${queryNames.byIdV1}',
            resolvedName: 'getVentureHomeDataByVentureIdDashboard',
            possibleValues: [],
            patternKey: 'getVentureById',
            version: 'V1',
            isDeprecated: true,
            migrationPath: 'V3',
          },
        },
        {
          id: 'test-2',
          filePath: '/test/file2.ts',
          content: 'query getStaticQuery { venture { id } }',
          ast: null,
          location: { line: 1, column: 1, file: '/test/file2.ts' },
          type: 'query',
        },
      ];

      const results = await migrator.migrateQueries(queries);
      const summary = migrator.generateMigrationSummary(results);

      expect(summary.totalQueries).toBe(2);
      expect(summary.patternBasedMigrations).toBe(1);
      expect(summary.staticMigrations).toBe(0);
      expect(summary.versionProgression['V1 → V3']).toBe(1);
    });
  });

  describe('Benefits over normalization approach', () => {
    it('should preserve dynamic query selection logic', () => {
      const originalQuery = 'query ${queryNames.byIdV1} { venture { id } }';

      // Old approach would normalize to:
      // 'query getVentureHomeDataByVentureIdDashboard { venture { id } }'

      // New approach preserves:
      const query: PatternExtractedQuery = {
        id: 'test-1',
        filePath: '/test/file.ts',
        content: originalQuery,
        ast: null,
        location: { line: 1, column: 1, file: '/test/file.ts' },
        type: 'query',
      };

      const analyzed = patternService.analyzeQueryPattern(query);

      // Query content is preserved
      expect(analyzed.content).toBe(originalQuery);

      // But we track the pattern metadata
      expect(analyzed.namePattern?.template).toBe('${queryNames.byIdV1}');
      expect(analyzed.contentFingerprint).toBeDefined();
    });

    it('should enable safe migration recommendations', () => {
      const query: PatternExtractedQuery = {
        id: 'test-1',
        filePath: '/test/file.ts',
        content: 'query ${queryNames.byIdV1} { venture { id } }',
        ast: null,
        location: { line: 1, column: 1, file: '/test/file.ts' },
        type: 'query',
        namePattern: {
          template: '${queryNames.byIdV1}',
          resolvedName: 'getVentureHomeDataByVentureIdDashboard',
          possibleValues: [],
          patternKey: 'getVentureById',
          version: 'V1',
          isDeprecated: true,
          migrationPath: 'V3',
        },
      };

      const recommendations = patternService.getMigrationRecommendations(query);

      expect(recommendations.shouldMigrate).toBe(true);
      expect(recommendations.targetPattern).toBe('queryNames.byIdV3');
      expect(recommendations.fragmentChanges).toEqual({
        from: 'ventureFields',
        to: 'ventureInfinityStoneDataFields',
      });
    });

    it('should handle version progression correctly', () => {
      const registry = patternService.getRegisteredPatterns();
      const venturePattern = registry['getVentureById'];

      expect(venturePattern.versions).toEqual(['V1', 'V2', 'V3', 'V3Airo']);
      expect(venturePattern.deprecations.V1).toBe('Use V3');
      expect(venturePattern.deprecations.V2).toBe('Use V3');
      expect(venturePattern.conditions.V3).toEqual(['infinityStoneEnabled']);
    });
  });
});
