#!/usr/bin/env node
// @ts-nocheck

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { UnifiedExtractor, ExtractionOptions } from '../core/extraction/index.js';
import { QueryTransformer, loadTransformationRules } from '../core/transformer/QueryTransformer.js';
import { SchemaDeprecationAnalyzer } from '../core/analyzer/SchemaDeprecationAnalyzer.js';
import { SchemaAwareTransformer } from '../core/transformer/SchemaAwareTransformer.js';
import { OptimizedSchemaTransformer } from '../core/transformer/OptimizedSchemaTransformer.js';
import { SchemaValidator } from '../core/validator/SchemaValidator.js';
import {
  ASTCodeApplicator,
  TransformationMapping,
  SourceMapping,
} from '../core/applicator/index.js';
import { createTwoFilesPatch } from 'diff';
import { logger } from '../utils/logger.js';
import { formatGraphQL } from '../utils/formatter.js';

const program = new Command();

program
  .name('pg-extract-transform')
  .description('Extract and transform GraphQL queries')
  .version('0.1.0');

// Extract command
program
  .command('extract')
  .description('Extract GraphQL queries from source files')
  .argument('<directory>', 'Directory to scan')
  .option('-o, --output <file>', 'Output file for extracted queries', './extracted-queries.json')
  .option('-p, --pattern <patterns...>', 'File patterns to scan', ['**/*.{js,jsx,ts,tsx}'])
  .option('--no-fragments', 'Skip fragment resolution')
  .option('--fragment-dir <dir>', 'Additional directory to search for fragments')
  .option('--dynamic', 'Extract all variants for dynamic fragment spreads')
  .action(async (directory: string, options: any) => {
    // Security validation first
    if (directory.includes('..') || directory.includes('%2e%2e') || /[;&|`$(){}\[\]<>]/.test(directory)) {
      console.error(`Error: invalid path - security violation detected`);
      process.exit(1);
    }
    
    // Check if directory exists
    try {
      await fs.access(directory);
    } catch (error) {
      console.error(`Error: directory '${directory}' not found`);
      process.exit(1);
    }
    
    const spinner = process.env.PG_CLI_NO_PROGRESS === '1' 
      ? { start: () => null, succeed: () => null, fail: () => null, set text(value) {}, get text() { return ''; } } 
      : ora('Extracting GraphQL queries...').start();

    try {
      // Configure extraction options
      logger.debug('CLI options:', options);
      logger.debug('options.pattern:', options.pattern);

      const extractionOptions: ExtractionOptions = {
        directory,
        patterns: options.pattern || ['**/*.{js,jsx,ts,tsx}'],
        detectVariants: options.dynamic,
        generateVariants: options.dynamic,
        resolveFragments: options.fragments !== false,
        normalizeNames: true,
        preserveSourceAST: true, // Enable AST preservation for minimal changes
        reporters: [], // We'll handle output in the CLI
      };

      logger.debug('Final extractionOptions:', extractionOptions);

      // Use unified extractor
      const extractor = new UnifiedExtractor(extractionOptions);
      const result = await extractor.extract();

      spinner.succeed(`Found ${result.queries.length} GraphQL operations`);

      // Format queries with prettier
      if (process.env.PG_CLI_NO_PROGRESS !== '1') {
        spinner.start('Formatting queries...');
      }

      const formattedQueries = await Promise.all(
        result.queries.map(async (q) => {
          const formattedContent = await formatGraphQL(q.resolvedContent);
          return {
            id: q.id,
            file: q.filePath,
            name: q.name,
            type: q.type,
            location: q.location,
            content: formattedContent,
            originalName: q.originalName || undefined,
            sourceAST: q.sourceAST || undefined, // Preserve source AST for apply command
          };
        }),
      );
      
      if (process.env.PG_CLI_NO_PROGRESS !== '1') {
        spinner.succeed('Formatting complete');
      }

      // Save to file
      const output = {
        timestamp: new Date().toISOString(),
        directory,
        totalQueries: formattedQueries.length,
        queries: formattedQueries,
      };

      await fs.writeFile(options.output, JSON.stringify(output, null, 2));
      console.log(chalk.green(`✓ Saved to ${options.output}`));

      // Summary
      const byType = result.queries.reduce(
        (acc: Record<string, number>, q) => {
          acc[q.type] = (acc[q.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      console.log('\nSummary:');
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });

      if (options.dynamic && result.variants.length > 0) {
        const variants = result.variants;
        if (variants.length > 0) {
          console.log(chalk.yellow(`\n  Dynamic variants: ${variants.length}`));
        }
      }
    } catch (error) {
      spinner.fail('Extraction failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

// Transform command
program
  .command('transform')
  .description('Transform extracted queries based on deprecation rules')
  .option('-i, --input <file>', 'Input file with extracted queries', './extracted-queries.json')
  .option('-r, --rules <file>', 'Deprecation rules file', './deprecations.json')
  .option('-s, --schema <file>', 'GraphQL schema file (uses schema deprecations if provided)')
  .option('-o, --output <dir>', 'Output directory for transformed queries', './transformed')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--comment-vague', 'Comment out fields with vague deprecations', true)
  .option('--validate', 'Validate queries against schema', true)
  .option('--skip-invalid', 'Skip invalid queries instead of failing', false)
  .action(async (options: any) => {
    const spinner = ora('Loading queries and rules...').start();

    try {
      // Load queries
      const inputData = JSON.parse(await fs.readFile(options.input, 'utf-8'));
      let queries = inputData.queries;

      let transformer: QueryTransformer | OptimizedSchemaTransformer;

      if (options.schema) {
        // Use schema-based deprecations
        spinner.text = 'Analyzing schema deprecations...';
        const analyzer = new SchemaDeprecationAnalyzer();
        const deprecationRules = await analyzer.analyzeSchemaFile(options.schema);

        const summary = analyzer.getSummary();
        console.log(chalk.cyan(`\nFound ${summary.total} deprecations:`));
        console.log(`  - ${summary.replaceable} with clear replacements`);
        console.log(`  - ${summary.vague} with vague reasons\n`);

        transformer = new OptimizedSchemaTransformer(deprecationRules, {
          commentOutVague: options.commentVague,
          addDeprecationComments: true,
          preserveOriginalAsComment: false,
        });
      } else {
        // Use manual rules
        const rules = await loadTransformationRules(options.rules);

        // Add common rules
        rules.push(
          QueryTransformer.commonRules.allVenturesToVentures,
          QueryTransformer.commonRules.edgesToNodes,
        );

        transformer = new QueryTransformer(rules);
      }

      // Validate queries if requested
      if (options.validate && options.schema) {
        spinner.text = 'Validating queries against schema...';

        const validator = new SchemaValidator();
        const validationResults = await validator.validateQueries(queries, options.schema);
        const report = validator.generateValidationReport(validationResults);

        console.log(chalk.cyan(`\nValidation Results:`));
        console.log(`  - Valid: ${report.valid}`);
        console.log(`  - Invalid: ${report.invalid}`);
        console.log(`  - Warnings: ${report.warnings}\n`);

        if (report.invalid > 0) {
          console.log(chalk.red('Invalid queries found:'));
          for (const item of report.summary) {
            if (!item.valid) {
              console.log(`  - ${item.id}: ${item.errorCount} errors`);
              item.errors?.forEach((err) => {
                console.log(`    ${chalk.red('✗')} ${err.message}`);
              });
            }
          }

          if (!options.skipInvalid) {
            spinner.fail('Validation failed. Use --skip-invalid to continue anyway.');
            process.exit(1);
          }

          console.log(chalk.yellow('\nSkipping invalid queries...'));
          // Filter out invalid queries
          const validQueries = queries.filter((q: any) => {
            const result = validationResults.get(q.id);
            return result?.valid ?? true;
          });
          queries = validQueries;
        }
      }

      spinner.text = 'Transforming queries...';
      const results = [];

      for (const query of queries) {
        try {
          if (transformer instanceof OptimizedSchemaTransformer) {
            const result = await transformer.transform(query.content);

            if (result.warnings.length > 0) {
              logger.warn(`Warnings transforming ${query.id}:`, result.warnings);
            }

            if (result.original !== result.transformed || result.changes.length > 0) {
              results.push({
                ...query,
                transformed: result.transformed,
                changes: result.changes,
                diff: createTwoFilesPatch(
                  query.file,
                  query.file + '.transformed',
                  result.original,
                  result.transformed,
                  'Original',
                  'Transformed',
                ),
              });
            }
          } else {
            const result = transformer.transform(query.content);

            if (result.original !== result.transformed) {
              results.push({
                ...query,
                transformed: result.transformed,
                diff: createTwoFilesPatch(
                  query.file,
                  query.file + '.transformed',
                  result.original,
                  result.transformed,
                  'Original',
                  'Transformed',
                ),
              });
            }
          }
        } catch (error) {
          logger.warn(`Failed to transform ${query.id}:`, error);
        }
      }

      spinner.succeed(`Transformed ${results.length} queries`);

      if (options.dryRun) {
        console.log(chalk.yellow('\nDry run mode - showing changes:\n'));

        results.forEach((r) => {
          console.log(chalk.blue(`\n${r.file} - ${r.name || 'unnamed'}`));
          console.log(r.diff);
        });
      } else {
        // Create output directory
        await fs.mkdir(options.output, { recursive: true });

        // Save transformed queries
        const outputFile = path.join(options.output, 'transformed-queries.json');
        await fs.writeFile(outputFile, JSON.stringify(results, null, 2));

        // Save individual diffs
        const diffsDir = path.join(options.output, 'diffs');
        await fs.mkdir(diffsDir, { recursive: true });

        for (const result of results) {
          const diffFile = path.join(diffsDir, `${result.id}.diff`);
          await fs.writeFile(diffFile, result.diff);
        }

        console.log(
          chalk.green(`\n✓ Saved ${results.length} transformations to ${options.output}`),
        );
      }
    } catch (error) {
      spinner.fail('Transformation failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

// Apply command
program
  .command('apply')
  .description('Apply transformations to source files')
  .option(
    '-i, --input <file>',
    'Transformed queries file',
    './transformed/transformed-queries.json',
  )
  .option('--backup', 'Create backups of modified files')
  .option('--dry-run', 'Preview changes without writing files')
  .action(async (options: any) => {
    const spinner = ora('Applying transformations...').start();

    try {
      const results = JSON.parse(await fs.readFile(options.input, 'utf-8'));
      const fileChanges = new Map<string, TransformationMapping[]>();

      // Create AST applicator
      const applicator = new ASTCodeApplicator({
        preserveFormatting: true,
        preserveComments: true,
        validateChanges: true,
        dryRun: options.dryRun,
      });

      // Group transformations by file
      for (const result of results) {
        if (!result.sourceAST) {
          logger.error(
            `Query ${result.id} missing source AST. Re-extracting with source preservation enabled.`,
          );

          // Re-extract this specific file with source AST preservation using UnifiedExtractor
          try {
            // Use the already imported UnifiedExtractor
            const reExtractor = new UnifiedExtractor({
              directory: path.dirname(result.file),
              patterns: [path.basename(result.file)],
              preserveSourceAST: true,
              resolveFragments: true,
            });

            const reExtractionResult = await reExtractor.extract();
            const reExtractedQuery = reExtractionResult.queries.find(
              (q) => q.content === result.content,
            );

            if (reExtractedQuery?.sourceAST) {
              result.sourceAST = reExtractedQuery.sourceAST;
              logger.info(`Successfully re-extracted source AST for query ${result.id}`);
            } else {
              logger.error(
                `Failed to re-extract source AST for query ${result.id} in ${result.file}. Skipping unsafe transformation.`,
              );
              continue;
            }
          } catch (error) {
            logger.error(
              `Error re-extracting query ${result.id}: ${error}. Skipping transformation.`,
            );
            continue;
          }
        }

        const sourceMapping: SourceMapping = {
          astNode: result.sourceAST,
          filePath: result.file,
          originalContent: result.content,
          templateLiteralInfo: undefined, // Will be populated if needed
        };

        const transformationMapping: TransformationMapping = {
          queryId: result.id,
          sourceMapping,
          transformation: {
            original: result.content,
            transformed: result.transformed,
            ast: null as any, // AST will be parsed if needed
            changes: result.changes || [],
            rules: [],
          },
          preserveInterpolations: true,
        };

        if (!fileChanges.has(result.file)) {
          fileChanges.set(result.file, []);
        }
        fileChanges.get(result.file)!.push(transformationMapping);
      }

      spinner.text = `Updating ${fileChanges.size} files...`;

      let successCount = 0;
      let errorCount = 0;

      for (const [filePath, transformations] of fileChanges) {
        if (options.backup && !options.dryRun) {
          const content = await fs.readFile(filePath, 'utf-8');
          await fs.writeFile(filePath + '.backup', content);
        }

        // Apply AST-based transformations
        const result = await applicator.applyTransformations(filePath, transformations);

        if (result.success) {
          if (!options.dryRun) {
            await fs.writeFile(filePath, result.newContent);
          }
          successCount++;

          if (options.dryRun) {
            console.log(chalk.blue(`\nChanges for ${filePath}:`));
            result.changes.forEach((change) => {
              console.log(`  ${change.reason}`);
              console.log(chalk.red(`-   ${change.originalText}`));
              console.log(chalk.green(`+   ${change.newText}`));
            });
          }
        } else {
          errorCount++;
          logger.error(`Failed to apply transformations to ${filePath}: ${result.error}`);
        }
      }

      spinner.succeed(
        `Updated ${successCount} files${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      );

      if (options.backup && !options.dryRun) {
        console.log(chalk.yellow('✓ Backups created with .backup extension'));
      }

      if (options.dryRun) {
        console.log(chalk.yellow('\nDry run completed - no files were modified'));
      }

      if (errorCount > 0) {
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Failed to apply transformations');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate GraphQL queries against schema')
  .argument('<schema>', 'GraphQL schema file')
  .option('-i, --input <file>', 'Input queries file', './extracted-queries.json')
  .option('--transformed', 'Validate transformed queries', false)
  .option('--strict', 'Fail on warnings', false)
  .action(async (schemaPath: string, options: any) => {
    const spinner = ora('Loading queries...').start();

    try {
      const inputData = JSON.parse(await fs.readFile(options.input, 'utf-8'));
      const queries = options.transformed
        ? inputData.map((item: any) => ({
            id: item.id,
            content: item.transformed || item.content,
          }))
        : inputData.queries || inputData;

      spinner.text = 'Validating queries against schema...';

      const validator = new SchemaValidator();
      const results = await validator.validateQueries(queries, schemaPath);
      const report = validator.generateValidationReport(results);

      spinner.succeed(`Validated ${report.total} queries`);

      console.log('\nValidation Summary:');
      console.log(`  ${chalk.green('✓')} Valid: ${report.valid}`);
      console.log(`  ${chalk.red('✗')} Invalid: ${report.invalid}`);
      console.log(`  ${chalk.yellow('⚠')} Warnings: ${report.warnings}`);

      // Show details for invalid queries
      if (report.invalid > 0) {
        console.log(chalk.red('\nInvalid Queries:'));
        for (const item of report.summary) {
          if (!item.valid) {
            console.log(`\n  ${chalk.bold(item.id)}:`);
            item.errors?.forEach((err) => {
              console.log(`    ${chalk.red('✗')} ${err.message}`);

              // Show suggestion if available
              if (err.suggestion) {
                console.log(`      ${chalk.yellow('💡')} ${err.suggestion}`);
              }

              // Show diff if available
              if (err.diff) {
                console.log(chalk.dim('\n      Suggested fix:'));
                console.log(
                  err.diff
                    .split('\n')
                    .map((line) => '      ' + line)
                    .join('\n'),
                );
              }

              // Show location if available
              if (err.locations) {
                err.locations.forEach((loc) => {
                  console.log(`      ${chalk.dim('at')} line ${loc.line}, column ${loc.column}`);
                });
              }
            });
          }
        }
      }

      // Show warnings if any
      if (report.warnings > 0) {
        console.log(chalk.yellow('\nWarnings:'));
        for (const [id, result] of results) {
          if (result.warnings.length > 0) {
            console.log(`\n  ${id}:`);
            result.warnings.forEach((warn) => {
              console.log(`    ${chalk.yellow('⚠')} ${warn.message}`);
              if (warn.suggestion) {
                console.log(`      ${chalk.dim('Suggestion:')} ${warn.suggestion}`);
              }
            });
          }
        }
      }

      // Save validation report
      const reportFile = options.input.replace('.json', '-validation.json');
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      console.log(chalk.green(`\n✓ Validation report saved to ${reportFile}`));

      // Exit with error if validation failed
      if (report.invalid > 0 || (options.strict && report.warnings > 0)) {
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Validation failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

program.parse();
