/** @fileoverview External fragment validation tests for comprehensive coverage */

import { describe, it, expect, beforeEach } from 'vitest';
import { FragmentResolver } from '../../core/extraction/utils/FragmentResolver.js';
import { ExtractionContext } from '../../core/extraction/engine/ExtractionContext.js';
import { parse } from 'graphql';
import * as path from 'path';

describe('External Fragment Validation', () => {
  let fragmentResolver: FragmentResolver;
  let context: ExtractionContext;

  beforeEach(() => {
    context = new ExtractionContext({
      directory: 'test/fixtures/sample_data',
      resolveFragments: true,
      fragmentsDirectory: 'test/fixtures/sample_data'
    });
    fragmentResolver = new FragmentResolver(context);
  });

  describe('Fragment Loading from External Files', () => {
    it('should load fragments from profileFragments.js', async () => {
      const query = `
        query GetUserProfile {
          user {
            ...UserProfileFragment
          }
        }
      `;

      const ast = parse(query);
      const resolved = await fragmentResolver.resolveFragments(ast, 'test-file.ts');

      expect(resolved).toBeDefined();
      // Verify fragment was resolved from external file
      const fragments = context.getFragments();
      expect(fragments.has('UserProfileFragment')).toBe(true);
    });

    it('should handle nested fragment dependencies', async () => {
      const query = `
        query GetCompleteUser {
          user {
            ...CompleteUserFragment
          }
        }
        
        fragment CompleteUserFragment on User {
          ...BasicUserFragment
          ...ExtendedUserFragment
        }
      `;

      const ast = parse(query);
      const resolved = await fragmentResolver.resolveFragments(ast, 'test-file.ts');

      expect(resolved).toBeDefined();
      const fragments = context.getFragments();
      expect(fragments.has('CompleteUserFragment')).toBe(true);
      expect(fragments.has('BasicUserFragment')).toBe(true);
      expect(fragments.has('ExtendedUserFragment')).toBe(true);
    });

    it('should detect circular fragment dependencies', async () => {
      const query = `
        fragment FragmentA on User {
          ...FragmentB
        }
        
        fragment FragmentB on User {
          ...FragmentA
        }
        
        query TestCircular {
          user {
            ...FragmentA
          }
        }
      `;

      const ast = parse(query);
      
      await expect(
        fragmentResolver.resolveFragments(ast, 'test-file.ts')
      ).rejects.toThrow(/circular/i);
    });

    it('should provide clear error for missing fragments', async () => {
      const query = `
        query GetUser {
          user {
            ...NonExistentFragment
          }
        }
      `;

      const ast = parse(query);
      
      await expect(
        fragmentResolver.resolveFragments(ast, 'test-file.ts')
      ).rejects.toThrow(/Fragment "NonExistentFragment" not found/);
    });
  });

  describe('Fragment Interpolation Patterns', () => {
    it('should resolve ${fragmentName} interpolation patterns', async () => {
      const query = `
        query GetVenture {
          venture {
            ...\${ventureFragment}
          }
        }
      `;

      // Mock fragment registry with interpolated fragment
      context.addFragment('ventureFragment', `
        fragment ventureFragment on Venture {
          id
          name
          domain
        }
      `);

      const resolved = await fragmentResolver.resolveInterpolations(query);
      expect(resolved).toContain('...ventureFragment');
      expect(resolved).not.toContain('${');
    });

    it('should handle conditional fragment inclusion', async () => {
      const query = `
        query GetUser($includeProfile: Boolean!) {
          user {
            id
            name
            ...\${includeProfile ? 'UserProfileFragment' : ''}
          }
        }
      `;

      context.addFragment('UserProfileFragment', `
        fragment UserProfileFragment on User {
          email
          bio
          avatar
        }
      `);

      // Test with condition true
      const resolvedTrue = await fragmentResolver.resolveInterpolations(
        query.replace('includeProfile ?', 'true ?')
      );
      expect(resolvedTrue).toContain('...UserProfileFragment');

      // Test with condition false
      const resolvedFalse = await fragmentResolver.resolveInterpolations(
        query.replace('includeProfile ?', 'false ?')
      );
      expect(resolvedFalse).not.toContain('UserProfileFragment');
    });

    it('should handle complex fragment composition', async () => {
      const query = `
        query GetComplexData {
          venture {
            ...\${baseFragment}
            ...\${featuresEnabled.billing ? 'BillingFragment' : ''}
            ...\${featuresEnabled.analytics ? 'AnalyticsFragment' : ''}
          }
        }
      `;

      // Add test fragments
      context.addFragment('baseFragment', `
        fragment baseFragment on Venture {
          id
          name
        }
      `);

      context.addFragment('BillingFragment', `
        fragment BillingFragment on Venture {
          billing {
            plan
            status
          }
        }
      `);

      context.addFragment('AnalyticsFragment', `
        fragment AnalyticsFragment on Venture {
          analytics {
            views
            conversions
          }
        }
      `);

      // Mock feature flags
      const resolved = await fragmentResolver.resolveInterpolations(
        query
          .replace('baseFragment', 'baseFragment')
          .replace('featuresEnabled.billing', 'true')
          .replace('featuresEnabled.analytics', 'false')
      );

      expect(resolved).toContain('...baseFragment');
      expect(resolved).toContain('...BillingFragment');
      expect(resolved).not.toContain('...AnalyticsFragment');
    });

    it('should validate fragment compatibility with schema types', async () => {
      const query = `
        query GetUser {
          user {
            ...VentureFragment # Wrong type!
          }
        }
        
        fragment VentureFragment on Venture {
          id
          domain
        }
      `;

      const ast = parse(query);
      
      // This should fail validation due to type mismatch
      await expect(
        fragmentResolver.validateFragmentTypes(ast)
      ).rejects.toThrow(/Fragment "VentureFragment" cannot be spread on type "User"/);
    });
  });

  describe('External File Resolution Patterns', () => {
    it('should load fragments from multiple external files', async () => {
      const fragmentFiles = [
        'fragments.js',
        'profileFragments.js',
        'ventureFragments.js',
        'billingFragments.js'
      ];

      for (const file of fragmentFiles) {
        const fragments = await fragmentResolver.loadFragmentsFromFile(
          path.join('test/fixtures/sample_data', file)
        );
        
        expect(fragments.size).toBeGreaterThan(0);
        // Verify each file contributes unique fragments
        fragments.forEach((content, name) => {
          expect(content).toContain(`fragment ${name}`);
        });
      }
    });

    it('should handle dynamic fragment imports', async () => {
      const query = `
        query DynamicQuery {
          user {
            ...UserFragment
          }
        }
      `;

      // Simulate dynamic import resolution
      const dynamicFragments = await fragmentResolver.resolveDynamicImports([
        'import { UserFragment } from "./fragments"',
        'import { ProfileFragment } from "./profileFragments"'
      ]);

      expect(dynamicFragments.has('UserFragment')).toBe(true);
      expect(dynamicFragments.has('ProfileFragment')).toBe(true);
    });

    it('should cache resolved fragments for performance', async () => {
      const query = `
        query Test {
          user {
            ...CachedFragment
          }
        }
      `;

      context.addFragment('CachedFragment', `
        fragment CachedFragment on User {
          id
          name
        }
      `);

      // First resolution
      const start1 = Date.now();
      await fragmentResolver.resolveFragments(parse(query), 'test1.ts');
      const time1 = Date.now() - start1;

      // Second resolution (should be cached)
      const start2 = Date.now();
      await fragmentResolver.resolveFragments(parse(query), 'test2.ts');
      const time2 = Date.now() - start2;

      // Cached resolution should be significantly faster
      expect(time2).toBeLessThan(time1);
      expect(context.getCached('fragment:CachedFragment')).toBeDefined();
    });
  });
});