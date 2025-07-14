#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { MigrationOrchestrator } from '../core/MigrationOrchestrator';
import { ConfigLoader } from '../utils/ConfigLoader';
import { logger } from '../utils/logger';
import { PatternAwareExtraction } from '../core/extraction/PatternAwareExtraction';

const program = new Command();

program
  .name('pg-migrate')
  .description('Production-grade GraphQL migration tool with safety-first approach')
  .version('0.1.0');

// Analyze command
program
  .command('analyze')
  .description('Analyze GraphQL operations in your codebase')
  .option('-s, --source <path>', 'Source directory to analyze', './src')
  .option('-c, --config <path>', 'Configuration file path', './migration.config.yaml')
  .option('--detailed', 'Show detailed analysis report')
  .action(async (options) => {
    const spinner = ora('Analyzing GraphQL operations...').start();

    try {
      const config = await ConfigLoader.load(options.config);
      const orchestrator = new MigrationOrchestrator(config);

      const results = await orchestrator.analyze(options.source);
      spinner.succeed(`Found ${results.operations.length} GraphQL operations`);

      if (options.detailed) {
        console.log(chalk.bold('\nDetailed Analysis:'));
        results.operations.forEach(op => {
          console.log(`\n${chalk.blue(op.name)} (${op.type})`);
          console.log(`  File: ${op.file}:${op.line}:${op.column}`);
          console.log(`  Confidence: ${op.confidence?.score || 'Not analyzed'}`);
          console.log(`  Fragments: ${op.fragments.length}`);
        });
      }

      console.log(chalk.green('\n✓ Analysis complete'));
    } catch (error) {
      spinner.fail('Analysis failed');
      logger.error('Analysis error:', error);
      process.exit(1);
    }
  });

