import { describe, it, expect, beforeEach } from 'vitest';
import { OptimizedSchemaTransformer } from '../../src/core/transformer/OptimizedSchemaTransformer';
import { DeprecationRule } from '../../src/core/analyzer/SchemaDeprecationAnalyzer';

describe('Transformation and util/PR generation', () => {
  let transformer: OptimizedSchemaTransformer;
  let deprecationRules: DeprecationRule[];

  beforeEach(() => {
    deprecationRules = [
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
    transformer = new OptimizedSchemaTransformer(deprecationRules);
  });

  it('transforms deprecated fields and generates mapping utils with A/B flags', async () => {
    const oldQuery = 'query { venture { logoUrl } }'; // Deprecated
    const result = await transformer.transform(oldQuery);
    expect(result.transformed).toContain('profile');

    const oldResponse = { venture: { logoUrl: 'old.png' } };
    const newResponse = { venture: { profile: { logoUrl: 'new.png' } } };
    const utilFn = transformer.generateMappingUtil(oldResponse, newResponse, 'GetVenture');
    expect(utilFn).toContain('mapGetVentureResponse');
    expect(utilFn).toContain('hivemind.flag'); // A/B via Hivemind

    // Generate PR mock (assert GitHub API or local diff)
    // LLM_PLACEHOLDER: Use Ollama to auto-generate util based on response JSON diffs for natural mapping
  });

  it('handles complex nested transformations', async () => {
    const moreRules: DeprecationRule[] = [
      ...deprecationRules,
      {
        type: 'field',
        objectType: 'Venture',
        fieldName: 'description',
        deprecationReason: 'Use profile.description',
        replacement: 'profile.description',
        isVague: false,
        action: 'replace'
      },
      {
        type: 'field',
        objectType: 'User',
        fieldName: 'email',
        deprecationReason: 'Use contact.email',
        replacement: 'contact.email',
        isVague: false,
        action: 'replace'
      }
    ];
    const complexTransformer = new OptimizedSchemaTransformer(moreRules);
    const oldQuery = `
      query GetVenture {
        venture {
          id
          logoUrl
          description
          owner {
            email
          }
        }
      }
    `;
    const deprecations = [
      { field: 'logoUrl', replacement: 'profile.logoUrl' },
      { field: 'description', replacement: 'profile.description' },
      { field: 'owner.email', replacement: 'owner.contact.email' }
    ];
    
    const result = await complexTransformer.transform(oldQuery);
    expect(result.transformed).toContain('profile');
    expect(result.transformed).toContain('logoUrl');
  });

  it('generates backward-compatible response mappers', () => {
    const oldResponse = {
      venture: {
        id: '123',
        logoUrl: 'logo.png',
        owner: { email: 'test@example.com' }
      }
    };
    const newResponse = {
      venture: {
        id: '123',
        profile: { logoUrl: 'logo.png' },
        owner: { contact: { email: 'test@example.com' } }
      }
    };
    
    const mapper = transformer.generateResponseMapper('GetVenture', oldResponse, newResponse);
    expect(mapper).toContain('mapGetVentureResponse');
    expect(mapper).toContain('// Maps new API response to old format for backward compatibility');
    expect(mapper).toContain('logoUrl: data.venture.profile.logoUrl');
    expect(mapper).toContain('email: data.venture.owner.contact.email');
  });

  it('creates PR with diff visualization', () => {
    const changes = [
      {
        file: 'src/queries/venture.js',
        oldContent: 'query { venture { logoUrl } }',
        newContent: 'query { venture { profile { logoUrl } } }',
        utilGenerated: true
      }
    ];
    
    const prContent = transformer.generatePRContent(changes);
    expect(prContent).toContain('## GraphQL Schema Migration');
    expect(prContent).toContain('### Files Changed');
    expect(prContent).toContain('```diff');
    expect(prContent).toContain('- query { venture { logoUrl } }');
    expect(prContent).toContain('+ query { venture { profile { logoUrl } } }');
    expect(prContent).toContain('### Response Mapping Utilities Generated');
  });
});