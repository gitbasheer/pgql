import { describe, it, expect } from 'vitest';
import { SchemaDeprecationAnalyzer } from '../../src/core/analyzer/SchemaDeprecationAnalyzer';

describe('Endpoint mapping and validation', () => {
  it('maps to Offer Graph based on file name', () => {
    const analyzer = new SchemaDeprecationAnalyzer();
    const endpoint = analyzer.determineEndpoint('offer-graph-queries.js');
    expect(endpoint).toBe('https://og.api.example.com');
  });

  it('maps to Product Graph as default', () => {
    const analyzer = new SchemaDeprecationAnalyzer();
    const endpoint = analyzer.determineEndpoint('venture-queries.js');
    expect(endpoint).toBe('https://pg.api.example.com');
  });

  it('validates query against schema using graphql-inspector', async () => {
    const mockQuery = 'query GetVenture { venture { logoUrl } }'; // Deprecated field from sample schema
    const analyzer = new SchemaDeprecationAnalyzer();
    const result = await analyzer.validateAgainstSchema(mockQuery, 'productGraph');
    expect(result.errors).toContain('deprecated');
    expect(result.suggestions).toContain('profile.logoUrl');
  });

  it('detects breaking changes between schemas', async () => {
    const analyzer = new SchemaDeprecationAnalyzer();
    const oldSchema = `
      type Venture {
        id: ID!
        logoUrl: String @deprecated(reason: "Use profile.logoUrl")
      }
    `;
    const newSchema = `
      type Venture {
        id: ID!
        profile: VentureProfile!
      }
      type VentureProfile {
        logoUrl: String
      }
    `;
    const changes = await analyzer.compareSchemas(oldSchema, newSchema);
    expect(changes.breaking).toHaveLength(1);
    expect(changes.deprecated).toHaveLength(1);
  });
});
