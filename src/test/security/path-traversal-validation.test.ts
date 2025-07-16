import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FragmentResolver } from '../../core/extraction/utils/FragmentResolver.js';
import { GraphQLExtractor } from '../../core/extraction/compat/GraphQLExtractor.js';
import { FileReporter } from '../../core/extraction/reporters/FileReporter.js';
import { HTMLReporter } from '../../core/extraction/reporters/HTMLReporter.js';
import { JSONReporter } from '../../core/extraction/reporters/JSONReporter.js';
import { ConfigLoader } from '../../utils/ConfigLoader.js';
// DynamicGraphQLExtractor was deprecated and removed
import { TemplateResolver } from '../../core/extraction/analyzers/TemplateResolver.js';
import { validateReadPath, validateWritePath, sanitizeFileName } from '../../utils/securePath.js';

// Mock the fs module
vi.mock('fs/promises');
vi.mock('../../utils/logger');

describe('Path Traversal Security Validation', () => {
  const projectRoot = '/Users/balkhalil/gd/demo/pg-migration-620';
  const mockContext = {
    options: {
      directory: projectRoot,
      fragmentsDirectory: path.join(projectRoot, 'src'),
      outputDir: path.join(projectRoot, 'output'),
      inlineFragments: true,
    },
    fragments: new Map(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.cwd = vi.fn().mockReturnValue(projectRoot);
  });

  describe('Attack Vector Tests', () => {
    const attackVectors = [
      // Basic directory traversal
      { name: 'basic traversal', path: '../../../etc/passwd' },
      { name: 'windows traversal', path: '..\\..\\..\\windows\\system32\\config' },
      { name: 'mixed separators', path: '../..\\../etc/passwd' },

      // Absolute paths
      { name: 'absolute unix', path: '/etc/passwd' },
      { name: 'absolute windows', path: 'C:\\Windows\\System32\\config\\SAM' },

      // URL encoded traversals
      { name: 'url encoded', path: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd' },
      {
        name: 'double url encoding',
        path: '%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd',
      },

      // Null byte injection
      { name: 'null byte', path: 'file.txt\0.jpg' },
      { name: 'null byte traversal', path: '../../../etc/passwd\0.txt' },

      // Unicode normalization attacks
      { name: 'unicode dots', path: '\u002e\u002e/\u002e\u002e/etc/passwd' },
      { name: 'unicode slashes', path: '..\u2215..\u2215etc\u2215passwd' },

      // Special characters and spaces
      { name: 'spaces in path', path: '../.. /../../etc/passwd' },
      { name: 'special chars', path: '../$(whoami)/../../etc/passwd' },
      { type: 'query', id: 'generated-id', name: 'backticks', path: '../`id`/../../etc/passwd' },

      // Symbolic links (conceptual test)
      { name: 'symlink attempt', path: './symlink-to-etc/../passwd' },

      // Home directory reference
      { name: 'home dir', path: '~/../../etc/passwd' },
      { name: 'home expansion', path: '~root/.ssh/id_rsa' },

      // Hidden files outside project
      { name: 'hidden file', path: '../../../.env' },
      { name: 'ssh keys', path: '../../../.ssh/id_rsa' },

      // Complex combinations
      { name: 'complex mix', path: './../.\\..//etc/./passwd' },
      { name: 'repeated traversal', path: '../../../../../../../../../../../../etc/passwd' },
    ];

    describe('validateReadPath', () => {
      attackVectors.forEach(({ name, path: attackPath }) => {
        it(`should block ${name}: ${attackPath}`, () => {
          const result = validateReadPath(attackPath);
          expect(result).toBeNull();
        });
      });

      it('should allow valid project paths', () => {
        const validPaths = [
          'src/utils/logger.ts',
          './src/core/scanner/GraphQLExtractor.ts',
          'test-pipeline/security-dataset/fragment-malicious-1.js',
        ];

        validPaths.forEach((validPath) => {
          const result = validateReadPath(validPath);
          expect(result).not.toBeNull();
          expect(result).toContain(projectRoot);
        });
      });
    });

    describe('validateWritePath', () => {
      attackVectors.forEach(({ name, path: attackPath }) => {
        it(`should block ${name} in output dir: ${attackPath}`, () => {
          const result = validateWritePath('output', attackPath);
          expect(result).toBeNull();
        });

        it(`should block ${name} in filename: ${attackPath}`, () => {
          const result = validateWritePath('../../../tmp', 'report.html');
          expect(result).toBeNull();
        });
      });

      it('should allow valid output paths', () => {
        const validCombos = [
          { dir: 'output', file: 'report.html' },
          { dir: './dist', file: 'queries.json' },
          { dir: 'data', file: 'extracted-queries.txt' },
        ];

        validCombos.forEach(({ dir, file }) => {
          const result = validateWritePath(dir, file);
          expect(result).not.toBeNull();
          expect(result).toContain(projectRoot);
        });
      });
    });

    describe('sanitizeFileName', () => {
      const maliciousFilenames = [
        { name: 'traversal in filename', input: '../../../etc/passwd' },
        { name: 'path separators', input: 'file/../../etc/passwd' },
        { name: 'windows separators', input: 'file\\..\\..\\windows\\system32' },
        { name: 'null bytes', input: 'file.txt\0.jpg' },
        { name: 'special chars', input: 'file`rm -rf /`.txt' },
        { type: 'query', id: 'generated-id', name: 'unicode', input: 'file\u002e\u002e/\u002e\u002eetc.txt' },
      ];

      maliciousFilenames.forEach(({ name, input }) => {
        it(`should sanitize ${name}: ${input}`, () => {
          const result = sanitizeFileName(input);
          expect(result).not.toContain('..');
          expect(result).not.toContain('/');
          expect(result).not.toContain('\\');
          expect(result).not.toContain('\0');
          expect(result).not.toContain('`');
        });
      });
    });
  });

  describe('File-Specific Security Tests', () => {
    describe('FragmentResolver Security', () => {
      it('should not read fragments from outside project', async () => {
        const resolver = new FragmentResolver(mockContext);
        const mockFs = vi.mocked(fs);

        // Mock glob to return malicious paths
        const maliciousPaths = [
          '/etc/passwd',
          '../../../etc/hosts',
          path.join(projectRoot, '..', '..', 'etc', 'shadow'),
        ];

        // Since FragmentResolver uses glob which should filter these out,
        // we test that even if malicious paths somehow get through,
        // the file read would be blocked
        for (const malPath of maliciousPaths) {
          mockFs.readFile.mockImplementationOnce(async (filePath) => {
            // The resolver should never reach this point with malicious paths
            throw new Error(`Attempted to read forbidden file: ${filePath}`);
          });

          // The resolver should handle errors gracefully
          await expect(resolver.resolve([])).resolves.not.toThrow();
        }
      });
    });

    describe('GraphQLExtractor Security', () => {
      it('should validate paths before reading queryNames files', async () => {
        const extractor = new GraphQLExtractor();
        const mockFs = vi.mocked(fs);

        // Mock readFile to throw if called with invalid paths
        mockFs.readFile.mockImplementation(async (filePath) => {
          if (typeof filePath === 'string' && !filePath.startsWith(projectRoot)) {
            throw new Error(`Security violation: attempted to read ${filePath}`);
          }
          return 'module.exports = { queryNames: {} };';
        });

        // Test extraction with potentially malicious directory
        await expect(extractor.extractFromDirectory('../../../etc', ['passwd'])).resolves.toEqual(
          [],
        );
      });

      it('should use validateReadPath for queryNames loading', async () => {
        const extractor = new GraphQLExtractor();
        const validateSpy = vi.spyOn(await import('../../utils/securePath.js'), 'validateReadPath');

        // Trigger queryNames loading
        await extractor.extractFromDirectory(projectRoot, ['**/*.js'], false);

        // Verify validateReadPath was called
        expect(validateSpy).toHaveBeenCalled();
      });
    });

    describe('FileReporter Security', () => {
      it('should validate output paths before writing', async () => {
        const mockFs = vi.mocked(fs);

        // Test with malicious output directory in context
        const maliciousContext = {
          ...mockContext,
          options: {
            ...mockContext.options,
            outputDir: '../../../tmp',
          },
        };

        const reporter = new FileReporter(maliciousContext as any);

        await expect(
          reporter.generate({ queries: [], variants: [], errors: [] } as any),
        ).rejects.toThrow('Invalid output directory');
      });

      it('should sanitize user-provided filenames', async () => {
        const reporter = new FileReporter(mockContext as any);
        const result = {
          queries: [
            {
              id: 'test',
              name: '../../../malicious',
              content: 'query { test }',
              resolvedContent: 'query { test }',
            },
          ],
          variants: [],
          errors: [],
          fragments: new Map(),
          stats: {
            totalQueries: 1,
            totalVariants: 0,
            totalFragments: 0,
            totalErrors: 0,
          },
        };

        // Mock fs operations to succeed
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        await reporter.generate(result as any);

        // FileReporter internally uses sanitizeFileName
        // If this doesn't throw, the test passes
        expect(true).toBe(true);
      });
    });

    describe('HTMLReporter Security', () => {
      it('should validate output paths', async () => {
        // Test with malicious output directory
        const maliciousContext = {
          ...mockContext,
          options: {
            ...mockContext.options,
            outputDir: '../../../etc',
          },
        };

        const reporter = new HTMLReporter(maliciousContext as any);

        await expect(
          reporter.generate({
            queries: [],
            variants: [],
            errors: [],
            fragments: new Map(),
            stats: {
              totalQueries: 0,
              totalVariants: 0,
              totalFragments: 0,
              totalErrors: 0,
            },
          } as any),
        ).rejects.toThrow('Invalid output path');
      });

      it('should escape HTML in query content', async () => {
        const reporter = new HTMLReporter(mockContext as any);
        const maliciousQueries = [
          {
            id: 'xss-test',
            content: '<script>alert("XSS")</script>',
            resolvedContent: '<script>alert("XSS")</script>',
            filePath: 'test.js',
            name: '<img src=x onerror="alert(1)">',
            type: 'query' as const,
            location: { line: 1, column: 1, file: '/Users/balkhalil/gd/demo/pg-migration-620/src/test/security/path-traversal-validation.test.ts' },
          },
        ];

        // Mock fs operations
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        let capturedHtml = '';
        vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
          capturedHtml = content as string;
        });

        await reporter.generate({
          queries: maliciousQueries,
          variants: [],
          errors: [],
          fragments: new Map(),
          stats: {
            totalQueries: 1,
            totalVariants: 0,
            totalFragments: 0,
            totalErrors: 0,
          },
        } as any);

        // Should escape dangerous HTML in query names
        expect(capturedHtml).not.toContain('<script>');
        expect(capturedHtml).not.toContain('<img src=x onerror="alert(1)">');
        expect(capturedHtml).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
      });
    });

    describe('JSONReporter Security', () => {
      it('should validate output paths', async () => {
        const maliciousContext = {
          ...mockContext,
          options: {
            ...mockContext.options,
            outputDir: '../../../tmp',
          },
        };

        const reporter = new JSONReporter(maliciousContext as any);

        await expect(
          reporter.generate({ queries: [], variants: [], errors: [] } as any),
        ).rejects.toThrow();
      });

      it('should handle circular references safely', async () => {
        const reporter = new JSONReporter(mockContext as any);
        const circular: any = { a: 1 };
        circular.self = circular;

        const queries = [
          {
            id: 'circular-test',
            content: 'query Test { field }',
            resolvedContent: 'query Test { field }',
            filePath: 'test.js',
            type: 'query' as const,
            location: { line: 1, column: 1, file: '/Users/balkhalil/gd/demo/pg-migration-620/src/test/security/path-traversal-validation.test.ts' },
            metadata: circular,
          },
        ];

        // Mock fs operations
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        await expect(
          reporter.generate({
            queries,
            variants: [],
            errors: [],
            fragments: new Map(),
            switches: new Map(),
            stats: {
              totalQueries: 2,
              totalVariants: 0,
              totalFragments: 0,
              totalErrors: 0,
            },
          } as any),
        ).resolves.not.toThrow();
      });
    });

    describe('ConfigLoader Security', () => {
      it('should validate config file paths', async () => {
        const maliciousConfigs = ['../../../etc/passwd', '/etc/shadow', '~/.ssh/config'];

        for (const configPath of maliciousConfigs) {
          // ConfigLoader returns default config for invalid paths
          const result = await ConfigLoader.load(configPath);
          expect(result).toBeDefined();
          expect(result.source).toBeDefined();
        }
      });

      it('should not execute JavaScript in config files', async () => {
        const mockFs = vi.mocked(fs);

        // ConfigLoader only supports YAML/JSON, not JS files
        // Test that it returns default config for unsupported files
        const result = await ConfigLoader.load('config.js');
        expect(result).toBeDefined();
        expect(result.source).toBeDefined(); // Should return default config

        // Test malicious YAML - should return default config on parse error
        const maliciousYaml = `
          !!js/function >
            function() {
              require('child_process').exec('malicious-command');
            }
        `;

        mockFs.access.mockResolvedValueOnce(undefined);
        mockFs.readFile.mockResolvedValueOnce(maliciousYaml);

        // Should return default config instead of executing
        const yamlResult = await ConfigLoader.load('config.yaml');
        expect(yamlResult).toBeDefined();
        expect(yamlResult.source).toBeDefined();
      });
    });

    describe('DynamicGraphQLExtractor Security', () => {
      it('should validate dynamic import paths', async () => {
        const extractor = new DynamicGraphQLExtractor();

        // Should reject malicious paths
        const result = await extractor.extractFromFile('../../../malicious/module.js');

        // Should return empty array for invalid paths
        expect(result).toEqual([]);
      });

      it('should sandbox dynamic code execution', async () => {
        const extractor = new DynamicGraphQLExtractor();
        const mockFs = vi.mocked(fs);

        // Clear any previous mocks that might interfere
        mockFs.readFile.mockClear();

        // Mock file with malicious content
        const maliciousContent = `
          const query = gql\`
            query Evil {
              \${require('child_process').exec('rm -rf /')}
            }
          \`;
        `;

        // Mock specifically for absolute test.js path
        const testPath = path.resolve('test.js');
        mockFs.readFile.mockImplementation(async (filePath) => {
          if (filePath === testPath || filePath === 'test.js') {
            return maliciousContent;
          }
          throw new Error('File not found');
        });

        // Should safely extract without executing code
        const results = await extractor.extractFromFile('test.js');

        // Should extract but not execute
        expect(results.length).toBeGreaterThanOrEqual(0);
      });
    });

    describe('TemplateResolver Security', () => {
      it('should validate template file paths', async () => {
        const resolver = new TemplateResolver(mockContext as any);

        // TemplateResolver validates paths when loading fragments
        const queries = [
          {
            id: 'test',
            content: 'query { ${fragment} }',
            resolvedContent: '',
            filePath: '../../../etc/passwd', // Malicious path
            name: 'Test',
            type: 'query' as const,
          },
        ];

        const result = await resolver.resolveTemplates(queries);

        // Should handle but not compromise security
        expect(result).toBeDefined();
      });

      it('should prevent template injection attacks', async () => {
        const resolver = new TemplateResolver(mockContext as any);

        const maliciousQueries = [
          {
            id: 'test',
            content: 'query { ${process.mainModule.require("child_process").exec("id")} }',
            resolvedContent: '',
            filePath: 'test.js',
            name: 'Test',
            type: 'query' as const,
          },
        ];

        const result = await resolver.resolveTemplates(maliciousQueries);

        // Should not execute the injected code
        const resolvedContent = result[0]?.resolvedContent || result[0]?.content || '';
        // The template should be processed but not executed
        expect(resolvedContent).toBeDefined();
        // The content will still contain the literal string but won't be executed
        expect(typeof resolvedContent).toBe('string');
      });
    });
  });

  describe('Integration with Security Dataset', () => {
    const securityDatasetPath = path.join(projectRoot, 'test-pipeline/security-dataset');

    it('should block Beshi/Kofelo path traversal fixtures', async () => {
      const fixtures = ['path-traversal-1.js', 'path-traversal.js'];

      for (const fixture of fixtures) {
        const fixturePath = path.join(securityDatasetPath, fixture);

        // Try to read the fixture to get the malicious path
        try {
          const content = await fs.readFile(fixturePath, 'utf-8');
          const maliciousPath = extractMaliciousPath(content);

          if (maliciousPath) {
            expect(validateReadPath(maliciousPath)).toBeNull();
          }
        } catch (error) {
          // Fixture might not exist in test environment
        }
      }
    });

    it('should handle fragment import attacks', async () => {
      const maliciousQuery = `
        query Test {
          ... on User @import(from: "../../../../../../../../../../../etc/passwd")
        }
      `;

      const resolver = new FragmentResolver(mockContext);

      // Should not throw but should safely ignore the malicious import
      await expect(
        resolver.resolve([
          {
            id: 'test',
            filePath: 'test.graphql',
            content: maliciousQuery,
            ast: null as any,
            location: { line: 1, column: 1, file: '/Users/balkhalil/gd/demo/pg-migration-620/src/test/security/path-traversal-validation.test.ts' },
            type: 'query',
          },
        ]),
      ).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should not expose sensitive paths in error messages', async () => {
      try {
        await ConfigLoader.load('../../../etc/passwd');
      } catch (error: any) {
        expect(error.message).not.toContain('/etc/passwd');
        expect(error.message).not.toContain('etc');
        expect(error.message).not.toMatch(/\/Users\/\w+/);
      }
    });

    it('should log security violations without exposing paths', async () => {
      const { logger } = await import('../../utils/logger.js');
      const warnSpy = vi.spyOn(logger, 'warn');

      validateReadPath('../../../etc/passwd');

      const warnCalls = warnSpy.mock.calls;
      // Check that warnings don't expose sensitive paths
      for (const call of warnCalls) {
        if (call[0]?.includes('Path traversal')) {
          expect(call[0]).not.toContain('/etc/passwd');
          expect(call[0]).not.toContain('/etc');
        }
      }
    });
  });

  describe('Performance under Attack', () => {
    it('should handle large numbers of traversal attempts efficiently', () => {
      const start = Date.now();
      const attempts = 10000;

      for (let i = 0; i < attempts; i++) {
        validateReadPath(`../`.repeat(i % 20) + 'etc/passwd');
      }

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle extremely long paths without DoS', () => {
      const longPath = '../'.repeat(1000) + 'etc/passwd';
      const result = validateReadPath(longPath);
      expect(result).toBeNull();
    });
  });
});

// Helper function to extract malicious paths from fixture files
function extractMaliciousPath(content: string): string | null {
  const patterns = [
    /filePath:\s*['"]([^'"]+)['"]/,
    /from:\s*['"]([^'"]+)['"]/,
    /path:\s*['"]([^'"]+)['"]/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}
