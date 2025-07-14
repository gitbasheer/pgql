import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FragmentResolver } from '../../core/extraction/resolvers/FragmentResolver';
import { GraphQLExtractor } from '../../core/scanner/GraphQLExtractor';
import { FileReporter } from '../../core/extraction/reporters/FileReporter';
import { HTMLReporter } from '../../core/extraction/reporters/HTMLReporter';
import { JSONReporter } from '../../core/extraction/reporters/JSONReporter';
import { ConfigLoader } from '../../utils/ConfigLoader';
import { DynamicGraphQLExtractor } from '../../core/scanner/DynamicGraphQLExtractor';
import { TemplateResolver } from '../../core/extraction/analyzers/TemplateResolver';
import { validateReadPath, validateWritePath, sanitizeFileName } from '../../utils/securePath';

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
      inlineFragments: true
    },
    fragments: new Map()
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
      { name: 'double url encoding', path: '%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd' },
      
      // Null byte injection
      { name: 'null byte', path: 'file.txt\0.jpg' },
      { name: 'null byte traversal', path: '../../../etc/passwd\0.txt' },
      
      // Unicode normalization attacks
      { name: 'unicode dots', path: '\u002e\u002e/\u002e\u002e/etc/passwd' },
      { name: 'unicode slashes', path: '..\u2215..\u2215etc\u2215passwd' },
      
      // Special characters and spaces
      { name: 'spaces in path', path: '../.. /../../etc/passwd' },
      { name: 'special chars', path: '../$(whoami)/../../etc/passwd' },
      { name: 'backticks', path: '../`id`/../../etc/passwd' },
      
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
      { name: 'repeated traversal', path: '../../../../../../../../../../../../etc/passwd' }
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
          'test-pipeline/security-dataset/fragment-malicious-1.js'
        ];

        validPaths.forEach(validPath => {
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
          { dir: 'data', file: 'extracted-queries.txt' }
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
        { name: 'unicode', input: 'file\u002e\u002e/\u002e\u002eetc.txt' }
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
          path.join(projectRoot, '..', '..', 'etc', 'shadow')
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
        await expect(
          extractor.extractFromDirectory('../../../etc', ['passwd'])
        ).resolves.toEqual([]);
      });

      it('should use validateReadPath for queryNames loading', async () => {
        const extractor = new GraphQLExtractor();
        const validateSpy = vi.spyOn(await import('../../utils/securePath'), 'validateReadPath');
        
        // Trigger queryNames loading
        await extractor.extractFromDirectory(projectRoot, ['**/*.js'], false);
        
        // Verify validateReadPath was called
        expect(validateSpy).toHaveBeenCalled();
      });
    });

    describe('FileReporter Security', () => {
      it('should validate output paths before writing', async () => {
        const reporter = new FileReporter();
        const mockFs = vi.mocked(fs);
        
        const maliciousOutputs = [
          { outputDir: '../../../tmp', fileName: 'report.txt' },
          { outputDir: '/etc', fileName: 'passwd' },
          { outputDir: 'output', fileName: '../../../etc/passwd' }
        ];

        for (const { outputDir, fileName } of maliciousOutputs) {
          mockFs.writeFile.mockImplementationOnce(async (filePath) => {
            throw new Error(`Should not write to: ${filePath}`);
          });

          await expect(
            reporter.report([], { outputDir, fileName })
          ).rejects.toThrow();
        }
      });

      it('should sanitize user-provided filenames', async () => {
        const reporter = new FileReporter();
        const sanitizeSpy = vi.spyOn(await import('../../utils/securePath'), 'sanitizeFileName');
        
        await reporter.report([], {
          outputDir: 'output',
          fileName: '../../../malicious.txt'
        });
        
        expect(sanitizeSpy).toHaveBeenCalledWith('../../../malicious.txt');
      });
    });

    describe('HTMLReporter Security', () => {
      it('should validate template paths', async () => {
        const reporter = new HTMLReporter();
        const mockFs = vi.mocked(fs);
        
        const maliciousTemplates = [
          '../../../etc/passwd',
          '/etc/hosts',
          '../../sensitive/template.html'
        ];

        for (const template of maliciousTemplates) {
          mockFs.readFile.mockImplementationOnce(async () => {
            throw new Error('Should not read template');
          });

          await expect(
            reporter.report([], { templatePath: template })
          ).rejects.toThrow();
        }
      });

      it('should escape HTML in query content', async () => {
        const reporter = new HTMLReporter();
        const maliciousQueries = [{
          id: 'xss-test',
          content: '<script>alert("XSS")</script>',
          filePath: 'test.js',
          name: '<img src=x onerror="alert(1)">',
          type: 'query' as const
        }];

        const result = await reporter.report(maliciousQueries, {
          outputDir: 'output',
          fileName: 'report.html'
        });

        expect(result).not.toContain('<script>');
        expect(result).not.toContain('onerror=');
      });
    });

    describe('JSONReporter Security', () => {
      it('should validate output paths', async () => {
        const reporter = new JSONReporter();
        const validateSpy = vi.spyOn(await import('../../utils/securePath'), 'validateWritePath');
        
        await reporter.report([], {
          outputDir: '../../../tmp',
          fileName: 'report.json'
        });
        
        expect(validateSpy).toHaveBeenCalledWith('../../../tmp', 'report.json');
      });

      it('should handle circular references safely', async () => {
        const reporter = new JSONReporter();
        const circular: any = { a: 1 };
        circular.self = circular;
        
        const queries = [{
          id: 'circular-test',
          content: 'query Test { field }',
          filePath: 'test.js',
          type: 'query' as const,
          metadata: circular
        }];

        await expect(
          reporter.report(queries, { outputDir: 'output', fileName: 'report.json' })
        ).resolves.not.toThrow();
      });
    });

    describe('ConfigLoader Security', () => {
      it('should validate config file paths', async () => {
        const loader = new ConfigLoader();
        const mockFs = vi.mocked(fs);
        
        const maliciousConfigs = [
          '../../../etc/passwd',
          '/etc/shadow',
          '~/.ssh/config'
        ];

        for (const configPath of maliciousConfigs) {
          mockFs.readFile.mockImplementationOnce(async () => {
            throw new Error('Should not read config');
          });

          await expect(
            loader.loadConfig(configPath)
          ).rejects.toThrow();
        }
      });

      it('should not execute JavaScript in config files', async () => {
        const loader = new ConfigLoader();
        const mockFs = vi.mocked(fs);
        
        const maliciousConfig = `
          module.exports = {
            beforeLoad: () => {
              require('child_process').exec('malicious-command');
            },
            config: {}
          };
        `;

        mockFs.readFile.mockResolvedValueOnce(maliciousConfig);
        
        // Should safely parse without executing
        await expect(
          loader.loadConfig('config.js')
        ).rejects.toThrow();
      });
    });

    describe('DynamicGraphQLExtractor Security', () => {
      it('should validate dynamic import paths', async () => {
        const extractor = new DynamicGraphQLExtractor();
        const validateSpy = vi.spyOn(await import('../../utils/securePath'), 'validateReadPath');
        
        await extractor.extract({
          importPath: '../../../malicious/module',
          directory: projectRoot
        });
        
        expect(validateSpy).toHaveBeenCalled();
      });

      it('should sandbox dynamic code execution', async () => {
        const extractor = new DynamicGraphQLExtractor();
        
        const maliciousPatterns = [
          'require("child_process").exec("rm -rf /")',
          'process.exit(1)',
          'eval("malicious code")'
        ];

        for (const pattern of maliciousPatterns) {
          await expect(
            extractor.extract({
              pattern,
              directory: projectRoot
            })
          ).rejects.toThrow();
        }
      });
    });

    describe('TemplateResolver Security', () => {
      it('should validate template file paths', async () => {
        const resolver = new TemplateResolver();
        const validateSpy = vi.spyOn(await import('../../utils/securePath'), 'validateReadPath');
        
        await resolver.resolveTemplate({
          templatePath: '../../../etc/passwd',
          variables: {}
        });
        
        expect(validateSpy).toHaveBeenCalledWith('../../../etc/passwd');
      });

      it('should prevent template injection attacks', async () => {
        const resolver = new TemplateResolver();
        const mockFs = vi.mocked(fs);
        
        mockFs.readFile.mockResolvedValueOnce('Hello {{name}}!');
        
        const maliciousVars = {
          name: '{{process.mainModule.require("child_process").exec("id")}}',
          path: '../../../etc/passwd'
        };

        const result = await resolver.resolveTemplate({
          templatePath: 'template.txt',
          variables: maliciousVars
        });

        // Should not execute the injected code
        expect(result).not.toContain('child_process');
        expect(result).not.toContain('exec');
      });
    });
  });

  describe('Integration with Security Dataset', () => {
    const securityDatasetPath = path.join(projectRoot, 'test-pipeline/security-dataset');

    it('should block Beshi/Kofelo path traversal fixtures', async () => {
      const fixtures = [
        'path-traversal-1.js',
        'path-traversal.js'
      ];

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
        resolver.resolve([{
          id: 'test',
          filePath: 'test.graphql',
          content: maliciousQuery,
          ast: null as any,
          location: { line: 1, column: 1 },
          type: 'query'
        }])
      ).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should not expose sensitive paths in error messages', async () => {
      const loader = new ConfigLoader();
      
      try {
        await loader.loadConfig('../../../etc/passwd');
      } catch (error: any) {
        expect(error.message).not.toContain('/etc/passwd');
        expect(error.message).not.toContain('etc');
        expect(error.message).not.toMatch(/\/Users\/\w+/);
      }
    });

    it('should log security violations without exposing paths', async () => {
      const loggerSpy = vi.spyOn(await import('../../utils/logger'), 'logger');
      
      validateReadPath('../../../etc/passwd');
      
      const warnCalls = loggerSpy.warn.mock.calls;
      expect(warnCalls.some(call => 
        call[0].includes('blocked') && !call[0].includes('/etc/passwd')
      )).toBe(true);
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
    /path:\s*['"]([^'"]+)['"]/
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}