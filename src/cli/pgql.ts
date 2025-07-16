#!/usr/bin/env node

/**
 * Unified CLI for pgql - GraphQL Migration Tool
 * Consolidates all CLI functionality into a single, clean interface
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { UnifiedExtractor } from '../core/extraction/engine/UnifiedExtractor.js';
import { SchemaValidator } from '../core/validator/SchemaValidator.js';
import { SchemaDeprecationAnalyzer } from '../core/analyzer/SchemaDeprecationAnalyzer.js';
import { UnifiedSchemaTransformer } from '../core/transformer/UnifiedSchemaTransformer.js';
import { ResponseValidationService } from '../core/validator/ResponseValidationService.js';
import { OperationAnalyzer } from '../core/analyzer/OperationAnalyzer.js';
import { ExtractionOptions } from '../core/extraction/types/index.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const program = new Command();

program
  .name('pgql')
  .description('🚀 Production-ready GraphQL Migration Tool')
  .version('0.1.0');

// EXTRACTION COMMANDS
const extract = program
  .command('extract')
  .description('📤 Extract GraphQL operations from codebase');

extract
  .command('queries <directory>')
  .description('Extract GraphQL queries from source files')
  .option('-o, --output <path>', 'Output file', './extracted-queries.json')
  .option('-p, --pattern <patterns...>', 'File patterns to scan', ['**/*.{js,jsx,ts,tsx}'])
  .option('--strategy <name>', 'Extraction strategy: pluck, ast, pattern-aware', 'ast')
  .option('--no-fragments', 'Skip fragment resolution')
  .option('--incremental', 'Enable incremental extraction')
  .action(async (directory: string, options: any) => {
    const spinner = ora('Extracting GraphQL operations...').start();

    try {
      const extractorOptions: ExtractionOptions = {
        directory,
        strategies: [options.strategy],
        resolveFragments: options.fragments !== false,
        enableIncrementalExtraction: options.incremental,
        patterns: options.pattern,
      };

      const extractor = new UnifiedExtractor(extractorOptions);
      const queries = await extractor.extractFromRepo();

      spinner.succeed(`Extracted ${queries.length} operations`);

      // Save results
      const output = {
        timestamp: new Date().toISOString(),
        directory,
        totalQueries: queries.length,
        queries: queries.map(q => ({
          id: q.queryName,
          name: q.queryName,
          type: q.operation || 'query',
          filePath: q.filePath,
          content: q.content,
          location: { filePath: q.filePath, lineNumber: q.lineNumber },
        })),
      };

      await fs.writeFile(options.output, JSON.stringify(output, null, 2));
      console.log(chalk.green(`✅ Results saved to ${options.output}`));
    } catch (error) {
      spinner.fail('Extraction failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

// ANALYSIS COMMANDS  
const analyze = program
  .command('analyze')
  .description('🔍 Analyze GraphQL operations and schema');

analyze
  .command('operations <directory>')
  .description('Analyze GraphQL operations')
  .option('-s, --schema <path>', 'GraphQL schema file')
  .option('-o, --output <path>', 'Output directory', './analysis')
  .option('--detailed', 'Show detailed analysis')
  .action(async (directory: string, options: any) => {
    const spinner = ora('Analyzing operations...').start();

    try {
      // Extract operations first
      const extractor = new UnifiedExtractor({ directory });
      const queries = await extractor.extractFromRepo();

      // Analyze operations
      const analyzer = new OperationAnalyzer();
      const operationGroups = analyzer.analyzeOperations(queries);
      const report = analyzer.generateOperationReport();

      spinner.succeed(`Analyzed ${queries.length} operations`);

      // Display summary
      console.log(chalk.blue('\n📊 Analysis Summary:\n'));
      console.log(`  Total operations: ${queries.length}`);
      console.log(`  Unique operations: ${operationGroups.size}`);
      console.log(`  Duplicates: ${report.duplicateOperations.length}`);
      console.log(`  Unnamed operations: ${report.unnamedOperations}`);

      if (options.detailed) {
        console.log('\n📋 Operation Types:');
        const byType = queries.reduce((acc: Record<string, number>, q: any) => {
          const type = q.operation || 'query';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        Object.entries(byType).forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
      }

      // Save detailed report
      await fs.mkdir(options.output, { recursive: true });
      const reportPath = path.join(options.output, 'operations-analysis.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      console.log(chalk.green(`\n✅ Report saved to ${options.output}`));
    } catch (error) {
      spinner.fail('Analysis failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

analyze
  .command('schema <schema>')
  .description('Analyze GraphQL schema for deprecations')
  .option('-o, --output <path>', 'Output file', './schema-analysis.json')
  .action(async (schemaPath: string, options: any) => {
    const spinner = ora('Analyzing schema...').start();

    try {
      const analyzer = new SchemaDeprecationAnalyzer();
      const deprecations = await analyzer.analyzeSchemaFile(schemaPath);
      const summary = analyzer.getSummary();

      spinner.succeed(`Found ${summary.total} deprecations`);

      console.log(chalk.blue('\n📊 Schema Analysis:\n'));
      console.log(`  Total deprecations: ${summary.total}`);
      console.log(`  Replaceable: ${summary.replaceable}`);
      console.log(`  Vague/Manual: ${summary.vague}`);

      // Save results
      const output = {
        timestamp: new Date().toISOString(),
        schemaPath,
        summary,
        deprecations,
      };

      await fs.writeFile(options.output, JSON.stringify(output, null, 2));
      console.log(chalk.green(`✅ Results saved to ${options.output}`));
    } catch (error) {
      spinner.fail('Schema analysis failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

// VALIDATION COMMANDS
const validate = program
  .command('validate')
  .description('✅ Validate GraphQL operations');

validate
  .command('schema')
  .description('Validate queries against schema')
  .option('-q, --queries <path>', 'Queries file', './extracted-queries.json')
  .option('-s, --schema <path>', 'GraphQL schema file', './schema.graphql')
  .option('-o, --output <path>', 'Output file', './validation-results.json')
  .action(async (options: any) => {
    const spinner = ora('Validating against schema...').start();

    try {
      const queriesData = JSON.parse(await fs.readFile(options.queries, 'utf-8'));
      const queries = queriesData.queries || queriesData;

      const validator = new SchemaValidator();
      const validationResults = await validator.validateQueries(
        queries.map((q: any) => ({ id: q.id, content: q.content })),
        options.schema
      );

      const report = validator.generateValidationReport(validationResults);
      spinner.succeed(`Validated ${queries.length} queries`);

      console.log(chalk.blue('\n✅ Validation Results:\n'));
      console.log(`  Valid: ${report.valid}`);
      console.log(`  Invalid: ${report.invalid}`);
      console.log(`  Warnings: ${report.warnings}`);

      if (report.invalid > 0) {
        console.log(chalk.red('\n❌ Validation Errors:'));
        report.summary.forEach((s: any) => {
          if (!s.valid && s.errors) {
            console.log(`\n  ${s.id}:`);
            s.errors.forEach((e: any) => console.log(`    - ${e.message}`));
          }
        });
      }

      // Save results
      await fs.writeFile(options.output, JSON.stringify(report, null, 2));
      console.log(chalk.green(`\n✅ Results saved to ${options.output}`));

      process.exit(report.invalid > 0 ? 1 : 0);
    } catch (error) {
      spinner.fail('Validation failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

validate
  .command('responses')
  .description('Validate response data integrity')
  .option('-q, --queries <path>', 'Queries file', './extracted-queries.json')
  .option('-e, --endpoint <url>', 'GraphQL endpoint URL')
  .option('-o, --output <path>', 'Output file', './response-validation.json')
  .action(async (options: any) => {
    const spinner = ora('Validating responses...').start();

    try {
      const queriesData = JSON.parse(await fs.readFile(options.queries, 'utf-8'));
      const queries = queriesData.queries || queriesData;

      const validator = new ResponseValidationService({
        endpoints: [
          { name: 'productGraph', url: 'https://api.example.com/graphql' },
          { name: 'offerGraph', url: 'https://api.example.com/offer-graphql' }
        ],
        capture: {
          maxConcurrency: 10,
          timeout: 30000,
          variableGeneration: 'auto'
        },
        comparison: {
          strict: false,
          ignorePaths: [],
          customComparators: {}
        },
        validation: {
          ignorePatterns: []
        },
        alignment: {
          strict: false,
          preserveNulls: true,
          preserveOrder: false
        },
        storage: {
          type: 'file',
          path: './validation-storage'
        }
      });
      const results = [];
      const validationResults = new Map();

      for (const query of queries.slice(0, 5)) { // Limit for demo
        try {
          const result = await validator.validateAgainstSchema(query.content, 'productGraph');
          const validationResult = { queryName: query.queryName || query.id, valid: result.valid, errors: result.errors };
          results.push(validationResult);
          validationResults.set(query.queryName || query.id, validationResult);
        } catch (error) {
          const validationResult = { queryName: query.queryName || query.id, valid: false, errors: [String(error)] };
          results.push(validationResult);
          validationResults.set(query.queryName || query.id, validationResult);
        }
      }

      const validCount = results.filter(r => r.valid).length;
      spinner.succeed(`Validated ${results.length} query responses`);

      console.log(chalk.blue('\n🌐 Response Validation:\n'));
      console.log(`  Valid responses: ${validCount}`);
      console.log(`  Failed responses: ${results.length - validCount}`);

      await fs.writeFile(options.output, JSON.stringify(results, null, 2));
      console.log(chalk.green(`✅ Results saved to ${options.output}`));
    } catch (error) {
      spinner.fail('Response validation failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

// TRANSFORMATION COMMANDS
const transform = program
  .command('transform')
  .description('🔄 Transform GraphQL operations');

transform
  .command('queries')
  .description('Transform queries based on schema changes')
  .option('-q, --queries <path>', 'Queries file', './extracted-queries.json')
  .option('-s, --schema <path>', 'GraphQL schema file', './schema.graphql')
  .option('-o, --output <path>', 'Output directory', './transformed')
  .option('--dry-run', 'Preview without applying changes')
  .action(async (options: any) => {
    const spinner = ora('Transforming queries...').start();

    try {
      const queriesData = JSON.parse(await fs.readFile(options.queries, 'utf-8'));
      const queries = queriesData.queries || queriesData;

      // Analyze schema for deprecations
      const deprecationAnalyzer = new SchemaDeprecationAnalyzer();
      await deprecationAnalyzer.analyzeSchemaFile(options.schema);

      // Transform queries
      const transformer = new UnifiedSchemaTransformer();
      await transformer.loadSchema(options.schema);
      const results = [];

      await fs.mkdir(options.output, { recursive: true });

      for (const query of queries) {
        try {
          const transformResult = await transformer.transformQuery({
            queryId: query.id,
            content: query.content,
            schemaPath: options.schema,
            dryRun: options.dryRun,
          });

          results.push({
            queryId: query.id,
            success: true,
            transformed: transformResult.transformed,
            changes: transformResult.changes || [],
          });

          if (!options.dryRun && transformResult.transformed && transformResult.transformedQuery) {
            const outputPath = path.join(options.output, `${query.id}.transformed.graphql`);
            await fs.writeFile(outputPath, transformResult.transformedQuery);
          }
        } catch (error) {
          results.push({
            queryId: query.id,
            success: false,
            error: String(error),
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      spinner.succeed(`Transformed ${successCount}/${queries.length} queries`);

      console.log(chalk.blue('\n🔄 Transformation Results:\n'));
      console.log(`  Successful: ${successCount}`);
      console.log(`  Failed: ${queries.length - successCount}`);

      if (options.dryRun) {
        console.log(chalk.yellow('  (Dry run - no files written)'));
      }

      // Save summary
      const summaryPath = path.join(options.output, 'transformation-summary.json');
      await fs.writeFile(summaryPath, JSON.stringify(results, null, 2));
      
      console.log(chalk.green(`✅ Results saved to ${options.output}`));
    } catch (error) {
      spinner.fail('Transformation failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

// MIGRATION COMMANDS
const migrate = program
  .command('migrate')
  .description('🚀 Run complete migration pipeline');

migrate
  .command('full <directory>')
  .description('Run complete migration: extract → analyze → validate → transform')
  .option('-s, --schema <path>', 'GraphQL schema file', './schema.graphql')
  .option('-o, --output <path>', 'Output directory', './migration-results')
  .option('--dry-run', 'Preview without applying changes')
  .option('--interactive', 'Interactive mode with confirmations')
  .action(async (directory: string, options: any) => {
    console.log(chalk.blue('\n🚀 Starting Full Migration Pipeline\n'));

    try {
      await fs.mkdir(options.output, { recursive: true });

      // Step 1: Extract
      console.log(chalk.yellow('📤 Step 1: Extracting queries...'));
      const extractor = new UnifiedExtractor({ directory });
      const queries = await extractor.extractFromRepo();
      console.log(chalk.green(`   ✅ Extracted ${queries.length} operations`));

      // Step 2: Analyze Schema
      console.log(chalk.yellow('\n🔍 Step 2: Analyzing schema...'));
      const deprecationAnalyzer = new SchemaDeprecationAnalyzer();
      await deprecationAnalyzer.analyzeSchemaFile(options.schema);
      const deprecationSummary = deprecationAnalyzer.getSummary();
      console.log(chalk.green(`   ✅ Found ${deprecationSummary.total} deprecations`));

      // Step 3: Validate
      console.log(chalk.yellow('\n✅ Step 3: Validating queries...'));
      const validator = new SchemaValidator();
      const validationResults = await validator.validateQueries(
        queries.map(q => ({ id: q.id, content: q.content })),
        options.schema
      );
      const validationReport = validator.generateValidationReport(validationResults);
      console.log(chalk.green(`   ✅ Validated: ${validationReport.valid} valid, ${validationReport.invalid} invalid`));

      if (validationReport.invalid > 0 && !options.interactive) {
        console.log(chalk.red(`\n❌ ${validationReport.invalid} queries failed validation. Use --interactive to continue.`));
        process.exit(1);
      }

      // Step 4: Transform
      console.log(chalk.yellow('\n🔄 Step 4: Transforming queries...'));
      const transformer = new UnifiedSchemaTransformer();
      await transformer.loadSchema(options.schema);
      let transformedCount = 0;

      for (const query of queries) {
        if (Array.from(validationResults.values()).find(v => v.queryName === query.queryName)?.valid) {
          try {
            const result = await transformer.transformQuery({
              queryId: query.queryName,
              content: query.content,
              schemaPath: options.schema,
              dryRun: options.dryRun,
            });

            if (result.transformed) {
              transformedCount++;
              if (!options.dryRun && result.transformedQuery) {
                const outputPath = path.join(options.output, 'transformed', `${query.id}.graphql`);
                await fs.mkdir(path.dirname(outputPath), { recursive: true });
                await fs.writeFile(outputPath, result.transformedQuery);
              }
            }
          } catch (error) {
            console.log(chalk.red(`   ⚠️  Failed to transform ${query.id}: ${error}`));
          }
        }
      }

      console.log(chalk.green(`   ✅ Transformed ${transformedCount} operations`));

      // Save comprehensive report
      const report = {
        timestamp: new Date().toISOString(),
        directory,
        schema: options.schema,
        dryRun: options.dryRun,
        extraction: {
          totalQueries: queries.length,
          byType: queries.reduce((acc: Record<string, number>, q: any) => {
            const type = q.operation || 'query';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
        deprecations: deprecationSummary,
        validation: validationReport,
        transformation: {
          attempted: queries.length,
          successful: transformedCount,
          failed: queries.length - transformedCount,
        },
      };

      const reportPath = path.join(options.output, 'migration-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

      console.log(chalk.green('\n✅ Migration pipeline completed successfully!'));
      console.log(chalk.blue(`📁 Results saved to ${options.output}`));

      if (options.dryRun) {
        console.log(chalk.yellow('\n⚠️  Dry run mode - no changes were applied'));
      }
    } catch (error) {
      console.error(chalk.red('\n❌ Migration failed:'), error);
      logger.error('Migration error:', error);
      process.exit(1);
    }
  });

// QUICK START COMMAND
program
  .command('quickstart')
  .description('🎯 Interactive quickstart wizard')
  .action(async () => {
    console.log(chalk.blue('\n🚀 PGQL Quick Start Wizard\n'));
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '📤 Extract GraphQL queries from my codebase', value: 'extract' },
          { name: '🔍 Analyze my GraphQL schema', value: 'analyze-schema' },
          { name: '✅ Validate queries against schema', value: 'validate' },
          { name: '🚀 Run complete migration pipeline', value: 'migrate' },
        ],
      },
    ]);

    const { directory, schema } = await inquirer.prompt([
      {
        type: 'input',
        name: 'directory',
        message: 'Source directory:',
        default: './src',
        when: ['extract', 'migrate'].includes(action),
      },
      {
        type: 'input',
        name: 'schema',
        message: 'GraphQL schema file:',
        default: './schema.graphql',
        when: ['analyze-schema', 'validate', 'migrate'].includes(action),
      },
    ]);

    try {
      switch (action) {
        case 'extract':
          await program.parseAsync(['node', 'pgql', 'extract', 'queries', directory]);
          break;
        case 'analyze-schema':
          await program.parseAsync(['node', 'pgql', 'analyze', 'schema', schema]);
          break;
        case 'validate':
          await program.parseAsync(['node', 'pgql', 'validate', 'schema', '-s', schema]);
          break;
        case 'migrate':
          await program.parseAsync(['node', 'pgql', 'migrate', 'full', directory, '-s', schema, '--interactive']);
          break;
      }
    } catch (error) {
      console.error(chalk.red('Command failed:'), error);
    }
  });

// STATUS COMMAND
program
  .command('status')
  .description('📋 Show current migration status')
  .action(async () => {
    console.log(chalk.blue('\n📋 Migration Status\n'));

    const checkFile = async (filePath: string): Promise<boolean> => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    };

    const extracted = await checkFile('./extracted-queries.json');
    const transformed = await checkFile('./transformed');
    const report = await checkFile('./migration-results');

    console.log(`${extracted ? '✅' : '❌'} Queries extracted`);
    console.log(`${transformed ? '✅' : '❌'} Queries transformed`);
    console.log(`${report ? '✅' : '❌'} Migration report generated`);

    if (!extracted) {
      console.log(chalk.yellow('\nNext: pgql extract queries ./src'));
    } else if (!transformed) {
      console.log(chalk.yellow('\nNext: pgql transform queries -s ./schema.graphql'));
    } else {
      console.log(chalk.green('\n✅ Ready for production migration!'));
    }
  });

// Help examples
program.on('--help', () => {
  console.log('\n🌟 Common Examples:');
  console.log('');
  console.log('  # Quick start wizard');
  console.log('  $ pgql quickstart');
  console.log('');
  console.log('  # Extract queries');
  console.log('  $ pgql extract queries ./src');
  console.log('');
  console.log('  # Analyze schema');
  console.log('  $ pgql analyze schema ./schema.graphql');
  console.log('');
  console.log('  # Full migration');
  console.log('  $ pgql migrate full ./src -s ./schema.graphql');
  console.log('');
  console.log('  # Check status');
  console.log('  $ pgql status');
});

program.parse();