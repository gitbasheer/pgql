import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCommand } from '../../cli/compatibility/cli-wrapper.js';
import { OutputAdapter } from '../../cli/compatibility/output-adapter.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

vi.mock('child_process');
vi.mock('fs/promises');

describe('CLI Compatibility Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Output Format Compatibility', () => {
    it('should maintain stable extraction output format across versions', async () => {
      const mockData = {
        timestamp: '2025-01-10T10:00:00Z',
        directory: './src',
        totalQueries: 5,
        queries: [{ id: 'GetUser', name: 'GetUser', content: 'query GetUser { user { id } }' }],
        fragments: [],
        variants: [],
      };

      const adapter = new OutputAdapter({ outputVersion: '1.0' });
      const v1Output = adapter.adaptExtractionOutput(mockData);

      // Test backward compatibility with 0.9
      const legacyAdapter = new OutputAdapter({ outputVersion: '0.9' });
      const v09Output = legacyAdapter.adaptExtractionOutput(mockData);

      // V1 should have all expected fields
      expect(v1Output).toHaveProperty('timestamp');
      expect(v1Output).toHaveProperty('directory');
      expect(v1Output).toHaveProperty('totalQueries', 5);
      expect(v1Output).toHaveProperty('queries');
      expect(v1Output).toHaveProperty('stats');

      // V0.9 should have legacy format
      expect(v09Output).toHaveProperty('queries');
      expect(v09Output).toHaveProperty('total', 5);
      expect(v09Output).not.toHaveProperty('stats');
    });

    it('should handle transformation output versioning', async () => {
      const mockData = {
        timestamp: '2025-01-10T10:00:00Z',
        totalTransformed: 3,
        transformations: [
          { query: 'GetUser', changes: [{ type: 'field', from: 'oldField', to: 'newField' }] },
        ],
      };

      const adapter = new OutputAdapter({ outputVersion: '1.0' });
      const output = adapter.adaptTransformationOutput(mockData);

      expect(output).toHaveProperty('timestamp');
      expect(output).toHaveProperty('totalTransformed', 3);
      expect(output).toHaveProperty('transformations');
      expect(output).toHaveProperty('summary');
    });

    it('should support multiple output formats for validation', async () => {
      const mockData = {
        timestamp: '2025-01-10T10:00:00Z',
        results: { total: 10, valid: 8, invalid: 2 },
        queries: [
          { id: 'Query1', valid: true },
          { id: 'Query2', valid: false, errors: [{ message: 'Field not found' }] },
        ],
      };

      // Test JUnit format
      const junitAdapter = new OutputAdapter({ format: 'junit' });
      const junitOutput = junitAdapter.adaptValidationOutput(mockData);
      expect(junitOutput).toContain('<?xml version="1.0"');
      expect(junitOutput).toContain('<testsuites');

      // Test Markdown format
      const mdAdapter = new OutputAdapter({ format: 'markdown' });
      const mdOutput = mdAdapter.adaptValidationOutput(mockData);
      expect(mdOutput).toContain('# GraphQL Validation Report');
      expect(mdOutput).toContain('## Summary');

      // Test HTML format
      const htmlAdapter = new OutputAdapter({ format: 'html' });
      const htmlOutput = htmlAdapter.adaptValidationOutput(mockData);
      expect(htmlOutput).toContain('<!DOCTYPE html>');
      expect(htmlOutput).toContain('<h1>GraphQL Validation Report</h1>');
    });
  });

  describe('CLI Command Compatibility', () => {
    it('should maintain consistent exit codes', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await executeCommand(['pg-cli', 'extract', './src'], {
        outputVersion: '1.0',
        quiet: true,
      });

      expect(result.exitCode).toBe(0);
      expect(mockSpawn).toHaveBeenCalledWith(
        'pg-cli',
        ['extract', './src'],
        expect.objectContaining({
          env: expect.objectContaining({
            PG_CLI_OUTPUT_VERSION: '1.0',
            PG_CLI_NO_PROGRESS: '1',
            FORCE_COLOR: '0',
          }),
        }),
      );
    });

    it('should handle JSON output mode correctly', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockStdout = '{"totalQueries": 5, "queries": []}';
      const mockProcess = {
        stdout: {
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.from(mockStdout));
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await executeCommand(['pg-cli', 'extract', '--json'], {
        json: true,
      });

      expect(result.stdout).toBe(mockStdout);
      expect(JSON.parse(result.stdout)).toHaveProperty('totalQueries', 5);
    });
  });

  describe('Environment Variable Compatibility', () => {
    it('should respect PG_CLI_OUTPUT_VERSION environment variable', () => {
      process.env.PG_CLI_OUTPUT_VERSION = '0.9';
      const adapter = new OutputAdapter({});

      const mockData = {
        timestamp: '2025-01-10T10:00:00Z',
        totalQueries: 5,
        queries: [],
      };

      const output = adapter.adaptExtractionOutput(mockData);
      expect(output).toHaveProperty('total', 5); // Legacy format

      delete process.env.PG_CLI_OUTPUT_VERSION;
    });

    it('should respect PG_CLI_NO_PROGRESS environment variable', async () => {
      const adapter = new OutputAdapter({
        quiet: process.env.PG_CLI_NO_PROGRESS === '1',
      });

      process.env.PG_CLI_NO_PROGRESS = '1';

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      } as any);

      await executeCommand(['pg-cli', 'extract']);

      expect(mockSpawn).toHaveBeenCalledWith(
        'pg-cli',
        ['extract'],
        expect.objectContaining({
          env: expect.objectContaining({
            PG_CLI_NO_PROGRESS: '1',
          }),
        }),
      );

      delete process.env.PG_CLI_NO_PROGRESS;
    });
  });

  describe('Output Writing Compatibility', () => {
    it('should write JSON to stdout when --json flag is used', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const adapter = new OutputAdapter({ json: true });

      const data = { test: 'data' };
      await adapter.writeOutput(data);

      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
      consoleSpy.mockRestore();
    });

    it('should write to file when output path is specified', async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      const adapter = new OutputAdapter({});

      const data = { test: 'data' };
      await adapter.writeOutput(data, 'output.json');

      expect(mockWriteFile).toHaveBeenCalledWith('output.json', JSON.stringify(data, null, 2));
    });
  });

  describe('Error Handling Compatibility', () => {
    it('should maintain consistent error output format', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockStderr = 'Error: Schema file not found';
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.from(mockStderr));
          }),
        },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(1);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await executeCommand(['pg-cli', 'validate', '-s', 'missing.graphql']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe(mockStderr);
    });
  });
});
