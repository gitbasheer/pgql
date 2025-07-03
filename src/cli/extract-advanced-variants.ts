#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import path from 'node:path';
import { AdvancedVariantExtractor } from '../core/scanner/AdvancedVariantExtractor';
import { logger } from '../utils/logger';

const program = new Command();

program
  .name('pg-extract-advanced-variants')
  .description('Extract GraphQL queries with advanced variant detection')
  .version('0.1.0')
  .argument('<directory>', 'Directory to scan')
  .option('-o, --output <dir>', 'Output directory', './extracted-advanced-variants')
  .option('-p, --pattern <patterns...>', 'File patterns to scan', ['**/*.{js,jsx,ts,tsx}'])
  .option('--save-queries', 'Save individual query files', false)
  .action(async (directory: string, options: any) => {
    const spinner = ora('Extracting GraphQL query variants...').start();
    
    try {
      const extractor = new AdvancedVariantExtractor();
      const result = await extractor.extractWithVariants(directory, options.pattern);
      
      spinner.succeed(`Extraction complete`);
      
      // Display summary
      console.log(chalk.blue('\n📊 Extraction Summary:\n'));
      console.log(`  Original queries: ${result.summary.totalOriginalQueries}`);
      console.log(`  Generated variants: ${result.summary.totalVariants}`);
      console.log(`  Condition switches: ${result.summary.totalSwitches}`);
      console.log(`  Queries with variants: ${result.summary.queriesWithVariants.length}`);
      
      // Display switches
      if (result.switches.size > 0) {
        console.log(chalk.yellow('\n🔀 Detected Switches:\n'));
        
        for (const [name, switchConfig] of result.switches) {
          console.log(`  ${chalk.bold(name)}`);
          console.log(`    Type: ${switchConfig.type}`);
          console.log(`    Values: ${switchConfig.possibleValues.join(', ')}`);
          console.log(`    Location: ${switchConfig.location}`);
        }
      }
      
      // Display variants by query
      const variantsByQuery = new Map<string, typeof result.variants>();
      for (const variant of result.variants) {
        if (!variantsByQuery.has(variant.originalQueryId)) {
          variantsByQuery.set(variant.originalQueryId, []);
        }
        variantsByQuery.get(variant.originalQueryId)!.push(variant);
      }
      
      if (variantsByQuery.size > 0) {
        console.log(chalk.green('\n✨ Generated Variants:\n'));
        
        for (const [queryId, variants] of variantsByQuery) {
          console.log(`  ${chalk.bold(queryId)}`);
          
          for (const variant of variants) {
            const conditionStr = Object.entries(variant.conditions)
              .map(([k, v]) => `${k}=${v}`)
              .join(', ');
            console.log(`    • ${conditionStr}`);
            console.log(`      Fragments: ${variant.usedFragments.join(', ')}`);
          }
        }
      }
      
      // Create output directory
      await fs.mkdir(options.output, { recursive: true });
      
      // Save detailed report
      const report = {
        timestamp: new Date().toISOString(),
        directory,
        summary: result.summary,
        switches: Array.from(result.switches.entries()).map(([name, config]) => ({
          name,
          ...config
        })),
        variants: result.variants.map(v => ({
          id: v.id,
          originalQueryId: v.originalQueryId,
          queryName: v.queryName,
          conditions: v.conditions,
          usedFragments: v.usedFragments,
          filePath: v.filePath
        }))
      };
      
      const reportPath = path.join(options.output, 'advanced-variant-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      // Save all variants with full content
      const variantsPath = path.join(options.output, 'all-variants.json');
      await fs.writeFile(variantsPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalVariants: result.variants.length,
        variants: result.variants.map(v => ({
          id: v.id,
          queryName: v.queryName,
          conditions: v.conditions,
          usedFragments: v.usedFragments,
          content: v.content
        }))
      }, null, 2));
      
      // Optionally save individual query files
      if (options.saveQueries) {
        const queriesDir = path.join(options.output, 'queries');
        await extractor.saveVariants(result.variants, queriesDir);
        console.log(chalk.dim(`\n📁 Individual query files saved to ${queriesDir}`));
      }
      
      console.log(chalk.green(`\n✅ Extraction complete!`));
      console.log(chalk.dim(`Reports saved to ${options.output}`));
      
      // Show example of how variants differ
      if (result.variants.length >= 2) {
        const example = variantsByQuery.values().next().value;
        if (example && example.length >= 2) {
          console.log(chalk.cyan('\n📝 Example Variant Difference:\n'));
          console.log(chalk.bold('Variant 1:'), Object.entries(example[0].conditions).map(([k,v]) => `${k}=${v}`).join(', '));
          console.log('Uses fragments:', example[0].usedFragments.join(', '));
          console.log(chalk.bold('\nVariant 2:'), Object.entries(example[1].conditions).map(([k,v]) => `${k}=${v}`).join(', '));
          console.log('Uses fragments:', example[1].usedFragments.join(', '));
        }
      }
      
    } catch (error) {
      spinner.fail('Extraction failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

program.parse();