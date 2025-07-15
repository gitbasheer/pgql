import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VariantGenerator } from '../../../core/extraction/transformers/VariantGenerator';
import { ExtractionContext } from '../../../core/extraction/engine/ExtractionContext';
import { ResolvedQuery, VariantSwitch, QueryVariant } from '../../../core/extraction/types/index';
import { parse } from 'graphql';
import { logger } from '../../../utils/logger.js';

vi.mock('../../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('VariantGenerator', () => {
  let generator: VariantGenerator;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {} as any;
    generator = new VariantGenerator(mockContext);
  });

  describe('generate', () => {
    it('should generate no variants for queries without dynamic patterns', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'StaticQuery',
          content: 'query StaticQuery { user { id name } }',
          resolvedContent: 'query StaticQuery { user { id name } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>();

      const result = await generator.generate(queries, switches);

      expect(result).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith('Generated 0 variants from 1 queries');
    });

    it('should generate variants for simple boolean switch', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'DynamicQuery',
          content: 'query DynamicQuery { user { id ${includeEmail ? "email" : ""} } }',
          resolvedContent: 'query DynamicQuery { user { id ${includeEmail ? "email" : ""} } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>([
        ['includeEmail', {
          variable: 'includeEmail',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: '${includeEmail ? "email" : ""}',
        }],
      ]);

      const result = await generator.generate(queries, switches);

      expect(result).toHaveLength(2);
      expect(logger.info).toHaveBeenCalledWith('Generated 2 variants from 1 queries');
      
      // Check true variant
      const trueVariant = result.find(v => v.conditions.switches.includeEmail === true);
      expect(trueVariant).toBeDefined();
      expect(trueVariant!.content).toContain('email');
      expect(trueVariant!.content).not.toContain('${');

      // Check false variant
      const falseVariant = result.find(v => v.conditions.switches.includeEmail === false);
      expect(falseVariant).toBeDefined();
      expect(falseVariant!.content).not.toContain('email');
      expect(falseVariant!.content).not.toContain('${');
    });

    it('should generate variants for multiple switches', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'MultiSwitchQuery',
          content: `query MultiSwitchQuery { 
            user { 
              id 
              \${includeEmail ? "email" : ""} 
              \${includeProfile ? "profile { name }" : ""}
            } 
          }`,
          resolvedContent: `query MultiSwitchQuery { 
            user { 
              id 
              \${includeEmail ? "email" : ""} 
              \${includeProfile ? "profile { name }" : ""}
            } 
          }`,
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>([
        ['includeEmail', {
          variable: 'includeEmail',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: '${includeEmail ? "email" : ""}',
        }],
        ['includeProfile', {
          variable: 'includeProfile',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: '${includeProfile ? "profile { name }" : ""}',
        }],
      ]);

      const result = await generator.generate(queries, switches);

      expect(result).toHaveLength(4); // 2^2 combinations
      expect(logger.info).toHaveBeenCalledWith('Generated 4 variants from 1 queries');

      // Check all combinations exist
      const combinations = [
        { includeEmail: true, includeProfile: true },
        { includeEmail: true, includeProfile: false },
        { includeEmail: false, includeProfile: true },
        { includeEmail: false, includeProfile: false },
      ];

      for (const combo of combinations) {
        const variant = result.find(v => 
          v.conditions.switches.includeEmail === combo.includeEmail &&
          v.conditions.switches.includeProfile === combo.includeProfile
        );
        expect(variant).toBeDefined();
        
        if (combo.includeEmail) {
          expect(variant!.content).toContain('email');
        } else {
          expect(variant!.content).not.toContain('email');
        }

        if (combo.includeProfile) {
          expect(variant!.content).toContain('profile');
          expect(variant!.content).toContain('name');
        } else {
          expect(variant!.content).not.toContain('profile');
        }
      }
    });

    it('should handle enum switches', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'EnumQuery',
          content: 'query EnumQuery { user { id ${userType} } }',
          resolvedContent: 'query EnumQuery { user { id ${userType} } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>([
        ['userType', {
          variable: 'userType',
          type: 'enum',
          possibleValues: ['basic', 'premium', 'admin'],
          location: 'fragment',
          source: '${userType}',
        }],
      ]);

      const result = await generator.generate(queries, switches);

      expect(result).toHaveLength(3);
      expect(result.map(v => v.conditions.switches.userType)).toEqual(
        expect.arrayContaining(['basic', 'premium', 'admin'])
      );
    });

    it('should generate correct variant IDs', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: 'query-123',
          name: 'TestQuery',
          content: 'query TestQuery { user { id ${flag ? "name" : ""} } }',
          resolvedContent: 'query TestQuery { user { id ${flag ? "name" : ""} } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>([
        ['flag', {
          variable: 'flag',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: '${flag ? "name" : ""}',
        }],
      ]);

      const result = await generator.generate(queries, switches);

      expect(result[0].id).toMatch(/^query-123-variant-flag-/);
      expect(result[1].id).toMatch(/^query-123-variant-flag-/);
      expect(result[0].id).not.toBe(result[1].id);
    });

    it('should handle invalid GraphQL in variants gracefully', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'InvalidQuery',
          content: 'query { ${broken',
          resolvedContent: 'query { ${broken',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>([
        ['broken', {
          variable: 'broken',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: '${broken',
        }],
      ]);

      const result = await generator.generate(queries, switches);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to create variant for InvalidQuery:',
        expect.any(Error)
      );
      expect(result).toHaveLength(0);
    });

    it('should preserve fragment dependencies', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'QueryWithFragments',
          content: 'query QueryWithFragments { user { ...UserFields ${extra ? "extra" : ""} } }',
          resolvedContent: 'query QueryWithFragments { user { ...UserFields ${extra ? "extra" : ""} } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          allDependencies: ['UserFields', 'BaseFields'],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>([
        ['extra', {
          variable: 'extra',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: '${extra ? "extra" : ""}',
        }],
      ]);

      const result = await generator.generate(queries, switches);

      expect(result).toHaveLength(2);
      result.forEach(variant => {
        expect(variant.usedFragments).toEqual(['UserFields', 'BaseFields']);
      });
    });
  });

  describe('complex ternary expressions', () => {
    it('should handle nested ternary expressions', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'NestedQuery',
          content: 'query { user { id ${isAdmin ? "admin { level }" : "basic"} } }',
          resolvedContent: 'query { user { id ${isAdmin ? "admin { level }" : "basic"} } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>([
        ['isAdmin', {
          variable: 'isAdmin',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: '${isAdmin ? "admin { level }" : "basic"}',
        }],
      ]);

      const result = await generator.generate(queries, switches);

      const adminVariant = result.find(v => v.conditions.switches.isAdmin === true);
      expect(adminVariant!.content).toContain('admin');
      expect(adminVariant!.content).toContain('level');

      const basicVariant = result.find(v => v.conditions.switches.isAdmin === false);
      expect(basicVariant!.content).toContain('basic');
      expect(basicVariant!.content).not.toContain('admin');
    });

    it('should handle expressions with quotes correctly', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'QuotedQuery',
          content: 'query { user { ${flag ? \'field1\' : "field2"} } }',
          resolvedContent: 'query { user { ${flag ? \'field1\' : "field2"} } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>([
        ['flag', {
          variable: 'flag',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: "${flag ? 'field1' : \"field2\"}",
        }],
      ]);

      const result = await generator.generate(queries, switches);

      expect(result).toHaveLength(2);
      const trueVariant = result.find(v => v.conditions.switches.flag === true);
      expect(trueVariant!.content).toContain('field1');

      const falseVariant = result.find(v => v.conditions.switches.flag === false);
      expect(falseVariant!.content).toContain('field2');
    });
  });

  describe('edge cases', () => {
    it('should handle empty switches map', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'Query',
          content: 'query { user { id } }',
          resolvedContent: 'query { user { id } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const result = await generator.generate(queries, new Map());
      expect(result).toHaveLength(0);
    });

    it('should handle empty queries array', async () => {
      const switches = new Map<string, VariantSwitch>([
        ['flag', {
          variable: 'flag',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: '${flag}',
        }],
      ]);

      const result = await generator.generate([], switches);
      expect(result).toHaveLength(0);
    });

    it('should skip switches with no possible values', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'Query',
          content: 'query { user { id ${empty} } }',
          resolvedContent: 'query { user { id ${empty} } }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>([
        ['empty', {
          variable: 'empty',
          type: 'enum',
          possibleValues: [],
          location: 'fragment',
          source: '${empty}',
        }],
      ]);

      const result = await generator.generate(queries, switches);
      expect(result).toHaveLength(0);
    });

    it('should generate unique descriptions for each variant', async () => {
      const queries: ResolvedQuery[] = [
        {
          id: '1',
          name: 'Query',
          content: 'query { ${a ? "a" : ""} ${b ? "b" : ""} }',
          resolvedContent: 'query { ${a ? "a" : ""} ${b ? "b" : ""} }',
          filePath: '/src/queries.ts',
          location: { line: 1, column: 1 },
          hash: 'hash1',
          resolvedFragments: [],
          type: 'query',
        },
      ];

      const switches = new Map<string, VariantSwitch>([
        ['a', {
          variable: 'a',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: '${a ? "a" : ""}',
        }],
        ['b', {
          variable: 'b',
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
          source: '${b ? "b" : ""}',
        }],
      ]);

      const result = await generator.generate(queries, switches);

      const descriptions = result.map(v => v.conditions.description);
      expect(descriptions).toHaveLength(4);
      expect(new Set(descriptions).size).toBe(4); // All unique
      expect(descriptions).toEqual(expect.arrayContaining([
        'a=true, b=true',
        'a=true, b=false',
        'a=false, b=true',
        'a=false, b=false',
      ]));
    });
  });
});