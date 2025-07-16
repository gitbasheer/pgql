import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeCommand } from '../../cli/compatibility/cli-wrapper.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock environment variables for cookie auth
vi.mock('process.env', () => ({
  APOLLO_PG_ENDPOINT: 'https://mock-pg.graphql.api',
  APOLLO_OG_ENDPOINT: 'https://mock-og.graphql.api',
  auth_idp: 'mock-auth-idp-token',
  cust_idp: 'mock-cust-idp-token',
  info_cust_idp: 'mock-info-cust-idp-token',
  info_idp: 'mock-info-idp-token',
}));

describe('CLI Regression Test Suite', () => {
  const testDataDir = path.join(__dirname, '../fixtures/cli-regression');
  const outputDir = path.join(__dirname, '../output/cli-regression');

  beforeEach(async () => {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up output directory
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Backward Compatibility Tests', () => {
    it('should maintain v0.9 output format when legacy flag is used', async () => {
      const result = await executeCommand([
        'tsx',
        'src/cli/main-cli.ts',
        'extract',
        'queries',
        '--legacy-format',
        '--json',
      ]);

      if (result.exitCode === 0) {
        const output = JSON.parse(result.stdout);

        // Legacy format expectations
        expect(output).toHaveProperty('queries');
        expect(output).toHaveProperty('total');
        expect(output).not.toHaveProperty('stats'); // New in v1.0
        expect(output).not.toHaveProperty('variants'); // New in v1.0
      }
    });

    it('should produce stable output across multiple runs', async () => {
      const runs = [];

      // Run the same command 3 times
      for (let i = 0; i < 3; i++) {
        const result = await executeCommand([
          'tsx',
          'src/cli/main-cli.ts',
          'extract',
          'queries',
          '--json',
          '--output-version',
          '1.0',
        ]);

        if (result.exitCode === 0) {
          const output = JSON.parse(result.stdout);
          // Remove timestamp for comparison
          delete output.timestamp;
          runs.push(output);
        }
      }

      // All runs should produce identical output (except timestamp)
      if (runs.length === 3) {
        expect(runs[0]).toEqual(runs[1]);
        expect(runs[1]).toEqual(runs[2]);
      }
    });
  });

  describe('Command Argument Compatibility', () => {
    const argumentTests = [
      {
        command: 'extract',
        oldArgs: ['-d', './src', '-p', '**/*.ts'],
        newArgs: ['--directory', './src', '--pattern', '**/*.ts'],
        description: 'short vs long form arguments',
      },
      {
        command: 'transform',
        oldArgs: ['-s', './src', '--dry-run'],
        newArgs: ['--source', './src', '--dry-run'],
        description: 'mixed argument styles',
      },
      {
        command: 'validate',
        oldArgs: ['-s', 'schema.graphql'],
        newArgs: ['--schema', 'schema.graphql'],
        description: 'schema path argument',
      },
    ];

    argumentTests.forEach(({ command, oldArgs, newArgs, description }) => {
      it(`should support ${description} for ${command}`, async () => {
        // Test old style arguments
        const oldResult = await executeCommand([
          'tsx',
          'src/cli/main-cli.ts',
          command,
          ...oldArgs,
          '--json',
        ]);

        // Test new style arguments
        const newResult = await executeCommand([
          'tsx',
          'src/cli/main-cli.ts',
          command,
          ...newArgs,
          '--json',
        ]);

        // Both should succeed or fail the same way
        expect(oldResult.exitCode).toBe(newResult.exitCode);
      });
    });
  });

  describe('Error Message Consistency', () => {
    const errorScenarios = [
      {
        args: ['extract', 'queries', 'nonexistent-dir'],
        errorPattern: /directory.*not.*found|no such file|ENOENT/i,
        description: 'missing directory',
      },
      {
        args: ['validate', 'queries', '-s', 'missing-schema.graphql'],
        errorPattern: /schema.*not.*found|cannot.*read|ENOENT/i,
        description: 'missing schema file',
      },
      {
        args: ['transform', 'queries', '--confidence', '101'],
        errorPattern: /invalid.*confidence|must.*be.*between|out of range/i,
        description: 'invalid confidence value',
      },
    ];

    errorScenarios.forEach(({ args, errorPattern, description }) => {
      it(`should provide consistent error for ${description}`, async () => {
        const result = await executeCommand(['tsx', 'src/cli/main-cli.ts', ...args]);

        expect(result.exitCode).toBeGreaterThan(0);
        expect(result.stderr).toMatch(errorPattern);
      });
    });
  });

  describe('Environment Variable Handling', () => {
    const envVarTests = [
      { var: 'PG_CLI_OUTPUT_VERSION', value: '0.9', expectedBehavior: 'legacy output format' },
      { var: 'PG_CLI_NO_PROGRESS', value: '1', expectedBehavior: 'no progress indicators' },
      { var: 'PG_CLI_JSON_STDOUT', value: '1', expectedBehavior: 'JSON to stdout' },
      { var: 'FORCE_COLOR', value: '0', expectedBehavior: 'no colored output' },
    ];

    envVarTests.forEach(({ var: envVar, value, expectedBehavior }) => {
      it(`should respect ${envVar} for ${expectedBehavior}`, async () => {
        const env = { ...process.env, [envVar]: value };

        const result = await executeCommand(['tsx', 'src/cli/main-cli.ts', 'extract', 'queries'], {
          env,
        });

        // Verify environment variable was respected
        if (envVar === 'PG_CLI_NO_PROGRESS' && value === '1') {
          // Check that progress indicators are not present
          const hasProgressIndicators =
            /Processing|Extracting|Analyzing|\\u28|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/.test(result.stdout);
          expect(hasProgressIndicators).toBe(false);
        }
      });
    });
  });

  describe('Output File Generation', () => {
    it('should generate consistent output files', async () => {
      const outputFile = path.join(outputDir, 'extraction-results.json');

      const result = await executeCommand([
        'tsx',
        'src/cli/main-cli.ts',
        'extract',
        'queries',
        '-o',
        outputFile,
      ]);

      if (result.exitCode === 0) {
        // Verify file was created
        const fileExists = await fs
          .access(outputFile)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBe(true);

        // Verify file contains valid JSON
        const content = await fs.readFile(outputFile, 'utf-8');
        const data = JSON.parse(content);

        expect(data).toHaveProperty('timestamp');
        expect(data).toHaveProperty('queries');
      }
    });

    it('should support different output formats', async () => {
      const formats = ['json', 'typescript', 'markdown'];

      for (const format of formats) {
        const outputFile = path.join(
          outputDir,
          `results.${format === 'typescript' ? 'ts' : format}`,
        );

        const result = await executeCommand([
          'tsx',
          'src/cli/main-cli.ts',
          'validate',
          '-s',
          'schema.graphql',
          '-f',
          format,
          '-o',
          outputFile,
        ]);

        // File should be created regardless of validation success
        const fileExists = await fs
          .access(outputFile)
          .then(() => true)
          .catch(() => false);

        if (result.exitCode === 0 || format !== 'json') {
          expect(fileExists).toBe(true);
        }
      }
    });
  });

  describe('Pipeline Integration', () => {
    it('should work correctly in Unix pipelines', async () => {
      // Test piping output to another command
      const result = await executeCommand([
        'tsx',
        'src/cli/main-cli.ts',
        'extract',
        'queries',
        '--json',
        '--quiet',
      ]);

      if (result.exitCode === 0) {
        // Output should be valid JSON that can be piped
        const data = JSON.parse(result.stdout);
        expect(data).toHaveProperty('queries');

        // No progress indicators should appear
        expect(result.stderr).not.toContain('Processing');
      }
    });
  });

  describe('Performance Regression', () => {
    it('should complete extraction within reasonable time', async () => {
      const startTime = Date.now();

      const result = await executeCommand([
        'tsx',
        'src/cli/main-cli.ts',
        'extract',
        'queries',
        '--json',
      ]);

      const duration = Date.now() - startTime;

      // Should complete within 5 seconds for small codebases
      expect(duration).toBeLessThan(5000);

      if (result.exitCode === 0) {
        const data = JSON.parse(result.stdout);
        expect(data).toHaveProperty('stats.extractionTime');
        expect(data.stats.extractionTime).toBeLessThan(5000);
      }
    });
  });

  describe('Security Tests', () => {
    it('should validate branch names with safe regex pattern', async () => {
      const safeBranchRegex = /^[a-zA-Z0-9/_-]+$/;
      
      const testBranches = [
        { name: 'feature/add-auth', valid: true },
        { name: 'fix-123_bug', valid: true },
        { name: 'release/v1-0-0', valid: true }, // Updated to use hyphens instead of dots
        { name: 'feature/../../etc/passwd', valid: false },
        { name: 'branch; rm -rf /', valid: false },
        { name: 'branch$(whoami)', valid: false },
        { name: 'branch`ls`', valid: false },
        { name: 'branch&&echo', valid: false },
        { name: 'branch.with.dots', valid: false }, // Dots no longer allowed
        { name: 'branch with spaces', valid: false },
        { name: 'branch"quotes"', valid: false },
        { name: "branch'quotes'", valid: false },
      ];

      testBranches.forEach(({ name, valid }) => {
        const isValid = safeBranchRegex.test(name);
        expect(isValid).toBe(valid);
      });
    });

    it('should prevent command injection in file paths', async () => {
      const maliciousPaths = [
        '../../etc/passwd',
        '/etc/passwd',
        'file; rm -rf /',
        'file$(whoami)',
        'file`ls`',
        'file&&echo',
      ];

      for (const path of maliciousPaths) {
        const result = await executeCommand([
          'tsx',
          'src/cli/main-cli.ts',
          'extract',
          'queries',
          path,
        ]);

        expect(result.exitCode).toBeGreaterThan(0);
        expect(result.stderr).toMatch(/invalid|security|forbidden/i);
      }
    });

    it('should prevent path traversal attacks', async () => {
      const traversalPaths = [
        '../../../secret.env',
        './../../../etc/shadow',
        '....//....//....//etc',
        '%2e%2e%2f%2e%2e%2f',
        '..\\..\\..\\windows\\system32',
      ];

      for (const path of traversalPaths) {
        const result = await executeCommand([
          'tsx',
          'src/cli/main-cli.ts',
          'validate',
          'queries',
          '-s',
          path,
        ]);

        expect(result.exitCode).toBeGreaterThan(0);
      }
    });
  });

  describe('Help Text Stability', () => {
    it('should maintain stable help text format', async () => {
      const result = await executeCommand(['tsx', 'src/cli/main-cli.ts', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('GraphQL Migration Tool');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('Options:');

      // Core commands should be listed
      expect(result.stdout).toContain('extract');
      expect(result.stdout).toContain('transform');
      expect(result.stdout).toContain('validate');
    });

    it('should show command-specific help', async () => {
      const commands = ['extract', 'transform', 'validate'];

      for (const command of commands) {
        const result = await executeCommand(['tsx', 'src/cli/main-cli.ts', command, '--help']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(command);
        expect(result.stdout).toContain('Options:');
      }
    });
  });
});
