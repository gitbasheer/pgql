#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { UnifiedMigrationPipeline } from '../core/pipeline/UnifiedMigrationPipeline';
import { ConfigLoader } from '../utils/ConfigLoader';
import { logger } from '../utils/logger';
import { GitHubService } from '../core/integration/GitHubService';

const program = new Command();

program
  .name('pg-migrate')
  .description('Unified GraphQL migration command - Extract → Validate → Transform → Apply → Generate PR')
  .option('-d, --directory <path>', 'Directory to scan for GraphQL operations', './src')
  .option('-s, --schema <path>', 'GraphQL schema file path', './schema.graphql')
  .option('-c, --config <path>', 'Configuration file path', './migration.config.yaml')
  .option('--confidence <number>', 'Minimum confidence score for automatic transformation', '90')
  .option('--dry-run', 'Preview changes without applying them')
  .option('--interactive', 'Step-by-step interactive mode')
  .option('--create-pr', 'Automatically create a GitHub PR after migration')
  .option('--pr-base <branch>', 'Base branch for PR (default: main)', 'main')
  .option('--pr-title <title>', 'Custom PR title')
  .option('--rollout <percentage>', 'Initial rollout percentage for progressive migration', '1')
  .option('--no-safety', 'Skip safety checks (not recommended)')
  .option('--no-cache', 'Disable caching for fresh analysis')
  .option('--validate-responses', 'Validate that transformed queries return identical data')
  .option('--validation-endpoint <url>', 'GraphQL endpoint for response validation')
  .option('--validation-token <token>', 'Authentication token for validation endpoint')
  .option('--generate-alignments', 'Generate alignment functions for response differences')
  .option('--setup-ab-test', 'Setup A/B test for gradual migration')
  .action(async (options) => {
    const startTime = Date.now();
    let spinner = ora('Initializing migration pipeline...').start();

    try {
      // Load configuration
      const config = await ConfigLoader.load(options.config);

      // Override config with CLI options
      if (options.directory) {
        config.source.include = [options.directory];
      }
      if (options.schema) {
        config.schemaPath = options.schema;
      }

      // Clear caches if --no-cache is specified
      if (options.cache === false) {
        const { astCache, validationCache, transformCache } = await import('../core/cache/CacheManager');
        await Promise.all([
          astCache.clear(),
          validationCache.clear(),
          transformCache.clear()
        ]);
        logger.info('Caches cleared for fresh analysis');
      }

      // Create unified pipeline
      const pipeline = new UnifiedMigrationPipeline(config, {
        minConfidence: parseInt(options.confidence),
        dryRun: options.dryRun,
        interactive: options.interactive,
        enableSafety: options.safety !== false,
        rolloutPercentage: parseInt(options.rollout),
        cache: options.cache !== false,
        responseValidation: options.validateResponses ? {
          enabled: true,
          endpoint: options.validationEndpoint,
          authToken: options.validationToken,
          generateAlignments: options.generateAlignments,
          setupABTest: options.setupAbTest
        } : undefined
      });

      spinner.succeed('Pipeline initialized');

      // Step 1: Extract
      spinner = ora('Extracting GraphQL operations...').start();
      const extractionResult = await pipeline.extract();
      spinner.succeed(`Extracted ${extractionResult.operations.length} operations from ${extractionResult.files.length} files`);

      if (options.interactive) {
        await displayExtractionSummary(extractionResult);
        const proceed = await confirmStep('Proceed to validation?');
        if (!proceed) {
          logger.info('Migration cancelled by user');
          process.exit(0);
        }
      }

      // Step 2: Validate
      spinner = ora('Validating GraphQL operations...').start();
      const validationResult = await pipeline.validate();

      if (validationResult.hasErrors) {
        spinner.fail(`Validation failed: ${validationResult.errors.length} errors found`);
        displayValidationErrors(validationResult);

        if (!options.interactive || !(await confirmStep('Continue despite validation errors?'))) {
          process.exit(1);
        }
      } else {
        spinner.succeed('All operations validated successfully');
      }

      // Step 3: Transform
      spinner = ora('Analyzing and transforming operations...').start();
      const transformationResult = await pipeline.transform();
      spinner.succeed(`Transformed ${transformationResult.transformed.length} operations`);

      if (options.interactive) {
        await displayTransformationSummary(transformationResult);
        const proceed = await confirmStep('Proceed to apply changes?');
        if (!proceed) {
          logger.info('Migration cancelled by user');
          process.exit(0);
        }
      }

      // Step 4: Response Validation (if enabled)
      if (options.validateResponses && options.validationEndpoint) {
        spinner = ora('Validating response data integrity...').start();
        const validationReport = await pipeline.validateResponses();

        if (validationReport) {
          if (validationReport.summary.safeToMigrate) {
            spinner.succeed('Response validation passed - data integrity maintained');
          } else {
            spinner.fail(`Response validation failed: ${validationReport.summary.breakingChanges} breaking changes detected`);

            console.log(chalk.yellow('\n⚠️  Response Validation Summary:'));
            console.log(`  Average Similarity: ${(validationReport.summary.averageSimilarity * 100).toFixed(1)}%`);
            console.log(`  Breaking Changes: ${validationReport.summary.breakingChanges}`);
            console.log(`  Risk Level: ${validationReport.summary.estimatedRisk}`);

            if (!options.interactive || !(await confirmStep('Continue despite response differences?'))) {
              process.exit(1);
            }
          }
        }
      }

      // Step 5: Apply
      if (!options.dryRun) {
        spinner = ora('Applying transformations...').start();
        const applicationResult = await pipeline.apply();
        spinner.succeed(`Applied changes to ${applicationResult.modifiedFiles.length} files`);

        if (options.interactive) {
          displayApplicationSummary(applicationResult);
        }

        // Step 5: Generate PR (if requested)
        if (options.createPr) {
          spinner = ora('Creating GitHub pull request...').start();

          const githubService = new GitHubService();
          const pr = await githubService.createPR({
            title: `GraphQL Schema Migration: ${applicationResult.operationsUpdated} operations updated`,
            body: pipeline.generatePRDescription(),
            base: options.prBase,
            draft: options.interactive
          });

          spinner.succeed(`Created PR: ${pr.url}`);
          console.log(chalk.green(`\n✅ Pull Request: ${pr.url}`));
        }

        // Step 6: Setup Progressive Rollout (if safety enabled)
        if (options.safety !== false && !options.dryRun) {
          spinner = ora('Setting up progressive rollout...').start();
          const rolloutResult = await pipeline.setupProgressiveRollout();
          spinner.succeed(`Progressive rollout configured for ${rolloutResult.operations.length} operations at ${options.rollout}%`);

          console.log(chalk.yellow('\n⚠️  Progressive Rollout Active'));
          console.log('Monitor health metrics with: pg-migrate monitor');
          console.log('Increase rollout with: pg-migrate rollout --increase');
        }
      } else {
        console.log(chalk.yellow('\n⚠️  Dry run mode - no changes were applied'));
      }

      // Final summary
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(chalk.green(`\n✅ Migration completed in ${duration}s`));

      displayFinalSummary(pipeline.getSummary());

      // Add response validation summary if available
      const responseValidationSummary = pipeline.getResponseValidationSummary();
      if (responseValidationSummary) {
        console.log(responseValidationSummary);
      }

      // Cleanup
      await pipeline.cleanup();

    } catch (error) {
      spinner.fail('Migration failed');
      logger.error('Migration error:', error);
      console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Helper functions
async function confirmStep(message: string): Promise<boolean> {
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message,
      default: true
    }
  ]);
  return answer.proceed;
}

