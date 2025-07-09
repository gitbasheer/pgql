import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryNamesConverter } from '../../cli/convert-querynames';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('QueryNamesConverter', () => {
  let converter: QueryNamesConverter;
  let tempDir: string;
  let inputFile: string;
  let outputFile: string;

  beforeEach(async () => {
    converter = new QueryNamesConverter();
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'converter-test-'));
    inputFile = path.join(tempDir, 'queryNames.js');
    outputFile = path.join(tempDir, 'pattern-registry.json');
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('convertQueryNamesToPatterns', () => {
    it('should convert basic queryNames.js file', async () => {
      const queryNamesContent = `
        export const queryNames = {
          getUserById: 'GetUserByIdQuery',
          getVentureByDomain: 'GetVentureByDomainQuery',
          updateUserProfile: 'UpdateUserProfileMutation'
        };
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      });

      expect(registry.patterns).toHaveLength(3);
      expect(registry.patterns[0]).toMatchObject({
        pattern: '${queryNames.getUserById}',
        template: 'query ${queryNames.getUserById}',
        name: 'GetUserByIdQuery',
        version: 'V1'
      });

      expect(registry.metadata.totalPatterns).toBe(3);
      expect(registry.metadata.convertedFrom).toBe(inputFile);
    });

    it('should detect versions correctly', async () => {
      const queryNamesContent = `
        export const queryNames = {
          getUserV1: 'GetUserV1Query',
          getUserV2: 'GetUserV2Query',
          getUserV3: 'GetUserV3Query',
          getUserLatest: 'GetUserLatestQuery'
        };
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      });

      const patterns = registry.patterns;
      expect(patterns.find(p => p.name === 'GetUserV1Query')?.version).toBe('V1');
      expect(patterns.find(p => p.name === 'GetUserV2Query')?.version).toBe('V2');
      expect(patterns.find(p => p.name === 'GetUserV3Query')?.version).toBe('V3');
      expect(patterns.find(p => p.name === 'GetUserLatestQuery')?.version).toBe('V3');
    });

    it('should suggest replacements for deprecated patterns', async () => {
      const queryNamesContent = `
        export const queryNames = {
          getUserById: 'GetUserByIdQuery',
          getUser: 'GetUserQuery'
        };
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      });

      const byIdPattern = registry.patterns.find(p => p.name === 'GetUserByIdQuery');
      const getUserPattern = registry.patterns.find(p => p.name === 'GetUserQuery');

      expect(byIdPattern?.replacement).toBe('GetUserByIdV2Query');
      expect(getUserPattern?.replacement).toBe('GetUserV2Query');
    });

    it('should handle default export format', async () => {
      const queryNamesContent = `
        export default {
          getUserById: 'GetUserByIdQuery',
          getVentureByDomain: 'GetVentureByDomainQuery'
        };
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      });

      expect(registry.patterns).toHaveLength(2);
      expect(registry.patterns[0].name).toBe('GetUserByIdQuery');
    });

    it('should handle variable declaration format', async () => {
      const queryNamesContent = `
        const queryNames = {
          getUserById: 'GetUserByIdQuery',
          getVentureByDomain: 'GetVentureByDomainQuery'
        };

        export { queryNames };
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      });

      expect(registry.patterns).toHaveLength(2);
    });

    it('should generate TypeScript output when requested', async () => {
      const queryNamesContent = `
        export const queryNames = {
          getUserById: 'GetUserByIdQuery'
        };
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const tsOutputFile = path.join(tempDir, 'pattern-registry.ts');

      await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: tsOutputFile,
        format: 'typescript'
      });

      const tsContent = await fs.readFile(tsOutputFile, 'utf-8');
      expect(tsContent).toContain('import { QueryPattern }');
      expect(tsContent).toContain('export const queryPatternRegistry');
      expect(tsContent).toContain('GetUserByIdQuery');
    });

    it('should not write files in dry run mode', async () => {
      const queryNamesContent = `
        export const queryNames = {
          getUserById: 'GetUserByIdQuery'
        };
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json',
        dryRun: true
      });

      expect(registry.patterns).toHaveLength(1);

      // File should not exist
      await expect(fs.access(outputFile)).rejects.toThrow();
    });

    it('should handle complex patterns with computed property names', async () => {
      const queryNamesContent = `
        export const queryNames = {
          ['getUserById']: 'GetUserByIdQuery',
          'getVenture-by-domain': 'GetVentureByDomainQuery'
        };
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      });

      expect(registry.patterns).toHaveLength(2);
      expect(registry.patterns.find(p => p.name === 'GetUserByIdQuery')).toBeDefined();
      expect(registry.patterns.find(p => p.name === 'GetVentureByDomainQuery')).toBeDefined();
    });

    it('should handle malformed input gracefully', async () => {
      const malformedContent = `
        export const queryNames = {
          getUserById: 'GetUserByIdQuery',
          // Missing closing brace
      `;

      await fs.writeFile(inputFile, malformedContent, 'utf-8');

      await expect(converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      })).rejects.toThrow();
    });

    it('should preserve metadata correctly', async () => {
      const queryNamesContent = `
        export const queryNames = {
          getUserById: 'GetUserByIdQuery'
        };
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      });

      const pattern = registry.patterns[0];
      expect(pattern.metadata?.sourceKey).toBe('getUserById');
      expect(pattern.metadata?.convertedFrom).toBe('queryNames.js');
    });
  });

  describe('extractQueryNamesFromFile', () => {
    it('should extract from different export patterns', async () => {
      const patterns = [
        'export const queryNames = { key: "value" };',
        'export default { key: "value" };',
        'const queryNames = { key: "value" }; export { queryNames };'
      ];

      for (const pattern of patterns) {
        await fs.writeFile(inputFile, pattern, 'utf-8');

        const registry = await converter.convertQueryNamesToPatterns({
          input: inputFile,
          output: outputFile,
          format: 'json',
          dryRun: true
        });

        expect(registry.patterns).toHaveLength(1);
        expect(registry.patterns[0].name).toBe('value');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty queryNames object', async () => {
      const queryNamesContent = `
        export const queryNames = {};
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      });

      expect(registry.patterns).toHaveLength(0);
      expect(registry.metadata.totalPatterns).toBe(0);
    });

    it('should handle file with no queryNames export', async () => {
      const noQueryNamesContent = `
        export const otherConfig = {
          key: 'value'
        };
      `;

      await fs.writeFile(inputFile, noQueryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      });

      expect(registry.patterns).toHaveLength(0);
    });

    it('should handle numeric and special character keys', async () => {
      const queryNamesContent = `
        export const queryNames = {
          123: 'NumericKeyQuery',
          'special-key': 'SpecialKeyQuery',
          'key with spaces': 'SpacedKeyQuery'
        };
      `;

      await fs.writeFile(inputFile, queryNamesContent, 'utf-8');

      const registry = await converter.convertQueryNamesToPatterns({
        input: inputFile,
        output: outputFile,
        format: 'json'
      });

      expect(registry.patterns).toHaveLength(3);
      expect(registry.patterns.find(p => p.name === 'NumericKeyQuery')).toBeDefined();
      expect(registry.patterns.find(p => p.name === 'SpecialKeyQuery')).toBeDefined();
      expect(registry.patterns.find(p => p.name === 'SpacedKeyQuery')).toBeDefined();
    });
  });
});
