#!/usr/bin/env node
/** @fileoverview Test template resolution for ${queryNames.xxx} patterns */

import { UnifiedExtractor } from './src/core/extraction/engine/UnifiedExtractor';
import { logger } from './src/utils/logger';

async function testTemplateResolution() {
  logger.info('🧪 Testing enhanced template resolution...');
  
  try {
    // Create extractor with sample data test configuration (use hybrid to catch all patterns)
    const extractor = new UnifiedExtractor({
      directory: './test/fixtures/sample_data',
      strategies: ['hybrid'],
      resolveFragments: true,
      patterns: ['**/*.ts']
    });
    
    // Extract from sampleQueries.ts specifically
    const sampleQueriesPath = '/Users/balkhalil/gd/demo/z/backup/pg-migration-620/test/fixtures/sample_data/sampleQueries.ts';
    logger.info(`📁 Extracting from: ${sampleQueriesPath}`);
    
    const queries = await extractor.extractFromFile(sampleQueriesPath);
    
    // Debug: show all extracted queries
    if (queries.length > 0) {
      queries.forEach((query, index) => {
        logger.info(`🔍 Query ${index + 1} details:`);
        logger.info(`   ID: ${query.id}`);
        logger.info(`   Name: ${query.name}`);
        logger.info(`   Type: ${query.type || 'fragment'}`);
        const contentPreview = query.content?.substring(0, 150) || '';
        const expandedPreview = query.fullExpandedQuery?.substring(0, 150) || '';
        logger.info(`   Content: ${contentPreview}...`);
        if (expandedPreview !== contentPreview) {
          logger.info(`   Expanded: ${expandedPreview}...`);
        }
        logger.info(`   Has templates: ${query.fullExpandedQuery?.includes('${') ? 'YES' : 'NO'}`);
      });
    }
    
    logger.info(`📊 Extracted ${queries.length} queries from sampleQueries.ts`);
    
    // Check if template resolution worked
    let resolvedCount = 0;
    let unresolvedCount = 0;
    
    queries.forEach((query, index) => {
      const hasUnresolvedTemplates = query.fullExpandedQuery?.includes('${');
      
      if (hasUnresolvedTemplates) {
        unresolvedCount++;
        logger.warn(`❌ Query ${index + 1} still contains unresolved templates:`);
        logger.warn(`   ${query.fullExpandedQuery?.substring(0, 100)}...`);
      } else {
        resolvedCount++;
        logger.info(`✅ Query ${index + 1} templates resolved successfully`);
        if (query.name) {
          logger.info(`   Name: ${query.name}`);
        }
      }
    });
    
    // Test expectation: expect(resolved).not.toContain('${')
    const allResolved = queries.every(q => !q.fullExpandedQuery?.includes('${'));
    
    logger.info(`\n📈 Template Resolution Results:`);
    logger.info(`   Resolved: ${resolvedCount}`);
    logger.info(`   Unresolved: ${unresolvedCount}`);
    logger.info(`   Success Rate: ${Math.round((resolvedCount / queries.length) * 100)}%`);
    
    if (allResolved) {
      logger.info('🎉 All templates resolved successfully! Test passes: expect(resolved).not.toContain("${")');
      return true;
    } else {
      logger.error(`❌ ${unresolvedCount} queries still contain unresolved templates`);
      return false;
    }
    
  } catch (error) {
    logger.error('💥 Template resolution test failed:', error);
    return false;
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testTemplateResolution()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { testTemplateResolution };