#!/usr/bin/env npx tsx
import { UnifiedExtractor } from './src/core/extraction/engine/UnifiedExtractor.js';
import { logger } from './src/utils/logger.js';
import * as fs from 'fs/promises';

async function extractAllSampleQueries() {
  logger.info('Starting comprehensive sample data extraction...');
  
  const extractor = new UnifiedExtractor({
    directory: './test/fixtures/sample_data',
    strategies: ['pluck'], // Use pluck to avoid AST issues for now
    resolveFragments: true,
    preserveSourceAST: false,
    features: {
      templateInterpolation: true,
      patternMatching: true,
      contextAnalysis: true
    },
    patterns: ['**/*.ts']
  });
  
  const result = await extractor.extract();
  
  // Log detailed results
  logger.info('=== Extraction Results ===');
  logger.info(`Total queries extracted: ${result.queries.length}`);
  logger.info(`Total fragments: ${Object.keys(result.fragments).length}`);
  logger.info(`Total errors: ${result.errors?.length || 0}`);
  logger.info(`Files processed: ${result.stats.processedFiles}/${result.stats.totalFiles}`);
  
  // Check for template patterns
  const templatedQueries = result.queries.filter(q => q.content.includes('${'));
  logger.info(`Queries with template patterns: ${templatedQueries.length}`);
  
  // List all query names
  logger.info('\nExtracted queries:');
  result.queries.forEach((query, idx) => {
    logger.info(`  ${idx + 1}. ${query.name || 'unnamed'} (${query.type}) - ${query.filePath}`);
  });
  
  // Save comprehensive results
  await fs.writeFile(
    './sample-extraction-detailed.json',
    JSON.stringify(result, null, 2)
  );
  
  // Look for specific queries we expect
  const expectedPatterns = [
    'getVentureHomeData',
    'getUserDetails', 
    'venture',
    'product',
    'domain'
  ];
  
  expectedPatterns.forEach(pattern => {
    const matching = result.queries.filter(q => 
      q.name?.toLowerCase().includes(pattern.toLowerCase()) ||
      q.content.toLowerCase().includes(pattern.toLowerCase())
    );
    logger.info(`Queries matching '${pattern}': ${matching.length}`);
  });
  
  return result;
}

extractAllSampleQueries()
  .then(result => {
    logger.info(`\nExtraction complete! Total: ${result.queries.length} queries`);
    if (result.queries.length >= 69) {
      logger.info('✅ Successfully extracted 69+ queries as expected!');
    } else {
      logger.warn(`⚠️  Only extracted ${result.queries.length} queries, expected 69+`);
    }
    process.exit(0);
  })
  .catch(error => {
    logger.error('Extraction failed:', error);
    process.exit(1);
  });