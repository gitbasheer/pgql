#!/usr/bin/env npx tsx
import { UnifiedExtractor } from './src/core/extraction/engine/UnifiedExtractor.js';
import { logger } from './src/utils/logger.js';
import * as fs from 'fs/promises';

async function extractAllSampleData() {
  logger.info('Starting comprehensive extraction from all sample data...');

  const extractor = new UnifiedExtractor({
    directory: './data/sample_data',
    strategies: ['pluck'], // Use pluck to avoid AST issues
    resolveFragments: true,
    preserveSourceAST: false,
    features: {
      templateInterpolation: true,
      patternMatching: true,
      contextAnalysis: true,
    },
    patterns: ['**/*.{js,jsx,ts,tsx}'],
    ignore: ['**/node_modules/**'],
  });

  const result = await extractor.extract();

  // Log detailed results
  logger.info('=== Extraction Results ===');
  logger.info(`Total queries extracted: ${result.queries.length}`);
  logger.info(`Total fragments: ${Object.keys(result.fragments).length}`);
  logger.info(`Total errors: ${result.errors?.length || 0}`);
  logger.info(`Files processed: ${result.stats.processedFiles}/${result.stats.totalFiles}`);

  // Check for template patterns
  const templatedQueries = result.queries.filter((q) => q.content.includes('${'));
  logger.info(`Queries with template patterns: ${templatedQueries.length}`);

  // Show template examples
  if (templatedQueries.length > 0) {
    logger.info('\nExample templates found:');
    templatedQueries.slice(0, 3).forEach((q) => {
      const matches = q.content.match(/\$\{[^}]+\}/g);
      if (matches) {
        logger.info(`  ${q.name}: ${matches.join(', ')}`);
      }
    });
  }

  // List query counts by file
  const fileMap = new Map<string, number>();
  result.queries.forEach((q) => {
    const file = q.filePath.replace(/.*\/sample_data\//, '');
    fileMap.set(file, (fileMap.get(file) || 0) + 1);
  });

  logger.info('\nQueries by file:');
  Array.from(fileMap.entries()).forEach(([file, count]) => {
    logger.info(`  ${file}: ${count} queries`);
  });

  // Save comprehensive results
  await fs.writeFile('./all-sample-extraction.json', JSON.stringify(result, null, 2));

  return result;
}

extractAllSampleData()
  .then((result) => {
    logger.info(`\n✅ Extraction complete! Total: ${result.queries.length} queries`);
    if (result.queries.length >= 69) {
      logger.info('✅ Successfully extracted 69+ queries as expected!');
    } else {
      logger.info(`📊 Extracted ${result.queries.length} queries from sample data`);
    }
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Extraction failed:', error);
    process.exit(1);
  });
