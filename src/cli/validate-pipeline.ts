#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SchemaValidator } from '../core/validator/SchemaValidator';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('pg-validate-pipeline')
  .description('Validate entire GraphQL migration pipeline')
  .version('0.1.0');

program
  .command('pipeline')
  .description('Run full validation pipeline on extracted and transformed queries')
  .argument('<schema>', 'GraphQL schema file path')
  .option('-e, --extracted <file>', 'Extracted queries file', './extracted-queries.json')
  .option('-t, --transformed <file>', 'Transformed queries file', './transformed/transformed-queries.json')
  .option('--fail-fast', 'Stop on first validation error', false)
  .option('--report <file>', 'Output validation report', './validation-report.json')
  .action(async (schemaPath: string, options: any) => {
    const spinner = ora('Starting validation pipeline...').start();
    
    try {
      const validator = new SchemaValidator();
      await validator.loadSchemaFromFile(schemaPath);
      
      const report: any = {
        timestamp: new Date().toISOString(),
        schema: schemaPath,
        stages: {}
      };
      
      // Stage 1: Validate extracted queries
      spinner.text = 'Validating extracted queries...';
      const extractedData = JSON.parse(await fs.readFile(options.extracted, 'utf-8'));
      const extractedQueries = extractedData.queries || extractedData;
      
      const extractedResults = await validator.validateQueries(extractedQueries, schemaPath);
      const extractedReport = validator.generateValidationReport(extractedResults);
      
      report.stages.extracted = {
        total: extractedReport.total,
        valid: extractedReport.valid,
        invalid: extractedReport.invalid,
        warnings: extractedReport.warnings
      };
      
      console.log(chalk.cyan('\n📋 Extracted Queries:'));
      console.log(`  Total: ${extractedReport.total}`);
      console.log(`  ${chalk.green('✓')} Valid: ${extractedReport.valid}`);
      console.log(`  ${chalk.red('✗')} Invalid: ${extractedReport.invalid}`);
      console.log(`  ${chalk.yellow('⚠')} Warnings: ${extractedReport.warnings}`);
      
      if (extractedReport.invalid > 0 && options.failFast) {
        spinner.fail('Extracted queries validation failed');
        process.exit(1);
      }
      
      // Stage 2: Validate transformed queries
      spinner.text = 'Validating transformed queries...';
      let transformedReport;
      let transformedResults: Map<string, any> = new Map();
      
      try {
        const transformedData = JSON.parse(await fs.readFile(options.transformed, 'utf-8'));
        const transformedQueries = transformedData.map((item: any) => ({
          id: item.id,
          content: item.transformed
        }));
        
        transformedResults = await validator.validateQueries(transformedQueries, schemaPath);
        transformedReport = validator.generateValidationReport(transformedResults);
        
        report.stages.transformed = {
          total: transformedReport.total,
          valid: transformedReport.valid,
          invalid: transformedReport.invalid,
          warnings: transformedReport.warnings
        };
        
        console.log(chalk.cyan('\n🔄 Transformed Queries:'));
        console.log(`  Total: ${transformedReport.total}`);
        console.log(`  ${chalk.green('✓')} Valid: ${transformedReport.valid}`);
        console.log(`  ${chalk.red('✗')} Invalid: ${transformedReport.invalid}`);
        console.log(`  ${chalk.yellow('⚠')} Warnings: ${transformedReport.warnings}`);
      } catch (error) {
        console.log(chalk.yellow('\n⚠️  No transformed queries found'));
        report.stages.transformed = { error: 'No transformed queries file' };
      }
      
      // Stage 3: Compare before/after
      if (transformedReport) {
        spinner.text = 'Comparing validation results...';
        
        const comparison: {
          improved: number;
          degraded: number;
          unchanged: number;
          newErrors: Array<{
            id: string;
            before: number;
            after: number;
            errors: any[];
          }>;
        } = {
          improved: 0,
          degraded: 0,
          unchanged: 0,
          newErrors: []
        };
        
        for (const [id, extractedResult] of extractedResults) {
          const transformedResult = transformedResults.get(id);
          
          if (!transformedResult) continue;
          
          const extractedErrors = extractedResult.errors.length;
          const transformedErrors = transformedResult.errors.length;
          
          if (transformedErrors < extractedErrors) {
            comparison.improved++;
          } else if (transformedErrors > extractedErrors) {
            comparison.degraded++;
            comparison.newErrors.push({
              id,
              before: extractedErrors,
              after: transformedErrors,
              errors: transformedResult.errors
            });
          } else {
            comparison.unchanged++;
          }
        }
        
        report.comparison = comparison;
        
        console.log(chalk.cyan('\n📊 Comparison:'));
        console.log(`  ${chalk.green('↑')} Improved: ${comparison.improved}`);
        console.log(`  ${chalk.red('↓')} Degraded: ${comparison.degraded}`);
        console.log(`  ${chalk.gray('=')} Unchanged: ${comparison.unchanged}`);
        
        if (comparison.degraded > 0) {
          console.log(chalk.red('\n⚠️  New errors introduced by transformation:'));
          for (const item of comparison.newErrors.slice(0, 5)) {
            console.log(`\n  ${item.id}:`);
            item.errors.forEach((err: any) => {
              console.log(`    ${chalk.red('✗')} ${err.message}`);
            });
          }
          
          if (comparison.newErrors.length > 5) {
            console.log(chalk.dim(`\n  ... and ${comparison.newErrors.length - 5} more`));
          }
        }
      }
      
      // Stage 4: Production readiness check
      spinner.text = 'Checking production readiness...';
      
      const readiness: {
        ready: boolean;
        issues: string[];
      } = {
        ready: true,
        issues: []
      };
      
      // Check for critical issues
      if (extractedReport.invalid > 0) {
        readiness.ready = false;
        readiness.issues.push(`${extractedReport.invalid} invalid extracted queries`);
      }
      
      if (transformedReport && transformedReport.invalid > 0) {
        readiness.ready = false;
        readiness.issues.push(`${transformedReport.invalid} invalid transformed queries`);
      }
      
      if (report.comparison && report.comparison.degraded > 0) {
        readiness.ready = false;
        readiness.issues.push(`Transformation introduced ${report.comparison.degraded} new errors`);
      }
      
      report.productionReadiness = readiness;
      
      console.log(chalk.cyan('\n🚀 Production Readiness:'));
      if (readiness.ready) {
        console.log(chalk.green('  ✓ All queries are valid and production-ready!'));
      } else {
        console.log(chalk.red('  ✗ Not ready for production:'));
        readiness.issues.forEach(issue => {
          console.log(`    - ${issue}`);
        });
      }
      
      // Save report
      await fs.writeFile(options.report, JSON.stringify(report, null, 2));
      spinner.succeed(`Validation complete. Report saved to ${options.report}`);
      
      // Exit with error if not production ready
      if (!readiness.ready) {
        process.exit(1);
      }
      
    } catch (error) {
      spinner.fail('Validation pipeline failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

program.parse();