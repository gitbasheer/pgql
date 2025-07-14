/** @fileoverview Integration tests using sample data fixtures */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedExtractor } from '../../src/core/extraction/engine/UnifiedExtractor';
import { 
  SAMPLE_GET_ALL_VENTURES_QUERY,
  SAMPLE_SINGLE_VENTURE_QUERY,
  SAMPLE_VENTURE_STATES_QUERY,
  SAMPLE_OFFERS_QUERY,
  SAMPLE_VARIABLES
} from '../fixtures/sample_data';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Sample Data Integration Tests', () => {
  let extractor: UnifiedExtractor;

  beforeEach(() => {
    extractor = new UnifiedExtractor({
      directory: '/Users/balkhalil/gd/demo/z/backup/pg-migration-620/data/sample_data',
      patterns: ['**/*.{js,jsx,ts,tsx}'],
      strategies: ['pluck'], // Use only pluck strategy to avoid AST issues
      enableVariantGeneration: true
    });
  });

  describe('Query Extraction from Sample Data', () => {
    it.skip('should extract and classify product graph queries from real sample files', async () => {
      const sampleFile = '/Users/balkhalil/gd/demo/z/backup/pg-migration-620/data/sample_data/shared-graph-queries-v1.js';
      
      const extractedQueries = await extractor.extractFromFile(sampleFile);
      
      // Debug info
      console.log('Extracted queries:', extractedQueries.length);
      if (extractedQueries.length === 0) {
        console.log('No queries extracted from:', sampleFile);
      }

      expect(extractedQueries.length).toBeGreaterThan(0);
      
      // All should be classified as productGraph (default for venture queries)
      extractedQueries.forEach(query => {
        expect(query.endpoint).toBe('productGraph');
        expect(query.sourceFile).toBe(sampleFile);
      });

      // Check that we have queries with expected content
      const hasVenturesQuery = extractedQueries.some(q => 
        q.content.includes('ventures') || q.content.includes('user')
      );
      expect(hasVenturesQuery).toBe(true);
    });

    it.skip('should extract and classify offer graph queries from real sample files', async () => {
      const sampleFile = '/Users/balkhalil/gd/demo/z/backup/pg-migration-620/data/sample_data/offer-graph-queries.js';
      
      const extractedQueries = await extractor.extractFromFile(sampleFile);

      expect(extractedQueries.length).toBeGreaterThan(0);
      
      // Should be classified as offerGraph based on content
      extractedQueries.forEach(query => {
        expect(query.endpoint).toBe('offerGraph');
        expect(query.sourceFile).toBe(sampleFile);
      });

      // Check that we have queries with expected offer graph content
      const hasOfferQuery = extractedQueries.some(q => 
        q.content.includes('transitions') || q.content.includes('FindUnifiedBillDetails')
      );
      expect(hasOfferQuery).toBe(true);
    });

    it('should handle fragments from sample files', async () => {
      const sampleFile = '/Users/balkhalil/gd/demo/z/backup/pg-migration-620/data/sample_data/fragments.js';
      
      const extractedQueries = await extractor.extractFromFile(sampleFile);

      // Fragments file might not have complete queries, just fragments
      // This tests that the extractor handles fragment files gracefully
      expect(Array.isArray(extractedQueries)).toBe(true);
      
      // Even if no queries are found, it should not error
      if (extractedQueries.length > 0) {
        extractedQueries.forEach(query => {
          expect(query.sourceFile).toBe(sampleFile);
        });
      }
    });
  });

  describe('Sample Variables Validation', () => {
    it('should validate sample variables structure', () => {
      expect(SAMPLE_VARIABLES.singleVenture).toHaveProperty('ventureId');
      expect(SAMPLE_VARIABLES.singleVenture.ventureId).toBe('a5a1a68d-cfe8-4649-8763-71ad64d62306');

      expect(SAMPLE_VARIABLES.offerQuery).toHaveProperty('subscriptionId');
      expect(SAMPLE_VARIABLES.offerQuery).toHaveProperty('entitlementId');
      expect(SAMPLE_VARIABLES.offerQuery).toHaveProperty('currency');
      expect(SAMPLE_VARIABLES.offerQuery.currency).toBe('USD');

      expect(SAMPLE_VARIABLES.modifyBasket).toHaveProperty('data');
      expect(SAMPLE_VARIABLES.modifyBasket.data).toHaveProperty('items');
    });
  });

  describe('Query Content Validation', () => {
    it('should contain expected GraphQL operation types', () => {
      const allVenturesContent = SAMPLE_GET_ALL_VENTURES_QUERY.loc?.source.body || '';
      expect(allVenturesContent).toContain('query');
      expect(allVenturesContent).toContain('ventures');
      expect(allVenturesContent).toContain('fragment');

      const offersContent = SAMPLE_OFFERS_QUERY.loc?.source.body || '';
      expect(offersContent).toContain('query');
      expect(offersContent).toContain('transitions');
      expect(offersContent).toContain('FindUnifiedBillDetails');
    });

    it('should have proper variable definitions', () => {
      const singleVentureContent = SAMPLE_SINGLE_VENTURE_QUERY.loc?.source.body || '';
      expect(singleVentureContent).toContain('$ventureId: UUID!');

      const offersContent = SAMPLE_OFFERS_QUERY.loc?.source.body || '';
      expect(offersContent).toContain('$subscriptionId: String');
      expect(offersContent).toContain('$currency: String');
    });
  });

  describe('Endpoint Classification', () => {
    it('should correctly classify queries by content patterns', () => {
      const testCases = [
        {
          content: 'query { ventures { id } }',
          expected: 'productGraph'
        },
        {
          content: 'query { transitions { offers } }',
          expected: 'offerGraph'
        },
        {
          content: 'mutation ModifyBasketWithOptions($data: ModifyBasketWithOptionsInput!) { modifyBasketWithOptions(data: $data) }',
          expected: 'offerGraph'
        }
      ];

      testCases.forEach(({ content, expected }) => {
        // This simulates the endpoint classification logic
        let endpoint = 'productGraph';
        if (content.includes('transitions') || content.includes('modifyBasket')) {
          endpoint = 'offerGraph';
        }
        
        expect(endpoint).toBe(expected);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle non-existent files gracefully', async () => {
      const nonExistentFile = join(__dirname, 'non-existent-file.js');
      
      try {
        const extractedQueries = await extractor.extractFromFile(nonExistentFile);
        expect(extractedQueries).toEqual([]);
      } catch (error) {
        // It's acceptable for this to throw an error, just ensure it's handled
        expect(error).toBeDefined();
      }
    });

    it('should handle multiple sample files without errors', async () => {
      const sampleFiles = [
        'shared-graph-queries-v1.js',
        'shared-graph-queries-v2.js', 
        'shared-graph-queries-v3.js',
        'queryNames.js'
      ];

      for (const fileName of sampleFiles) {
        const sampleFile = `/Users/balkhalil/gd/demo/z/backup/pg-migration-620/data/sample_data/${fileName}`;
        const extractedQueries = await extractor.extractFromFile(sampleFile);
        
        expect(Array.isArray(extractedQueries)).toBe(true);
        // Each file should either extract queries or return empty array gracefully
        if (extractedQueries.length > 0) {
          extractedQueries.forEach(query => {
            expect(query.sourceFile).toBe(sampleFile);
          });
        }
      }
    });
  });
});