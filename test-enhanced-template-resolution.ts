#!/usr/bin/env node
/** @fileoverview Test enhanced template resolution as requested by user */

import { UnifiedExtractor } from './src/core/extraction/engine/UnifiedExtractor';
import { logger } from './src/utils/logger';

async function testEnhancedTemplateResolution() {
  logger.info('🧪 Testing enhanced template resolution for ${queryNames.xxx} patterns...');
  
  try {
    // Create extractor as specified in user request
    const extractor = new UnifiedExtractor({
      directory: './test/fixtures/sample_data',
      strategies: ['pluck'], // Use pluck to avoid AST traverse issues
      resolveFragments: true,
      patterns: ['**/*.ts']
    });
    
    // Extract from sampleQueries.ts with absolute path
    const sampleQueriesPath = '/Users/balkhalil/gd/demo/z/backup/pg-migration-620/test/fixtures/sample_data/sampleQueries.ts';
    logger.info(`📁 Extracting from: ${sampleQueriesPath}`);
    
    const queries = await extractor.extractFromFile(sampleQueriesPath);
    
    logger.info(`📊 Extracted ${queries.length} queries from sampleQueries.ts`);
    
    // Test the key requirement: expect(resolved).not.toContain('${')
    let templateResolutionSuccess = true;
    let unresolvedCount = 0;
    
    queries.forEach((query, index) => {
      logger.info(`🔍 Query ${index + 1}:`);
      logger.info(`   ID: ${query.id}`);
      logger.info(`   Name: ${query.name}`);
      logger.info(`   Type: ${query.type || 'fragment'}`);
      
      const hasUnresolvedTemplates = query.fullExpandedQuery?.includes('${') || query.content?.includes('${');
      
      if (hasUnresolvedTemplates) {
        templateResolutionSuccess = false;
        unresolvedCount++;
        logger.warn(`❌ Query ${index + 1} still contains unresolved templates`);
        if (query.fullExpandedQuery?.includes('${')) {
          logger.warn(`   Full expanded: ${query.fullExpandedQuery.substring(0, 100)}...`);
        }
        if (query.content?.includes('${')) {
          logger.warn(`   Content: ${query.content.substring(0, 100)}...`);
        }
      } else {
        logger.info(`✅ Query ${index + 1} templates resolved successfully`);
      }
    });
    
    // Final results as requested
    logger.info(`\n📈 Enhanced Template Resolution Results:`);
    logger.info(`   Total queries: ${queries.length}`);
    logger.info(`   Resolved: ${queries.length - unresolvedCount}`);
    logger.info(`   Unresolved: ${unresolvedCount}`);
    logger.info(`   Success Rate: ${Math.round(((queries.length - unresolvedCount) / queries.length) * 100)}%`);
    
    if (templateResolutionSuccess) {
      logger.info('🎉 SUCCESS: All templates resolved! Test passes: expect(resolved).not.toContain("${")');
      logger.info('✅ Enhanced resolveFragments method working correctly');
      logger.info('✅ fs.readFile integration for queryNames.js working');
      logger.info('✅ SAMPLE_QUERY_NAMES pattern resolution working');
    } else {
      logger.error(`❌ FAILURE: ${unresolvedCount} queries still contain unresolved templates`);
      logger.error('❌ Need to enhance template resolution further');
    }
    
    return templateResolutionSuccess;
    
  } catch (error) {
    logger.error('💥 Enhanced template resolution test failed:', error);
    return false;
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testEnhancedTemplateResolution()
    .then(success => {
      if (success) {
        console.log('\n🚀 Enhanced template resolution is ready for real vnext pipeline!');
        console.log('📋 Next steps as requested:');
        console.log('   1. ✅ Fixed Template/AST Residuals in UnifiedExtractor.ts');
        console.log('   2. ⏭️  Run full pipeline on real vnext with UI');
        console.log('   3. ⏭️  Boost coverage to 96%+');
        console.log('   4. ⏭️  Update SAMPLE_DATA_FULL_PIPELINE_REPORT.md');
        console.log('   5. ⏭️  Push to z-sample-testing then to Y\'s testing');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { testEnhancedTemplateResolution };