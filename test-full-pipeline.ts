#!/usr/bin/env tsx
import { UnifiedMigrationPipeline } from './src/core/pipeline/UnifiedMigrationPipeline';
import { MigrationConfig } from './src/types';
import { config } from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';

// Load environment variables
config();

async function testFullPipeline() {
  console.log('Testing Full Migration Pipeline...\n');

  const migrationConfig: MigrationConfig = {
    source: {
      include: ['./data/sample_data'],
      exclude: []
    },
    confidence: {
      automatic: 90,
      semiAutomatic: 70,
      manual: 0
    },
    rollout: {
      initial: 1,
      increment: 10,
      interval: '1h',
      maxErrors: 5
    },
    safety: {
      requireApproval: false,
      autoRollback: true,
      healthCheckInterval: 60
    }
  };

  const pipelineOptions = {
    minConfidence: 70,
    dryRun: true, // Don't actually modify files
    interactive: false,
    enableSafety: true,
    rolloutPercentage: 1,
    responseValidation: {
      enabled: true,
      endpoint: 'https://pg.api.godaddy.com/graphql',
      authToken: process.env.GODADDY_SSO_COOKIE,
      generateAlignments: true,
      setupABTest: false
    }
  };

  try {
    const pipeline = new UnifiedMigrationPipeline(migrationConfig, pipelineOptions);

    console.log('1. Extracting queries from Z\'s fixtures...');
    const extraction = await pipeline.extract();
    console.log(`✅ Extracted ${extraction.operations.length} operations`);
    console.log(`   - Queries: ${extraction.summary.queries}`);
    console.log(`   - Mutations: ${extraction.summary.mutations}`);
    console.log(`   - Subscriptions: ${extraction.summary.subscriptions}`);

    console.log('\n2. Validating operations...');
    const validation = await pipeline.validate();
    console.log(`✅ Validation complete`);
    console.log(`   - Errors: ${validation.errors.length}`);
    console.log(`   - Warnings: ${validation.warnings.length}`);

    console.log('\n3. Transforming operations...');
    const transformation = await pipeline.transform();
    console.log(`✅ Transformation complete`);
    console.log(`   - Automatic: ${transformation.automatic}`);
    console.log(`   - Semi-automatic: ${transformation.semiAutomatic}`);
    console.log(`   - Manual: ${transformation.manual}`);
    console.log(`   - Skipped: ${transformation.skipped}`);

    console.log('\n4. Generating PR description...');
    const prDescription = pipeline.generatePRDescription();
    console.log('✅ PR description generated');
    
    // Save PR description to file
    await fs.writeFile('./test-pr-description.md', prDescription, 'utf-8');
    console.log('   - Saved to: test-pr-description.md');

    console.log('\n5. Getting summary...');
    const summary = pipeline.getSummary();
    console.log('✅ Summary:');
    console.log(`   - Total operations: ${summary.totalOperations}`);
    console.log(`   - Successful transformations: ${summary.successfulTransformations}`);
    console.log(`   - Files modified: ${summary.filesModified}`);
    console.log(`   - Average confidence: ${summary.averageConfidence.toFixed(1)}%`);
    console.log(`   - Risks: ${summary.risks.join(', ') || 'None'}`);

    // Test response validation if enabled
    if (pipelineOptions.responseValidation.enabled && process.env.GODADDY_SSO_COOKIE) {
      console.log('\n6. Validating responses (this may take a moment)...');
      const responseValidation = await pipeline.validateResponses();
      if (responseValidation) {
        console.log('✅ Response validation complete');
        console.log(`   - Safe to migrate: ${responseValidation.summary.safeToMigrate}`);
        console.log(`   - Breaking changes: ${responseValidation.summary.breakingChanges}`);
        console.log(`   - Average similarity: ${(responseValidation.summary.averageSimilarity * 100).toFixed(1)}%`);
      }
    }

    console.log('\n✅ Full pipeline test completed successfully!');
    
    // Cleanup
    await pipeline.cleanup();
    
    return true;

  } catch (error) {
    console.error('❌ Pipeline test failed:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    return false;
  }
}

// Run the test
testFullPipeline().then((success) => {
  process.exit(success ? 0 : 1);
});