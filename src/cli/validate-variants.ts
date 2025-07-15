#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import path from 'node:path';
import { parse, validate, buildSchema, GraphQLError } from 'graphql';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('pg-validate-variants')
  .description('Validate generated GraphQL variants against a schema')
  .version('0.1.0')
  .argument('<variants-dir>', 'Directory containing variant files')
  .argument('<schema-file>', 'GraphQL schema file')
  .option('-v, --verbose', 'Show detailed validation errors', false)
  .action(async (variantsDir: string, schemaFile: string, options: any) => {
    const spinner = ora('Validating GraphQL variants...').start();
    
    try {
      // Load schema
      const schemaContent = await fs.readFile(schemaFile, 'utf-8');
      const schema = buildSchema(schemaContent);
      
      // Find all GraphQL files
      const files = await fs.readdir(variantsDir);
      const graphqlFiles = files.filter(f => f.endsWith('.graphql'));
      
      spinner.text = `Validating ${graphqlFiles.length} variants...`;
      
      const results: Array<{
        file: string;
        valid: boolean;
        errors?: readonly GraphQLError[];
      }> = [];
      
      for (const file of graphqlFiles) {
        const filePath = path.join(variantsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        
        try {
          const ast = parse(content);
          const errors = validate(schema, ast);
          
          results.push({
            file,
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
          });
        } catch (parseError: any) {
          results.push({
            file,
            valid: false,
            errors: [new GraphQLError(`Parse error: ${parseError.message}`)]
          });
        }
      }
      
      spinner.succeed('Validation complete');
      
      // Display results
      const validCount = results.filter(r => r.valid).length;
      const invalidCount = results.filter(r => !r.valid).length;
      
      console.log(chalk.blue('\n📊 Validation Summary:\n'));
      console.log(`  Total variants: ${results.length}`);
      console.log(`  ${chalk.green('✓')} Valid: ${validCount}`);
      console.log(`  ${chalk.red('✗')} Invalid: ${invalidCount}`);
      
      // Show invalid variants
      if (invalidCount > 0) {
        console.log(chalk.red('\n❌ Invalid Variants:\n'));
        
        for (const result of results.filter(r => !r.valid)) {
          console.log(`  ${chalk.bold(result.file)}`);
          
          if (options.verbose && result.errors) {
            for (const error of result.errors) {
              console.log(`    ${chalk.dim('•')} ${error.message}`);
              if (error.locations) {
                for (const loc of error.locations) {
                  console.log(`      at line ${loc.line}, column ${loc.column}`);
                }
              }
            }
          }
        }
      }
      
      // Show valid variants
      if (validCount > 0 && options.verbose) {
        console.log(chalk.green('\n✅ Valid Variants:\n'));
        
        for (const result of results.filter(r => r.valid)) {
          console.log(`  ${chalk.bold(result.file)}`);
        }
      }
      
      // Save validation report
      const report = {
        timestamp: new Date().toISOString(),
        schemaFile,
        variantsDir,
        summary: {
          total: results.length,
          valid: validCount,
          invalid: invalidCount
        },
        results: results.map(r => ({
          file: r.file,
          valid: r.valid,
          errors: r.errors?.map(e => ({
            message: e.message,
            locations: e.locations
          }))
        }))
      };
      
      const reportPath = path.join(variantsDir, 'validation-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      console.log(chalk.dim(`\n📄 Validation report saved to ${reportPath}`));
      
      // Exit with error code if any variants are invalid
      if (invalidCount > 0) {
        process.exit(1);
      }
      
    } catch (error) {
      spinner.fail('Validation failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

program.parse();