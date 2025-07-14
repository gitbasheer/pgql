import { describe, it, expect } from 'vitest';
import { OptimizedSchemaTransformer } from '../../src/core/transformer/OptimizedSchemaTransformer';

describe('Transformation and util/PR generation', () => {
  it('transforms deprecated fields and generates mapping utils with A/B flags', () => {
    const oldQuery = 'query { venture { logoUrl } }'; // Deprecated
    const transformer = new OptimizedSchemaTransformer();
    const newQuery = transformer.transform(oldQuery, { deprecations: [{ field: 'logoUrl', replacement: 'profile.logoUrl' }] });
    expect(newQuery).toContain('profile.logoUrl');

    const oldResponse = { venture: { logoUrl: 'old.png' } };
    const newResponse = { venture: { profile: { logoUrl: 'new.png' } } };
    const utilFn = transformer.generateMappingUtil(oldResponse, newResponse, 'GetVenture');
    expect(utilFn).toContain('function mapGetVenture(oldData) { return { ...oldData, venture: { ...oldData.venture, profile: { logoUrl: oldData.venture.logoUrl } } }; }');
    expect(utilFn).toContain('if (hivemind.flag("new-queries")) { /* use new */ }'); // A/B via Hivemind

    // Generate PR mock (assert GitHub API or local diff)
    // LLM_PLACEHOLDER: Use Ollama to auto-generate util based on response JSON diffs for natural mapping
  });

  it('handles complex nested transformations', () => {
    const transformer = new OptimizedSchemaTransformer();
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
    
    const newQuery = transformer.transform(oldQuery, { deprecations });
    expect(newQuery).toContain('profile { logoUrl description }');
    expect(newQuery).toContain('owner { contact { email } }');
  });

  it('generates backward-compatible response mappers', () => {
    const transformer = new OptimizedSchemaTransformer();
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
    const transformer = new OptimizedSchemaTransformer();
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