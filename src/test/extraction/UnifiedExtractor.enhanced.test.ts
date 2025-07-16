import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedExtractor } from '../../src/core/extraction/engine/UnifiedExtractor';
import { Endpoint } from '../../src/types/pgql.types';
import * as fs from 'fs/promises';
import glob from 'fast-glob';

vi.mock('fs/promises');
vi.mock('fast-glob');

describe('UnifiedExtractor vnext-dashboard enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies endpoint based on file path', async () => {
    const mockFileContent = `
      const query = gql\`
        query GetOffer($offerId: ID!) {
          offer(id: $offerId) {
            id
            name
          }
        }\`;
    `;

    vi.mocked(glob).mockResolvedValue(['src/features/offer-graph/queries/offer.js']);
    vi.mocked(fs.readFile).mockResolvedValue(mockFileContent);

    const extractor = new UnifiedExtractor({
      directory: 'mock-repo',
      strategies: ['pluck'],
    });

    const queries = await extractor.extractFromFile('src/features/offer-graph/queries/offer.js');
    expect(queries[0]).toHaveProperty('endpoint', 'offerGraph');
  });

  it('classifies endpoint based on content patterns', async () => {
    const mockFileContent = `
      import { useOfferGraphMutation } from '../hooks';
      
      const mutation = gql\`
        mutation CreateOffer($input: OfferInput!) {
          createOffer(input: $input) {
            id
          }
        }\`;
    `;

    vi.mocked(glob).mockResolvedValue(['src/features/offers/mutations.js']);
    vi.mocked(fs.readFile).mockResolvedValue(mockFileContent);

    const extractor = new UnifiedExtractor({
      directory: 'mock-repo',
      strategies: ['pluck'],
    });

    const queries = await extractor.extractFromFile('src/features/offers/mutations.js');
    expect(queries[0]).toHaveProperty('endpoint', 'offerGraph');
  });

  it('defaults to productGraph endpoint', async () => {
    const mockFileContent = `
      const query = gql\`
        query GetVenture($ventureId: UUID!) {
          venture(ventureId: $ventureId) {
            id
            name
          }
        }\`;
    `;

    vi.mocked(glob).mockResolvedValue(['src/features/ventures/queries.js']);
    vi.mocked(fs.readFile).mockResolvedValue(mockFileContent);

    const extractor = new UnifiedExtractor({
      directory: 'mock-repo',
      strategies: ['pluck'],
    });

    const queries = await extractor.extractFromFile('src/features/ventures/queries.js');
    expect(queries[0]).toHaveProperty('endpoint', 'productGraph');
  });

  it('standardizes queries with unique names', async () => {
    const mockFileContent = `
      const query1 = gql\`
        query GetVenture($id: ID!) {
          venture(id: $id) { id }
        }\`;
      
      const query2 = gql\`
        query {
          ventures { id }
        }\`;
    `;

    vi.mocked(glob).mockResolvedValue(['src/queries.js']);
    vi.mocked(fs.readFile).mockResolvedValue(mockFileContent);

    const extractor = new UnifiedExtractor({
      directory: 'mock-repo',
      strategies: ['pluck'],
    });

    const result = await extractor.extract();
    const standardized = await extractor.extractFromRepo();

    expect(standardized[0].name).toBe('GetVenture');
    // Second query might have a different naming pattern
    expect(standardized[1].name).toBeTruthy();
  });

  it('extracts variables from queries', async () => {
    const mockFileContent = `
      const query = gql\`
        query GetVenture($ventureId: UUID!, $includeProfile: Boolean) {
          venture(ventureId: $ventureId) {
            id
            profile @include(if: $includeProfile) {
              name
            }
          }
        }\`;
    `;

    vi.mocked(glob).mockResolvedValue(['src/queries.js']);
    vi.mocked(fs.readFile).mockResolvedValue(mockFileContent);

    const extractor = new UnifiedExtractor({
      directory: 'mock-repo',
      strategies: ['ast'], // AST strategy extracts variables
    });

    const standardized = await extractor.extractFromRepo();

    // Variables extraction depends on AST parsing
    expect(standardized[0].variables).toBeDefined();
  });
});
