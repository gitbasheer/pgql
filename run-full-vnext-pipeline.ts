#!/usr/bin/env tsx
import { UnifiedExtractor } from './src/core/extraction/engine/UnifiedExtractor.js';
import { ResponseValidationService } from './src/core/validator/ResponseValidationService.js';
import { OptimizedSchemaTransformer } from './src/core/transformer/OptimizedSchemaTransformer.js';
import { logger } from './src/utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function runFullPipeline() {
  logger.info('Starting full vnext-dashboard pipeline...');
  
  // Configuration
  const vnextPaths = [
    './test/fixtures/sample_data', // Start with sample data
    // Add real vnext paths if available
  ];
  
  // Step 1: Extract queries
  logger.info('Step 1: Extracting GraphQL queries...');
  
  let allQueries: any[] = [];
  for (const vnextPath of vnextPaths) {
    try {
      const extractor = new UnifiedExtractor({
        directory: vnextPath,
        strategies: ['hybrid'], // Use both AST and pluck
        resolveFragments: true,
        preserveSourceAST: true,
        features: {
          templateInterpolation: true,
          patternMatching: true,
          contextAnalysis: true
        }
      });
      
      const result = await extractor.extract();
      allQueries = allQueries.concat(result.queries);
      
      logger.info(`Extracted ${result.queries.length} queries from ${vnextPath}`);
      logger.info(`Template resolution: ${result.stats.templatesResolved}/${result.stats.templatesFound}`);
      
      // Show template examples
      const templatedQueries = result.queries.filter(q => q.content.includes('${'));
      if (templatedQueries.length > 0) {
        logger.info(`Found ${templatedQueries.length} queries with templates`);
      }
    } catch (error) {
      logger.error(`Error extracting from ${vnextPath}:`, error);
    }
  }
  
  logger.info(`Total queries extracted: ${allQueries.length}`);
  
  // Step 2: Validate with real API
  logger.info('Step 2: Validating queries against real API...');
  
  // Construct auth cookies from env
  const authCookies = [
    process.env.SSO_AUTH_IDP,
    process.env.SSO_CUST_IDP,
    process.env.SSO_INFO_CUST_IDP,
    process.env.SSO_INFO_IDP
  ].filter(Boolean).join('; ');
  
  // Sanitized logging
  logger.info('Using auth cookies: [REDACTED]');
  
  const validator = new ResponseValidationService({
    endpoints: {
      productGraph: process.env.APOLLO_PG_ENDPOINT || 'https://pg.api.godaddy.com/v1/gql/customer',
      offerGraph: process.env.APOLLO_OG_ENDPOINT || 'https://og.api.godaddy.com/v1/gql'
    },
    capture: {
      maxConcurrency: 5,
      timeout: 30000,
      variableGeneration: 'auto'
    },
    comparison: {
      strict: false,
      ignorePaths: []
    },
    alignment: {
      strict: false,
      preserveNulls: true
    },
    storage: {
      type: 'file',
      path: './pipeline-results'
    },
    testingAccount: {
      ventures: [{ id: process.env.TEST_VENTURE_ID || 'test-venture' }],
      projects: [{ domain: process.env.TEST_DOMAIN || 'test.com' }]
    }
  });
  
  // Test a subset of queries
  const testQueries = allQueries.slice(0, 5); // Test first 5 queries
  let validationResults = [];
  
  for (const query of testQueries) {
    try {
      const result = await validator.testOnRealApi({
        query: query.content,
        variables: query.variables || {},
        endpoint: query.endpoint || 'productGraph',
        headers: {
          'Cookie': authCookies,
          'Content-Type': 'application/json'
        }
      });
      validationResults.push(result);
      logger.info(`Validated query: ${query.name || 'unnamed'}`);
    } catch (error) {
      logger.error(`Validation error for ${query.name}:`, error);
    }
  }
  
  // Step 3: Generate transformations with Hivemind flags
  logger.info('Step 3: Generating transformations with Hivemind flags...');
  
  const transformer = new OptimizedSchemaTransformer(
    [], // Deprecation rules would come from analyzer
    {
      commentOutVague: true,
      addDeprecationComments: true,
      preserveOriginalAsComment: false,
      enableCache: true
    }
  );
  
  const transformationResult = {
    queries: allQueries,
    transformations: allQueries.map(q => ({
      original: q.content,
      transformed: transformer.transformWithOptions(q.content, {
        deprecations: []
      }),
      hivemindFlag: `migration.${q.name || 'unnamed'}`,
      utilGenerated: true
    }))
  };
  
  // Step 4: Generate PR
  logger.info('Step 4: Generating PR with Hivemind flags...');
  
  const prContent = transformer.generateMigrationSummary(
    transformationResult.transformations.map(t => ({
      queryName: t.hivemindFlag.replace('migration.', ''),
      original: t.original,
      transformed: t.transformed,
      utilGenerated: t.utilGenerated
    }))
  );
  
  logger.info('PR content generated with Hivemind flags');
  
  // Save results
  const resultsDir = './pipeline-results';
  await fs.mkdir(resultsDir, { recursive: true });
  
  await fs.writeFile(
    path.join(resultsDir, 'extraction-results.json'),
    JSON.stringify({ queries: allQueries, stats: { total: allQueries.length } }, null, 2)
  );
  
  await fs.writeFile(
    path.join(resultsDir, 'validation-results.json'),
    JSON.stringify(validationResults, null, 2)
  );
  
  await fs.writeFile(
    path.join(resultsDir, 'transformation-results.json'),
    JSON.stringify(transformationResult, null, 2)
  );
  
  await fs.writeFile(
    path.join(resultsDir, 'pr-content.md'),
    prContent
  );
  
  // Summary
  logger.info('=== Pipeline Summary ===');
  logger.info(`Queries extracted: ${allQueries.length}`);
  logger.info(`Queries validated: ${validationResults.length}`);
  logger.info(`Transformations generated: ${transformationResult.transformations.length}`);
  logger.info(`Results saved to: ${resultsDir}`);
  
  return {
    extraction: { total: allQueries.length },
    validation: { tested: validationResults.length },
    transformation: { generated: transformationResult.transformations.length }
  };
}

// Run the pipeline
runFullPipeline()
  .then(results => {
    logger.info('Pipeline completed successfully', results);
    process.exit(0);
  })
  .catch(error => {
    logger.error('Pipeline failed:', error);
    process.exit(1);
  });