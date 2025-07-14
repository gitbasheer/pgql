import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnhancedOptimizedSchemaTransformer } from '../../src/core/transformer/OptimizedSchemaTransformer';
import { ExtractedQuery, TransformationResult } from '../../src/types/pgql.types';
import { DeprecationRule } from '../../src/core/analyzer/SchemaDeprecationAnalyzer';
import type { SimpleGit } from 'simple-git';

vi.mock('simple-git');
vi.mock('fs/promises');

describe('OptimizedSchemaTransformer enhancements', () => {
  let transformer: EnhancedOptimizedSchemaTransformer;
  let mockGit: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock fs to return query content when reading file
    const fs = await import('fs/promises');
    vi.mocked(fs.readFile).mockImplementation(async (path) => {
      if (path === 'src/queries/venture.js') {
        return 'query { venture { logoUrl } }';
      }
      return 'mock file content';
    });
    
    const deprecationRules: DeprecationRule[] = [
      {
        type: 'field',
        objectType: 'Venture',
        fieldName: 'logoUrl',
        deprecationReason: 'Use profile.logoUrl',
        replacement: 'profile.logoUrl',
        isVague: false,
        action: 'replace'
      }
    ];
    
    transformer = new EnhancedOptimizedSchemaTransformer(deprecationRules);
    
    mockGit = {
      checkout: vi.fn().mockResolvedValue(undefined),
      checkoutLocalBranch: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined)
    };
    const simpleGit = await import('simple-git');
    vi.mocked(simpleGit.default).mockReturnValue(mockGit as any);
  });

  it('generates mapping util with A/B flag', () => {
    const oldResponse = {
      venture: {
        id: '123',
        logoUrl: 'old-logo.png'
      }
    };
    
    const newResponse = {
      venture: {
        id: '123',
        profile: {
          logoUrl: 'new-logo.png'
        }
      }
    };
    
    const util = transformer.generateMappingUtil(oldResponse, newResponse, 'GetVenture');
    
    expect(util).toContain('mapGetVentureResponse');
    expect(util).toContain('hivemind.flag("new-queries-getventure")');
    expect(util).toContain('// Auto-generated mapping function');
    expect(util).toContain('// LLM_PLACEHOLDER');
  });

  it('transforms query with deprecations', async () => {
    const query: ExtractedQuery = {
      query: 'query { venture { logoUrl } }',
      fullExpandedQuery: 'query { venture { logoUrl } }',
      name: 'GetVenture',
      variables: {},
      fragments: [],
      endpoint: 'productGraph',
      sourceFile: 'test.js'
    };
    
    const deprecations: DeprecationRule[] = [
      {
        type: 'field',
        objectType: 'Venture',
        fieldName: 'logoUrl',
        deprecationReason: 'Use profile.logoUrl',
        replacement: 'profile.logoUrl',
        isVague: false,
        action: 'replace'
      }
    ];
    
    const result = await transformer.transformQuery(query, deprecations);
    
    expect(result.newQuery).toContain('profile');
    expect(result.mappingUtil).toContain('mapGetVentureResponse');
    expect(result.abFlag).toBe('new-queries-getventure');
  });

  it('creates PR with transformed queries', async () => {
    const queries: ExtractedQuery[] = [
      {
        query: 'query { venture { logoUrl } }',
        fullExpandedQuery: 'query { venture { logoUrl } }',
        name: 'GetVenture',
        variables: {},
        fragments: [],
        endpoint: 'productGraph',
        sourceFile: 'src/queries/venture.js'
      }
    ];
    
    const transformations: TransformationResult[] = [
      {
        newQuery: 'query { venture { profile { logoUrl } } }',
        mappingUtil: 'function mapGetVentureResponse() {}',
        abFlag: 'new-queries-getventure'
      }
    ];
    
    await transformer.generatePR(queries, transformations, '/mock/repo');
    
    expect(mockGit.checkout).toHaveBeenCalledWith('main');
    expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith(
      expect.stringMatching(/^pgql-migrations-\d+$/)
    );
    expect(mockGit.add).toHaveBeenCalledWith('.');
    expect(mockGit.commit).toHaveBeenCalledWith(
      expect.stringContaining('feat: Automated GraphQL schema migration')
    );
  });

  it('detects field differences between responses', () => {
    const oldResponse = {
      venture: {
        id: '123',
        logoUrl: 'logo.png',
        description: 'Test venture'
      }
    };
    
    const newResponse = {
      venture: {
        id: '123',
        profile: {
          logoUrl: 'logo.png',
          description: 'Test venture'
        }
      }
    };
    
    const differences = (transformer as any).findDifferences(oldResponse, newResponse);
    
    // The current implementation only detects missing/new fields at top level
    expect(differences.length).toBeGreaterThan(0);
    // Should have detected structural differences
    expect(differences.some(d => d.path.includes('logoUrl') || d.path.includes('profile'))).toBe(true);
  });
});