function displayExtractionSummary(result: any): void {
  console.log(chalk.bold('\n📊 Extraction Summary:'));
  console.log(`  Total operations: ${result.operations.length}`);
  console.log(`  Queries: ${result.summary.queries}`);
  console.log(`  Mutations: ${result.summary.mutations}`);
  console.log(`  Subscriptions: ${result.summary.subscriptions}`);
  console.log(`  Files scanned: ${result.files.length}`);
}

function displayValidationErrors(result: any): void {
  console.log(chalk.red('\n❌ Validation Errors:'));
  result.errors.forEach((error: any) => {
    console.log(`  - ${error.operation}: ${error.message}`);
  });
}

function displayTransformationSummary(result: any): void {
  console.log(chalk.bold('\n🔄 Transformation Summary:'));
  console.log(`  Automatic: ${result.automatic} (high confidence)`);
  console.log(`  Semi-automatic: ${result.semiAutomatic} (requires review)`);
  console.log(`  Manual: ${result.manual} (needs manual intervention)`);
  console.log(`  Skipped: ${result.skipped} (low confidence or errors)`);
}

function displayApplicationSummary(result: any): void {
  console.log(chalk.bold('\n✏️  Application Summary:'));
  console.log(`  Files modified: ${result.modifiedFiles.length}`);
  console.log(`  Operations updated: ${result.operationsUpdated}`);
  console.log(`  Lines changed: +${result.linesAdded} -${result.linesRemoved}`);
}

function displayFinalSummary(summary: any): void {
  console.log(chalk.bold('\n📈 Final Summary:'));
  console.log(`  Operations processed: ${summary.totalOperations}`);
  console.log(`  Successful transformations: ${summary.successfulTransformations}`);
  console.log(`  Files modified: ${summary.filesModified}`);
  console.log(`  Confidence score average: ${summary.averageConfidence.toFixed(1)}%`);

  if (summary.risks.length > 0) {
    console.log(chalk.yellow('\n⚠️  Identified Risks:'));
    summary.risks.forEach((risk: string) => {
      console.log(`  - ${risk}`);
    });
  }
}

// Only parse if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  program.parse(process.argv);
}

// Export for testing
export { program };
