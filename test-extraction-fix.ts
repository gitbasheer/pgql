/** @fileoverview Quick test to verify extraction fix */

import { UnifiedExtractor } from './src/core/extraction/engine/UnifiedExtractor.js';

async function testExtraction() {
  console.log('Testing extraction with our fixes...\n');
  
  const extractor = new UnifiedExtractor({
    directory: '/Users/balkhalil/gd/demo/z/backup/pg-migration-620/data/sample_data',
    patterns: ['**/*.js'],
    strategies: ['pluck'], // Use pluck to avoid AST issues
  });
  
  try {
    // Test single file extraction
    const sampleFile = '/Users/balkhalil/gd/demo/z/backup/pg-migration-620/data/sample_data/shared-graph-queries-v1.js';
    console.log(`Extracting from: ${sampleFile}`);
    
    const queries = await extractor.extractFromFile(sampleFile);
    console.log(`Extracted ${queries.length} queries`);
    
    if (queries.length > 0) {
      console.log('\nFirst query:');
      console.log('- Name:', queries[0].name);
      console.log('- Endpoint:', queries[0].endpoint);
      console.log('- Has content:', !!queries[0].content);
      console.log('- Content preview:', queries[0].content?.substring(0, 100) + '...');
    }
    
    // Test offer graph file
    const offerFile = '/Users/balkhalil/gd/demo/z/backup/pg-migration-620/data/sample_data/offer-graph-queries.js';
    console.log(`\nExtracting from: ${offerFile}`);
    
    const offerQueries = await extractor.extractFromFile(offerFile);
    console.log(`Extracted ${offerQueries.length} queries`);
    console.log('Endpoint classification:', offerQueries[0]?.endpoint);
    
  } catch (error) {
    console.error('Extraction failed:', error);
  }
}

testExtraction();