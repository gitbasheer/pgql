import { describe, it, expect } from 'vitest';
import { ExtractionContext } from '../../core/extraction/engine/ExtractionContext.js';
import { ExtractionOptions } from '../../core/extraction/types/index.js';

describe('ExtractionContext', () => {
  describe('option normalization', () => {
    it('should default preserveSourceAST to false', () => {
      const options: ExtractionOptions = {
        directory: './src'
      };

      const context = new ExtractionContext(options);

      expect(context.options.preserveSourceAST).toBe(false);
    });

    it('should respect preserveSourceAST when set to true', () => {
      const options: ExtractionOptions = {
        directory: './src',
        preserveSourceAST: true
      };

      const context = new ExtractionContext(options);

      expect(context.options.preserveSourceAST).toBe(true);
    });

    it('should respect preserveSourceAST when explicitly set to false', () => {
      const options: ExtractionOptions = {
        directory: './src',
        preserveSourceAST: false
      };

      const context = new ExtractionContext(options);

      expect(context.options.preserveSourceAST).toBe(false);
    });
  });

  describe('all options normalization', () => {
    it('should normalize all options with defaults', () => {
      const options: ExtractionOptions = {
        directory: './src'
      };

      const context = new ExtractionContext(options);

      // Check all defaults
      expect(context.options.patterns).toEqual(['**/*.{js,jsx,ts,tsx}']);
      expect(context.options.ignore).toEqual(['**/node_modules/**', '**/__generated__/**', '**/*.test.*']);
      expect(context.options.strategies).toEqual(['hybrid']);
      expect(context.options.detectVariants).toBe(true);
      expect(context.options.analyzeContext).toBe(true);
      expect(context.options.resolveNames).toBe(true);
      expect(context.options.preserveSourceAST).toBe(false);
      expect(context.options.resolveFragments).toBe(true);
      expect(context.options.resolveImports).toBe(true);
      expect(context.options.normalizeNames).toBe(true);
      expect(context.options.generateVariants).toBe(true);
      expect(context.options.inlineFragments).toBe(false);
      expect(context.options.namingConvention).toBe('pascalCase');
      expect(context.options.reporters).toEqual(['json']);
      expect(context.options.cache).toBe(true);
      expect(context.options.parallel).toBe(true);
      expect(context.options.maxConcurrency).toBe(4);
    });

    it('should preserve user-provided options', () => {
      const options: ExtractionOptions = {
        directory: './custom',
        patterns: ['**/*.graphql'],
        strategies: ['ast'],
        preserveSourceAST: true,
        cache: false,
        maxConcurrency: 8
      };

      const context = new ExtractionContext(options);

      expect(context.options.directory).toBe('./custom');
      expect(context.options.patterns).toEqual(['**/*.graphql']);
      expect(context.options.strategies).toEqual(['ast']);
      expect(context.options.preserveSourceAST).toBe(true);
      expect(context.options.cache).toBe(false);
      expect(context.options.maxConcurrency).toBe(8);
    });
  });

  describe('context functionality', () => {
    it('should track errors correctly', () => {
      const context = new ExtractionContext({ directory: '.' });

      expect(context.errors).toHaveLength(0);
      expect(context.stats.totalErrors).toBe(0);

      context.addError('file1.ts', 'Error 1', 10, 5);
      context.addError('file2.ts', 'Error 2');

      expect(context.errors).toHaveLength(2);
      expect(context.stats.totalErrors).toBe(2);
      expect(context.errors[0]).toEqual({
        file: 'file1.ts',
        message: 'Error 1',
        line: 10,
        column: 5
      });
      expect(context.errors[1]).toEqual({
        file: 'file2.ts',
        message: 'Error 2',
        line: undefined,
        column: undefined
      });
    });

    it('should handle cache operations', () => {
      const context = new ExtractionContext({
        directory: '.',
        cache: true
      });

      // Test cache operations
      const testData = { foo: 'bar' };
      context.setCached('test', 'key1', testData);

      const retrieved = context.getCached<typeof testData>('test', 'key1');
      expect(retrieved).toEqual(testData);

      // Non-existent key
      const notFound = context.getCached('test', 'nonexistent');
      expect(notFound).toBeUndefined();
    });

    it('should respect cache disabled', () => {
      const context = new ExtractionContext({
        directory: '.',
        cache: false
      });

      // Cache operations should be no-ops
      context.setCached('test', 'key1', { data: 'value' });
      const retrieved = context.getCached('test', 'key1');
      expect(retrieved).toBeUndefined();
    });

    it('should track statistics', () => {
      const context = new ExtractionContext({ directory: '.' });

      context.incrementStat('totalFiles', 5);
      context.incrementStat('processedFiles');
      context.incrementStat('processedFiles');

      expect(context.stats.totalFiles).toBe(5);
      expect(context.stats.processedFiles).toBe(2);
    });

    it('should normalize query names', async () => {
      const context = new ExtractionContext({
        directory: '.',
        normalizeNames: true
      });

      const content1 = `query GetUser { user { id } }`;
      const content2 = `query GetUser { user { id name } }`; // Different content

          // Test pattern-based processing instead of deprecated normalizeQueryName
    const queryServices = await context.getQueryNamingService();
    const query1 = {
      id: 'test1', name: 'GetUser', content: content1, type: 'query' as const,
      filePath: 'test.ts', fragments: [], ast: null,
      location: { line: 1, column: 1, file: 'test.ts' },
      namePattern: {
        template: 'GetUser',
        resolvedName: 'GetUser',
        possibleValues: ['GetUser'],
        patternKey: 'GetUser',
        version: 'V1',
        isDeprecated: false
      },
      contentFingerprint: 'test1'
    };
    const query2 = {
      id: 'test2', name: 'GetUser', content: content2, type: 'query' as const,
      filePath: 'test.ts', fragments: [], ast: null,
      location: { line: 1, column: 1, file: 'test.ts' },
      namePattern: {
        template: 'GetUser',
        resolvedName: 'GetUser',
        possibleValues: ['GetUser'],
        patternKey: 'GetUser',
        version: 'V1',
        isDeprecated: false
      },
      contentFingerprint: 'test2'
    };

    const processed1 = queryServices.processQuery(query1);
    const processed2 = queryServices.processQuery(query2);
    const name1 = processed1.name;
    const name2 = processed2.name;

      expect(name1).toBe('GetUser');
      expect(name2).toBe('GetUser_1'); // Should get suffix for different content
    });

    it('should finalize stats with duration', () => {
      const context = new ExtractionContext({ directory: '.' });

      context.incrementStat('totalQueries', 10);
      context.incrementStat('totalErrors', 2);

      // Wait a bit to ensure duration > 0
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait
      }

      const finalStats = context.finalizeStats();

      expect(finalStats.totalQueries).toBe(10);
      expect(finalStats.totalErrors).toBe(2);
      expect(finalStats.duration).toBeGreaterThan(0);
      expect(finalStats.strategy).toBe('hybrid');
    });
  });
});