// Transform command
program
  .command('transform')
  .description('Transform GraphQL operations based on deprecations')
  .option('-s, --source <path>', 'Source directory', './src')
  .option('-c, --config <path>', 'Configuration file path', './migration.config.yaml')
  .option('--confidence <number>', 'Minimum confidence score for automatic transformation', '90')
  .option('--dry-run', 'Preview changes without applying them')
  .action(async (options) => {
    const spinner = ora('Transforming GraphQL operations...').start();

    try {
      const config = await ConfigLoader.load(options.config);
      const orchestrator = new MigrationOrchestrator(config);

      const minConfidence = parseInt(options.confidence);
      const results = await orchestrator.transform({
        source: options.source,
        minConfidence,
        dryRun: options.dryRun
      });

      spinner.succeed(`Transformed ${results.transformed} operations`);

      console.log(chalk.bold('\nTransformation Summary:'));
      console.log(`  Automatic: ${results.automatic}`);
      console.log(`  Semi-automatic: ${results.semiAutomatic}`);
      console.log(`  Manual required: ${results.manual}`);

      if (options.dryRun) {
        console.log(chalk.yellow('\n⚠️  Dry run mode - no changes were applied'));
      }

      console.log(chalk.green('\n✓ Transformation complete'));
    } catch (error) {
      spinner.fail('Transformation failed');
      logger.error('Transformation error:', error);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate transformed GraphQL operations')
  .option('-s, --source <path>', 'Source directory', './src')
  .option('-c, --config <path>', 'Configuration file path', './migration.config.yaml')
  .option('--schema <path>', 'GraphQL schema path', './schema.graphql')
  .action(async (options) => {
    const spinner = ora('Validating GraphQL operations...').start();

    try {
      const config = await ConfigLoader.load(options.config);
      const orchestrator = new MigrationOrchestrator(config);

      const results = await orchestrator.validate({
        source: options.source,
        schemaPath: options.schema
      });

      if (results.valid) {
        spinner.succeed('All operations are valid');
      } else {
        spinner.fail(`${results.errors.length} validation errors found`);

        console.log(chalk.red('\nValidation Errors:'));
        results.errors.forEach(error => {
          console.log(`\n${chalk.red('✗')} ${error.operation}`);
          console.log(`  ${error.message}`);
        });
      }

      process.exit(results.valid ? 0 : 1);
    } catch (error) {
      spinner.fail('Validation failed');
      logger.error('Validation error:', error);
      process.exit(1);
    }
  });

// Apply command (with progressive rollout)
program
  .command('apply')
  .description('Apply GraphQL migrations with progressive rollout')
  .option('-o, --operation <name>', 'Specific operation to migrate')
  .option('-r, --rollout <percentage>', 'Initial rollout percentage', '1')
  .option('-c, --config <path>', 'Configuration file path', './migration.config.yaml')
  .action(async (options) => {
    const spinner = ora('Applying migrations...').start();

    try {
      const config = await ConfigLoader.load(options.config);
      const orchestrator = new MigrationOrchestrator(config);

      const rolloutPercentage = parseInt(options.rollout);

      if (options.operation) {
        // Single operation rollout
        await orchestrator.applyOperation(options.operation, rolloutPercentage);
        spinner.succeed(`Started rollout for ${options.operation} at ${rolloutPercentage}%`);
      } else {
        // All operations rollout
        const results = await orchestrator.applyAll(rolloutPercentage);
        spinner.succeed(`Started rollout for ${results.count} operations at ${rolloutPercentage}%`);
      }

      console.log(chalk.green('\n✓ Migrations applied successfully'));
      console.log(chalk.yellow('\n⚠️  Monitor health metrics before increasing rollout'));
    } catch (error) {
      spinner.fail('Migration failed');
      logger.error('Migration error:', error);
      process.exit(1);
    }
  });

// Monitor command
program
  .command('monitor')
  .description('Monitor migration health and metrics')
  .option('-o, --operation <name>', 'Specific operation to monitor')
  .option('-c, --config <path>', 'Configuration file path', './migration.config.yaml')
  .option('--real-time', 'Enable real-time monitoring')
  .action(async (options) => {
    try {
      const config = await ConfigLoader.load(options.config);
      const orchestrator = new MigrationOrchestrator(config);

      if (options.realTime) {
        console.log(chalk.bold('Real-time monitoring started (Ctrl+C to exit)\n'));

        const interval = setInterval(async () => {
          const health = await orchestrator.getHealth(options.operation);

          console.clear();
          console.log(chalk.bold('Migration Health Status\n'));

          if (options.operation) {
            displayOperationHealth(options.operation, health);
          } else {
            Object.entries(health).forEach(([op, status]) => {
              displayOperationHealth(op, status);
            });
          }
        }, 5000);

        process.on('SIGINT', () => {
          clearInterval(interval);
          process.exit(0);
        });
      } else {
        const health = await orchestrator.getHealth(options.operation);

        if (options.operation) {
          displayOperationHealth(options.operation, health);
        } else {
          Object.entries(health).forEach(([op, status]) => {
            displayOperationHealth(op, status);
          });
        }
      }
    } catch (error) {
      logger.error('Monitoring error:', error);
      process.exit(1);
    }
  });

// Rollback command
program
  .command('rollback')
  .description('Rollback GraphQL migrations')
  .option('-o, --operation <name>', 'Specific operation to rollback')
  .option('-r, --reason <reason>', 'Reason for rollback', 'Manual rollback')
  .option('-c, --config <path>', 'Configuration file path', './migration.config.yaml')
  .option('--immediate', 'Immediate rollback (default is gradual)')
  .action(async (options) => {
    const spinner = ora('Rolling back migrations...').start();

    try {
      const config = await ConfigLoader.load(options.config);
      const orchestrator = new MigrationOrchestrator(config);

      const strategy = options.immediate ? 'immediate' : 'gradual';

      if (options.operation) {
        await orchestrator.rollbackOperation(options.operation, options.reason);
        spinner.succeed(`Rolled back ${options.operation}`);
      } else {
        const results = await orchestrator.rollbackAll(strategy, options.reason);
        spinner.succeed(`Rolled back ${results.count} operations`);
      }

      console.log(chalk.yellow('\n⚠️  Rollback complete'));
      console.log(`Reason: ${options.reason}`);
    } catch (error) {
      spinner.fail('Rollback failed');
      logger.error('Rollback error:', error);
      process.exit(1);
    }
  });

// Helper function to display operation health
function displayOperationHealth(operation: string, health: any) {
  const statusIcon: Record<string, string> = {
    healthy: chalk.green('●'),
    degraded: chalk.yellow('●'),
    unhealthy: chalk.red('●')
  };

  console.log(`\n${statusIcon[health.status]} ${chalk.bold(operation)}`);
  console.log(`  Status: ${health.status}`);
  console.log(`  Success Rate: ${(health.successRate * 100).toFixed(2)}%`);
  console.log(`  Error Rate: ${(health.errorRate * 100).toFixed(2)}%`);
  console.log(`  P99 Latency: ${health.latency.p99}ms`);

  if (health.issues.length > 0) {
    console.log(`  Issues:`);
    health.issues.forEach((issue: any) => {
      console.log(`    - [${issue.severity}] ${issue.message}`);
    });
  }
}

// Migrate command - unified pipeline
program
  .command('migrate')
  .description('Run complete migration pipeline: Extract → Validate → Transform → Apply → Generate PR')
  .option('-d, --directory <path>', 'Directory to scan', './src')
  .option('-s, --schema <path>', 'GraphQL schema path', './schema.graphql')
  .option('-c, --config <path>', 'Configuration file path', './migration.config.yaml')
  .option('--confidence <number>', 'Minimum confidence for automatic transformation', '90')
  .option('--dry-run', 'Preview changes without applying')
  .option('--interactive', 'Step-by-step interactive mode')
  .option('--create-pr', 'Create GitHub PR after migration')
  .option('--pr-base <branch>', 'Base branch for PR', 'main')
  .option('--rollout <percentage>', 'Initial rollout percentage', '1')
  .option('--no-cache', 'Disable caching for fresh analysis')
  .action(async (options) => {
    const spinner = ora('Starting unified migration pipeline...').start();

    try {
      const config = await ConfigLoader.load(options.config);
      const orchestrator = new MigrationOrchestrator(config);

      // Override config with CLI options
      if (options.directory) {
        config.source.include = [options.directory];
      }
      if (options.schema) {
        (config as any).schemaPath = options.schema;
      }

      // Step 1: Analyze
      spinner.text = 'Analyzing GraphQL operations...';
      const analysis = await orchestrator.analyze(options.directory);
      spinner.succeed(`Found ${analysis.operations.length} operations`);

      // Step 2: Validate
      spinner.start('Validating operations...');
      const validation = await orchestrator.validate({
        source: options.directory,
        schemaPath: options.schema
      });

      if (!validation.valid) {
        spinner.fail(`Validation failed: ${validation.errors.length} errors`);
        console.log(chalk.red('\nValidation Errors:'));
        validation.errors.forEach(err => {
          console.log(`  - ${err.operation}: ${err.message}`);
        });

        if (!options.interactive) {
          process.exit(1);
        }
      } else {
        spinner.succeed('All operations validated');
      }

      // Step 3: Transform
      spinner.start('Transforming operations...');
      const transformResult = await orchestrator.transform({
        source: options.directory,
        minConfidence: parseInt(options.confidence),
        dryRun: options.dryRun
      });
      spinner.succeed(`Transformed ${transformResult.transformed} operations`);

      console.log(chalk.bold('\nTransformation Summary:'));
      console.log(`  Automatic: ${transformResult.automatic}`);
      console.log(`  Semi-automatic: ${transformResult.semiAutomatic}`);
      console.log(`  Manual required: ${transformResult.manual}`);

      if (options.dryRun) {
        console.log(chalk.yellow('\n⚠️  Dry run - no changes applied'));
        process.exit(0);
      }

      // Step 4: Apply with progressive rollout
      if (transformResult.transformed > 0) {
        spinner.start('Applying migrations...');
        const applyResult = await orchestrator.applyAll(parseInt(options.rollout));
        spinner.succeed(`Applied ${applyResult.count} migrations at ${options.rollout}%`);

        // Step 5: Create PR if requested
        if (options.createPr) {
          spinner.start('Creating GitHub pull request...');

          // Import GitHubService dynamically
          const { GitHubService } = await import('../core/integration/GitHubService');
          const githubService = new GitHubService();

          const prOptions = {
            title: `GraphQL Migration: ${transformResult.transformed} operations updated`,
            body: `## GraphQL Migration Summary\n\n` +
                  `- **Operations Analyzed**: ${analysis.operations.length}\n` +
                  `- **Transformations Applied**: ${transformResult.transformed}\n` +
                  `- **Confidence Level**: ${options.confidence}%\n` +
                  `- **Rollout Percentage**: ${options.rollout}%\n\n` +
                  `### Breakdown\n` +
                  `- Automatic: ${transformResult.automatic}\n` +
                  `- Semi-automatic: ${transformResult.semiAutomatic}\n` +
                  `- Manual required: ${transformResult.manual}\n`,
            base: options.prBase,
            draft: options.interactive
          };

          const pr = await githubService.createPR(prOptions);
          spinner.succeed(`Created PR: ${pr.url}`);
        }
      }

            console.log(chalk.green('\n✓ Migration pipeline completed successfully'));

    } catch (error) {
      spinner.fail('Migration failed');
      logger.error('Migration error:', error);
      process.exit(1);
    }
  });

// Pattern-based migration command (NEW)
program
  .command('pattern-migrate')
  .description('Run pattern-aware migration with centralized query naming')
  .option('-d, --directory <path>', 'Directory to scan', './src')
  .option('-p, --pattern <pattern>', 'File pattern to match', '**/*.{ts,tsx,js,jsx}')
  .option('-o, --output <file>', 'Output file for results')
  .option('--verbose', 'Verbose output')
  .option('--dry-run', 'Preview analysis without making changes')
  .action(async (options) => {
    const spinner = ora('Starting pattern-aware migration...').start();

    try {
      spinner.text = 'Initializing pattern-based extraction...';

      const extraction = new PatternAwareExtraction({
        directory: options.directory,
        patterns: [options.pattern],
        resolveNames: true,
        preserveSourceAST: true
      });

      spinner.text = 'Extracting queries with pattern awareness...';
      const result = await extraction.extract();

      const { extraction: extractionResult, migration } = result;

      spinner.succeed(`Analyzed ${extractionResult.queries.length} queries`);

      console.log(chalk.bold('\n📊 Pattern-Aware Migration Results'));
      console.log('═'.repeat(60));

      // Display extraction insights
      const patternQueries = extractionResult.queries.filter((q: any) => q.namePattern);
      const staticQueries = extractionResult.queries.length - patternQueries.length;

      console.log(`Total queries: ${extractionResult.queries.length}`);
      console.log(`Dynamic pattern queries: ${patternQueries.length}`);
      console.log(`Static queries: ${staticQueries}`);

      // Display migration summary
      console.log(chalk.bold('\n🔄 Migration Analysis:'));
      console.log(`Queries needing migration: ${migration.summary.needsMigration}`);
      console.log(`Manual review required: ${migration.summary.requiresManualReview}`);
      console.log(`Pattern-based migrations: ${migration.summary.patternBasedMigrations}`);

      // Display version progression
      if (Object.keys(migration.summary.versionProgression).length > 0) {
        console.log(chalk.bold('\n📈 Version Progression:'));
        for (const [progression, count] of Object.entries(migration.summary.versionProgression)) {
          console.log(`  ${progression}: ${count} queries`);
        }
      }

      // Display queryNames updates
      if (migration.queryNamesUpdates.changes.length > 0) {
        console.log(chalk.bold('\n🔧 QueryNames Object Updates:'));
        for (const change of migration.queryNamesUpdates.changes) {
          console.log(`  ${change.property}: ${change.from} → ${change.to}`);
          console.log(`    Reason: ${change.reason}`);
        }
      }

      // Display benefits
      console.log(chalk.bold('\n✅ Benefits Realized:'));
      console.log('  • Application logic preserved');
      console.log('  • Pattern metadata tracked');
      console.log('  • Content-based duplicate detection');
      console.log('  • Safe migration recommendations');

      // Save results if requested
      if (options.output) {
        const fs = await import('fs');
        await fs.promises.writeFile(
          options.output,
          JSON.stringify(result, null, 2),
          'utf-8'
        );
        console.log(chalk.green(`\n💾 Results saved to: ${options.output}`));
      }

      console.log(chalk.green('\n✓ Pattern-aware migration analysis complete!'));

    } catch (error) {
      spinner.fail('Pattern-aware migration failed');
      logger.error('Pattern migration error:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);
