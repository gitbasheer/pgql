import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MigrationValidator } from '../../cli/validate-migration.js';
import { ExtractedQuery } from '../../types/index.js';
import { PatternExtractedQuery } from '../../core/extraction/types/pattern.types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Override global fs mock with a smarter one that tracks file content
const fileStorage = new Map<string, string>();

vi.mock('fs/promises', async () => ({
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockImplementation((filePath: string) => {
    const content = fileStorage.get(filePath);
    return Promise.resolve(
      content || '{"queries": [], "metadata": {"timestamp": "2024-01-01T00:00:00.000Z"}}',
    );
  }),
  writeFile: vi.fn().mockImplementation((filePath: string, content: string) => {
    fileStorage.set(filePath, content);
    return Promise.resolve();
  }),
  mkdir: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue('/tmp/mock-temp-dir'),
  rm: vi.fn().mockImplementation((filePath: string) => {
    fileStorage.delete(filePath);
    return Promise.resolve();
  }),
  rmdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
  access: vi.fn().mockResolvedValue(undefined),
}));

describe('MigrationValidator', () => {
  let validator: MigrationValidator;
  let tempDir: string;
  let beforeFile: string;
  let afterFile: string;

  beforeEach(async () => {
    validator = new MigrationValidator();
    tempDir = '/tmp/test-dir-123'; // Use mock temp directory
    beforeFile = path.join(tempDir, 'before-queries.json');
    afterFile = path.join(tempDir, 'after-queries.json');

    // Clear mock filesystem
    (globalThis as any).clearMockFileSystem?.();
  });

  afterEach(async () => {
    // Cleanup handled by mock filesystem
    (globalThis as any).clearMockFileSystem?.();
  });

  describe('validateMigration', () => { type: 'query',
    it('should pass validation when queries are identical', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(queries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(queries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('passed');
      expect(report.summary.matchedQueries).toBe(1);
      expect(report.summary.missingQueries).toBe(0);
      expect(report.summary.extraQueries).toBe(0);
      expect(report.issues).toHaveLength(0);
    });

    it('should detect missing queries', async () => { type: 'query',
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
        { type: 'query',
          id: 'query2',
          name: 'GetVenture',
          source: 'query GetVenture { venture { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      const afterQueries: ExtractedQuery[] = [
        { type: 'query',
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(beforeQueries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(afterQueries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('failed');
      expect(report.summary.missingQueries).toBe(1);
      expect(report.issues).toHaveLength(1);
      expect(report.issues[0].type).toBe('missing');
      expect(report.issues[0].severity).toBe('error');
      expect(report.issues[0].queryId).toBe('query2');
    });

    it('should detect extra queries', async () => { type: 'query',
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      const afterQueries: ExtractedQuery[] = [
        { type: 'query',
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
        { type: 'query',
          id: 'query2',
          name: 'GetVenture',
          source: 'query GetVenture { venture { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(beforeQueries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(afterQueries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('warning');
      expect(report.summary.extraQueries).toBe(1);
      expect(report.issues).toHaveLength(1);
      expect(report.issues[0].type).toBe('extra');
      expect(report.issues[0].severity).toBe('warning');
    });

    it('should detect name changes', async () => { type: 'query',
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      const afterQueries: ExtractedQuery[] = [
        { type: 'query',
          id: 'query1',
          name: 'GetUserNew',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(beforeQueries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(afterQueries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('warning');
      expect(report.summary.modifiedQueries).toBe(1);
      expect(report.issues.find((i) => i.type === 'naming')).toBeDefined();
      expect(report.issues.find((i) => i.type === 'naming')?.message).toContain('GetUser');
      expect(report.issues.find((i) => i.type === 'naming')?.message).toContain('GetUserNew');
    });

    it('should detect structural changes', async () => { type: 'query',
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      const afterQueries: ExtractedQuery[] = [
        { type: 'query',
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name email } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(beforeQueries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(afterQueries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('warning');
      expect(report.issues.find((i) => i.type === 'structural')).toBeDefined();
      expect(report.issues.find((i) => i.type === 'structural')?.message).toContain(
        'structure changed',
      );
    });

    it('should detect type changes as errors', async () => { type: 'query',
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      const afterQueries: ExtractedQuery[] = [
        { type: 'query',
          id: 'query1',
          name: 'GetUser',
          source: 'mutation GetUser { user { id name } }',
          type: 'mutation',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(beforeQueries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(afterQueries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('failed');
      expect(report.issues.find((i) => i.severity === 'error')).toBeDefined();
      expect(report.issues.find((i) => i.message.includes('type changed'))).toBeDefined();
    });

    it('should handle strict mode', async () => { type: 'query',
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      const afterQueries: ExtractedQuery[] = [
        { type: 'query',
          id: 'query1',
          name: 'GetUserNew',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(beforeQueries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(afterQueries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
        strictMode: true,
      });

      expect(report.status).toBe('failed');
      expect(report.issues.find((i) => i.severity === 'error')).toBeDefined();
    });

    it('should validate pattern-specific fields', async () => { type: 'query',
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query ${queryNames.getUserById} { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      const afterQueries: PatternExtractedQuery[] = [
        { type: 'query',
          id: 'query1',
          name: 'GetUser',
          source: 'query ${queryNames.getUserById} { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
          namePattern: '${queryNames.getUserById}',
          resolvedName: 'GetUser',
          contentFingerprint: 'abc123',
          patternMetadata: {
            isDynamic: true,
            hasInterpolation: true,
            confidence: 1.0,
          },
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(beforeQueries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(afterQueries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('passed');
      expect(report.summary.matchedQueries).toBe(1);
    });

    it('should detect interpolation detection mismatch', async () => { type: 'query',
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query ${queryNames.getUserById} { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      const afterQueries: PatternExtractedQuery[] = [
        { type: 'query',
          id: 'query1',
          name: 'GetUser',
          source: 'query ${queryNames.getUserById} { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
          namePattern: '${queryNames.getUserById}',
          resolvedName: 'GetUser',
          contentFingerprint: 'abc123',
          patternMetadata: {
            isDynamic: true,
            hasInterpolation: false, // Mismatch here
            confidence: 1.0,
          },
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(beforeQueries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(afterQueries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('warning');
      expect(
        report.issues.find((i) => i.message.includes('Interpolation detection mismatch')),
      ).toBeDefined();
    });

    it('should handle different file formats', async () => { type: 'query',
      const beforeData = {
        queries: [
          {
            id: 'query1',
            name: 'GetUser',
            source: 'query GetUser { user { id name } }',
            type: 'query',
            filePath: 'test.ts',
            fragments: [],
          },
        ],
      };

      const afterData = { type: 'query',
        extractedQueries: [
          {
            id: 'query1',
            name: 'GetUser',
            source: 'query GetUser { user { id name } }',
            type: 'query',
            filePath: 'test.ts',
            fragments: [],
          },
        ],
      };

      await fs.writeFile(beforeFile, JSON.stringify(beforeData), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(afterData), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('passed');
      expect(report.summary.matchedQueries).toBe(1);
    });

    it('should generate detailed report file', async () => { type: 'query',
      const queries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(queries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(queries), 'utf-8');

      const reportFile = path.join(tempDir, 'validation-report.json');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
        output: reportFile,
      });

      expect(report.status).toBe('passed');

      // Check report file was created
      const reportContent = await fs.readFile(reportFile, 'utf-8');
      const savedReport = JSON.parse(reportContent);
      expect(savedReport.status).toBe('passed');
      expect(savedReport.summary.matchedQueries).toBe(1);
    });

    it('should handle malformed JSON gracefully', async () => {
      await fs.writeFile(beforeFile, 'invalid json', 'utf-8');
      await fs.writeFile(afterFile, '[]', 'utf-8');

      await expect(
        validator.validateMigration({
          before: beforeFile,
          after: afterFile,
        }),
      ).rejects.toThrow();
    });

    it('should measure performance', async () => {
      const queries: ExtractedQuery[] = Array.from({ length: 50 }, (_, i) => ({
        id: `query${i}`,
        name: `GetQuery${i}`,
        source: `query GetQuery${i} { data${i} { id } }`,
        type: 'query',
        filePath: 'test.ts',
        fragments: [],
      }));

      await fs.writeFile(beforeFile, JSON.stringify(queries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(queries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.performance.validationTime).toBeGreaterThan(0);
      expect(report.performance.queriesPerSecond).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty query arrays', async () => {
      await fs.writeFile(beforeFile, JSON.stringify([]), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify([]), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('passed');
      expect(report.summary.totalQueries).toBe(0);
    });

    it('should handle queries with no names', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: undefined,
          source: 'query { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(queries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(queries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('passed');
    });

    it('should handle content fingerprint matching', async () => { type: 'query',
      const beforeQueries: ExtractedQuery[] = [
        {
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
        },
      ];

      const afterQueries: PatternExtractedQuery[] = [
        { type: 'query',
          id: 'query1',
          name: 'GetUser',
          source: 'query GetUser { user { id name } }',
          type: 'query',
          filePath: 'test.ts',
          fragments: [],
          namePattern: undefined,
          resolvedName: 'GetUser',
          contentFingerprint: 'fingerprint123',
          patternMetadata: {
            isDynamic: false,
            hasInterpolation: false,
            confidence: 1.0,
          },
        },
      ];

      await fs.writeFile(beforeFile, JSON.stringify(beforeQueries), 'utf-8');
      await fs.writeFile(afterFile, JSON.stringify(afterQueries), 'utf-8');

      const report = await validator.validateMigration({
        before: beforeFile,
        after: afterFile,
      });

      expect(report.status).toBe('passed');
    });
  });
});
