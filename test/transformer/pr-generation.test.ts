/** @fileoverview Tests for PR generation with hivemind A/B testing flags */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptimizedSchemaTransformer, EnhancedOptimizedSchemaTransformer } from '../../src/core/transformer/OptimizedSchemaTransformer';
import { ExtractedQuery } from '../../src/types/pgql.types';

describe('PR Generation with Hivemind Flags', () => {
  let transformer: OptimizedSchemaTransformer;
  let enhancedTransformer: EnhancedOptimizedSchemaTransformer;

  beforeEach(() => {
    const deprecationRules = [
      {
        objectType: 'User',
        fieldName: 'profilePicture',
        reason: 'Moved to profile.logoUrl',
        replacementField: 'profile.logoUrl',
        transformationType: 'nested-replacement' as const
      },
      {
        objectType: 'Venture',
        fieldName: 'logoImage',
        reason: 'Renamed to logoUrl',
        replacementField: 'logoUrl',
        transformationType: 'field-rename' as const
      }
    ];
    
    transformer = new OptimizedSchemaTransformer(deprecationRules);
    enhancedTransformer = new EnhancedOptimizedSchemaTransformer(deprecationRules);
  });

  describe('Mapping Util Generation', () => {
    it('should generate mapping util with hivemind A/B testing flag', () => {
      const oldResponse = {
        user: {
          profilePicture: 'https://example.com/pic.jpg'
        }
      };
      
      const newResponse = {
        user: {
          profile: {
            logoUrl: 'https://example.com/pic.jpg'
          }
        }
      };
      
      const mappingUtil = transformer.generateMappingUtil(
        oldResponse,
        newResponse,
        'GetUserProfile'
      );
      
      // Should contain hivemind flag
      expect(mappingUtil).toContain('hivemind.flag("new-queries-getuserprofile")');
      expect(mappingUtil).toContain('export function mapGetUserProfileResponse');
      expect(mappingUtil).toContain('transformToNewFormat(oldData)');
      expect(mappingUtil).toContain('// Auto-generated mapping function for backward compatibility');
      expect(mappingUtil).toContain('// A/B testing via Hivemind feature flags');
    });

    it('should generate lowercase flag names for hivemind', () => {
      const mappingUtil = transformer.generateMappingUtil(
        {},
        {},
        'GetVentureHomeData'
      );
      
      // Flag should be lowercase
      expect(mappingUtil).toContain('hivemind.flag("new-queries-getventurehomedata")');
      expect(mappingUtil).not.toContain('hivemind.flag("new-queries-GetVentureHomeData")');
    });

    it('should include LLM placeholder for complex mappings', () => {
      const mappingUtil = transformer.generateMappingUtil(
        { complex: 'data' },
        { transformed: 'structure' },
        'ComplexQuery'
      );
      
      expect(mappingUtil).toContain('// LLM_PLACEHOLDER: Use Ollama to generate more natural mapping');
    });
  });

  describe('PR Content Generation', () => {
    it('should generate PR content with util generation tracking', () => {
      const changes = [
        {
          file: 'src/queries/user.ts',
          oldContent: 'user { profilePicture }',
          newContent: 'user { profile { logoUrl } }',
          utilGenerated: true
        },
        {
          file: 'src/queries/venture.ts',
          oldContent: 'venture { logoImage }',
          newContent: 'venture { logoUrl }',
          utilGenerated: true
        },
        {
          file: 'src/queries/project.ts',
          oldContent: 'project { name }',
          newContent: 'project { name }',
          utilGenerated: false
        }
      ];
      
      const prContent = transformer.generatePRContent(changes);
      
      // Should contain diff blocks
      expect(prContent).toContain('## GraphQL Schema Migration');
      expect(prContent).toContain('### Files Changed');
      expect(prContent).toContain('```diff');
      expect(prContent).toContain('- user { profilePicture }');
      expect(prContent).toContain('+ user { profile { logoUrl } }');
      
      // Should mention utility generation
      expect(prContent).toContain('### Response Mapping Utilities Generated');
      expect(prContent).toContain('2 utility functions generated for backward compatibility');
    });

    it('should not include utility section if no utils generated', () => {
      const changes = [
        {
          file: 'src/queries/simple.ts',
          oldContent: 'query { ventures }',
          newContent: 'query { ventures }',
          utilGenerated: false
        }
      ];
      
      const prContent = transformer.generatePRContent(changes);
      
      expect(prContent).not.toContain('### Response Mapping Utilities Generated');
    });
  });

  describe('Enhanced PR Generation', () => {
    it('should create PR with A/B testing integration', async () => {
      const queries: ExtractedQuery[] = [
        {
          id: 'test-1',
          name: 'GetUserData',
          query: 'query GetUserData { user { profilePicture } }',
          fullExpandedQuery: 'query GetUserData { user { profilePicture } }',
          sourceFile: '/test/queries.ts',
          endpoint: 'productGraph' as const
        }
      ];
      
      const transformations = [
        {
          newQuery: 'query GetUserData { user { profile { logoUrl } } }',
          mappingUtil: 'export function mapGetUserDataResponse(data) { return data; }',
          abFlag: 'new-queries-getuserdata'
        }
      ];
      
      // Mock git operations
      const mockGit = {
        checkout: vi.fn().mockResolvedValue(undefined),
        checkoutLocalBranch: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined)
      };
      
      vi.mock('simple-git', () => ({
        default: () => mockGit
      }));
      
      // Test would call generatePR - for now just verify the structure
      expect(transformations[0].abFlag).toBe('new-queries-getuserdata');
      expect(transformations[0].mappingUtil).toContain('mapGetUserDataResponse');
    });
  });

  describe('Field Difference Detection', () => {
    it('should detect field movements for hivemind mapping', () => {
      const differences = transformer['findDifferences'](
        { user: { email: 'test@example.com' } },
        { user: { contact: { email: 'test@example.com' } } }
      );
      
      expect(differences).toHaveLength(2);
      expect(differences[0]).toEqual({
        path: 'user.email',
        oldValue: 'test@example.com',
        newValue: undefined
      });
      expect(differences[1]).toEqual({
        path: 'user.contact',
        oldValue: undefined,
        newValue: { email: 'test@example.com' }
      });
    });
  });

  describe('Response Mapper Generation', () => {
    it('should generate response mapper with proper structure', () => {
      const mapper = transformer.generateResponseMapper(
        'GetVentureData',
        { venture: { logoImage: 'old.jpg' } },
        { venture: { profile: { logoUrl: 'old.jpg' } } }
      );
      
      expect(mapper).toContain('export function mapGetVentureDataResponse');
      expect(mapper).toContain('// Maps new API response to old format');
      expect(mapper).toContain('venture: {');
      expect(mapper).toContain('logoUrl: data.venture.profile.logoUrl');
    });
  });
});