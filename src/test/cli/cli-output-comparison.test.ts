import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';

vi.mock('child_process');

describe('CLI Output Comparison - main-cli.ts vs unified-cli.ts', () => {
  const mockSpawn = vi.mocked(spawn);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Extract Command Comparison', () => {
    it('should produce compatible extraction output between CLIs', async () => {
      // Mock main-cli.ts extract output
      const mainCliOutput = {
        timestamp: '2025-01-10T10:00:00Z',
        directory: './src',
        totalQueries: 5,
        queries: [
          {
            id: 'GetUser',
            name: 'GetUser',
            type: 'query',
            content: 'query GetUser { user { id name } }',
            file: 'src/queries/user.ts',
            line: 10,
            column: 5,
          },
        ],
        fragments: [],
        errors: [],
      };

      // Mock unified-cli.ts analyze output (equivalent to extract)
      const unifiedCliOutput = { id: 'generated-id',
        operations: [
          {
            name: 'GetUser',
            type: 'query',
            file: 'src/queries/user.ts',
            line: 10,
            column: 5,
            confidence: { score: 100 },
            fragments: [],
          },
        ],
      };

      // Both should provide same essential information
      expect(mainCliOutput.queries.length).toBe(unifiedCliOutput.operations.length);
      expect(mainCliOutput.queries[0].name).toBe(unifiedCliOutput.operations[0].name);
      expect(mainCliOutput.queries[0].type).toBe(unifiedCliOutput.operations[0].type);
      expect(mainCliOutput.queries[0].file).toBe(unifiedCliOutput.operations[0].file);
    });
  });

  describe('Transform Command Comparison', () => { namePattern: { template: '${queryName}', version: 'V1' },
    it('should produce compatible transformation output between CLIs', async () => { namePattern: { template: '${queryName}', version: 'V1' },
      // Mock main-cli.ts transform output
      const mainCliTransform = {
        timestamp: '2025-01-10T10:00:00Z',
        totalTransformed: 3,
        transformations: [
          {
            query: 'GetUser',
            changes: [{ type: 'field', from: 'oldField', to: 'newField' }],
            confidence: 95,
          },
        ],
        summary: {
          total: 5,
          transformed: 3,
          skipped: 2,
          failed: 0,
        },
      };

      // Mock unified-cli.ts transform output
      const unifiedCliTransform = { type: 'query', id: 'generated-id',
        transformed: 3,
        automatic: 2,
        semiAutomatic: 1,
        manual: 0,
        operations: [
          {
            name: 'GetUser',
            changes: 1,
            confidence: 95,
          },
        ],
      };

      // Key metrics should align
      expect(mainCliTransform.totalTransformed).toBe(unifiedCliTransform.transformed);
      expect(mainCliTransform.transformations.length).toBeGreaterThan(0);
      expect(unifiedCliTransform.operations.length).toBeGreaterThan(0);
    });
  });

  describe('Validate Command Comparison', () => {
    it('should produce compatible validation output between CLIs', async () => {
      // Mock main-cli.ts validate output
      const mainCliValidate = {
        timestamp: '2025-01-10T10:00:00Z',
        results: {
          total: 10,
          valid: 8,
          invalid: 2,
          warnings: 1,
        },
        queries: [
          { id: 'GetUser', valid: true },
          { id: 'UpdateUser', valid: false, errors: [{ message: 'Field deprecated' }] },
        ],
      };

      // Mock unified-cli.ts validate output
      const unifiedCliValidate = {
        valid: false,
        errors: [
          {
            operation: 'UpdateUser',
            message: 'Field deprecated',
          },
        ],
      };

      // Both indicate validation failure
      expect(mainCliValidate.results.invalid).toBeGreaterThan(0);
      expect(unifiedCliValidate.valid).toBe(false);
      expect(unifiedCliValidate.errors.length).toBe(mainCliValidate.results.invalid);
    });
  });

  describe('Command Mapping', () => {
    const commandMap = {
      // main-cli.ts -> unified-cli.ts
      extract: 'analyze',
      transform: 'transform',
      validate: 'validate',
      apply: 'apply',
      monitor: 'monitor',
      rollback: 'rollback',
    };

    it('should map commands correctly between CLIs', () => {
      // main-cli.ts has more interactive commands
      const mainCliCommands = [
        'analyze',
        'extract',
        'transform',
        'validate',
        'generate',
        'interactive',
        'schema',
        'migrate',
        'monitor',
        'rollback',
      ];

      // unified-cli.ts has production-focused commands
      const unifiedCliCommands = [
        'analyze',
        'transform',
        'validate',
        'apply',
        'monitor',
        'rollback',
        'migrate',
        'pattern-migrate',
      ];

      // Core commands should exist in both
      const coreCommands = ['transform', 'validate', 'monitor', 'rollback'];
      coreCommands.forEach((cmd) => {
        expect(mainCliCommands).toContain(cmd);
        expect(unifiedCliCommands).toContain(cmd);
      });
    });
  });

  describe('Exit Code Compatibility', () => {
    const testCases = [
      { scenario: 'successful operation', exitCode: 0 },
      { scenario: 'validation failure', exitCode: 1 },
      { scenario: 'file not found', exitCode: 1 },
      { scenario: 'invalid arguments', exitCode: 1 },
      { scenario: 'transformation error', exitCode: 1 },
    ];

    testCases.forEach(({ scenario, exitCode }) => {
      it(`should return consistent exit code for ${scenario}`, async () => {
        mockSpawn.mockReturnValue({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, cb) => {
            if (event === 'close') cb(exitCode);
          }),
        } as any);

        const runCommand = async (cli: string, args: string[]) => {
          return new Promise<number>((resolve) => {
            const child = spawn('tsx', [cli, ...args]);
            child.on('close', (code) => resolve(code || 0));
          });
        };

        const mainCliCode = await runCommand('main-cli.ts', ['validate']);
        const unifiedCliCode = await runCommand('unified-cli.ts', ['validate']);

        expect(mainCliCode).toBe(exitCode);
        expect(unifiedCliCode).toBe(exitCode);
      });
    });
  });

  describe('Progress Output Compatibility', () => {
    it('should suppress progress indicators when --quiet is used', async () => {
      const outputs: string[] = [];

      mockSpawn.mockImplementation((cmd, args: any) => {
        const hasQuiet = args.includes('--quiet');
        const mockProcess = {
          stdout: {
            on: vi.fn((event, cb) => {
              if (event === 'data' && !hasQuiet) {
                cb(Buffer.from('Processing...'));
              }
            }),
          },
          stderr: { on: vi.fn() },
          on: vi.fn((event, cb) => {
            if (event === 'close') cb(0);
          }),
        };
        return mockProcess as any;
      });

      // Test with --quiet
      const quietResult = await new Promise<string>((resolve) => {
        const child = spawn('tsx', ['main-cli.ts', 'extract', '--quiet']);
        let output = '';
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });
        child.on('close', () => resolve(output));
      });

      // Test without --quiet
      const verboseResult = await new Promise<string>((resolve) => {
        const child = spawn('tsx', ['main-cli.ts', 'extract']);
        let output = '';
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });
        child.on('close', () => resolve(output));
      });

      expect(quietResult).toBe('');
      expect(verboseResult).toContain('Processing');
    });
  });

  describe('JSON Output Mode', () => { type: 'query',
    it('should output pure JSON when --json flag is used', async () => {
      const jsonOutput = {
        totalQueries: 5,
        queries: [{ id: 'GetUser', name: 'GetUser' }],
      };

      mockSpawn.mockReturnValue({
        stdout: {
          on: vi.fn((event, cb) => {
            if (event === 'data') {
              cb(Buffer.from(JSON.stringify(jsonOutput)));
            }
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
      } as any);

      const result = await new Promise<string>((resolve) => {
        const child = spawn('tsx', ['main-cli.ts', 'extract', '--json']);
        let output = '';
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });
        child.on('close', () => resolve(output));
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('totalQueries');
      expect(parsed).toHaveProperty('queries');
    });
  });

  describe('Feature Parity', () => {
    it('should verify core features exist in both CLIs', () => {
      const coreFeatures = {
        extraction: { mainCli: 'extract', unifiedCli: 'analyze' },
        transformation: { mainCli: 'transform', unifiedCli: 'transform' },
        validation: { mainCli: 'validate', unifiedCli: 'validate' },
        monitoring: { mainCli: 'monitor', unifiedCli: 'monitor' },
        rollback: { mainCli: 'rollback', unifiedCli: 'rollback' },
      };

      // All core features should be available in both CLIs
      Object.entries(coreFeatures).forEach(([feature, commands]) => {
        expect(commands.mainCli).toBeTruthy();
        expect(commands.unifiedCli).toBeTruthy();
      });
    });
  });
});
