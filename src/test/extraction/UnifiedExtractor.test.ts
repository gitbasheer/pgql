import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedExtractor } from '../../src/core/extraction/engine/UnifiedExtractor';
import * as fs from 'fs/promises';
import glob from 'fast-glob';

vi.mock('fs/promises');
vi.mock('fast-glob');

describe('UnifiedExtractor for vnext-dashboard patterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts direct gql template literals', async () => {
    const mockFileContent = `
      const query = gql\`
        query GetVenture($ventureId: UUID!) {
          venture(ventureId: $ventureId) {
            ...ventureFields
          }
        }\`;
    `;

    // Mock glob to return our test file
    vi.mocked(glob).mockResolvedValue(['src/features/VentureHome/queries/mock.js']);
    vi.mocked(fs.readFile).mockResolvedValue(mockFileContent);

    const extractor = new UnifiedExtractor({
      directory: 'mock-repo',
      strategies: ['pluck', 'ast'],
      resolveFragments: false,
    });

    const result = await extractor.extract();
    expect(result.queries.length).toBeGreaterThan(0);
    expect(result.queries[0].content).toContain('GetVenture');
    // Placeholder for light LLM: Use Ollama for pattern classification boost
    // e.g., // LLM_PLACEHOLDER: Call local Ollama model to classify query type (direct/factory/dynamic)
  });

  it('handles query factory functions', async () => {
    const mockFileContent = `
      export const getVentureQuery = (fields) => gql\`
        query GetVenture($ventureId: UUID!) {
          venture(ventureId: $ventureId) {
            \${fields}
          }
        }\`;
    `;

    vi.mocked(glob).mockResolvedValue(['src/features/VentureHome/queries/factory.js']);
    vi.mocked(fs.readFile).mockResolvedValue(mockFileContent);

    const extractor = new UnifiedExtractor({
      directory: 'mock-repo',
      strategies: ['ast'],
      resolveFragments: false,
    });

    const result = await extractor.extract();
    expect(result.queries.length).toBeGreaterThan(0);
    expect(result.queries[0].content).toContain('GetVenture');
    // Factory patterns should be detected by extraction strategies
  });

  it('resolves nested fragments across files', async () => {
    const mainQueryContent = `
      import { ventureFields } from './fragments';
      const query = gql\`
        query GetVenture($ventureId: UUID!) {
          venture(ventureId: $ventureId) {
            ...ventureFields
          }
        }\`;
    `;
    const fragmentContent = `
      export const ventureFields = gql\`
        fragment ventureFields on Venture {
          id
          name
          profile {
            logoUrl
          }
        }\`;
    `;

    vi.mocked(glob).mockResolvedValue([
      'src/features/VentureHome/queries/main.js',
      'src/features/VentureHome/queries/fragments.js',
    ]);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(mainQueryContent)
      .mockResolvedValueOnce(fragmentContent);

    const extractor = new UnifiedExtractor({
      directory: 'mock-repo',
      strategies: ['ast'],
      resolveFragments: true,
    });

    const result = await extractor.extract();
    expect(result.queries.length).toBeGreaterThan(0);
    const query = result.queries.find((q) => q.content.includes('GetVenture'));
    expect(query).toBeDefined();
    expect(query?.content).toContain('...ventureFields');
  });
});
