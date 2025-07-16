#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import path from 'node:path';
import { UnifiedVariantExtractor } from '../core/scanner/UnifiedVariantExtractor.js';
import { ExtractedQueryWithVariant } from '../core/extraction/types/variant-extractor.types.js';
import { logger } from '../utils/logger.js';

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
      const extractor = new UnifiedVariantExtractor({ enableIncrementalExtraction: true });
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
      const variantsByQuery = new Map<string, ExtractedQueryWithVariant[]>();
      for (const variant of result.variants) {
        const originalId = variant.variantMetadata?.originalQueryId;
        if (originalId) {
          if (!variantsByQuery.has(originalId)) {
            variantsByQuery.set(originalId, []);
          }
          variantsByQuery.get(originalId)!.push(variant);
        }
      }

      if (variantsByQuery.size > 0) {
        console.log(chalk.green('\n✨ Generated Variants:\n'));

        for (const [queryId, variants] of variantsByQuery) {
          console.log(`  ${chalk.bold(queryId)}`);

          for (const variant of variants) {
            const conditionStr = Object.entries(variant.variantMetadata?.conditions || {})
              .map(([k, v]) => `${k}=${v}`)
              .join(', ');
            console.log(`    • ${conditionStr}`);
            if (variant.fragments?.length) {
              console.log(`      Fragments: ${variant.fragments.join(', ')}`);
            }
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
          ...config,
        })),
        variants: result.variants.map((v) => ({
          id: v.id,
          originalQueryId: v.variantMetadata?.originalQueryId,
          queryName: v.name,
          conditions: v.variantMetadata?.conditions,
          filePath: v.filePath,
        })),
      };

      const reportPath = path.join(options.output, 'advanced-variant-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

      // Save all variants with full content
      const variantsPath = path.join(options.output, 'all-variants.json');
      await fs.writeFile(
        variantsPath,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            totalVariants: result.variants.length,
            variants: result.variants.map((v) => ({
              id: v.id,
              queryName: v.name,
              conditions: v.variantMetadata?.conditions,
              content: v.content,
            })),
          },
          null,
          2,
        ),
      );

      // Optionally save individual query files
      if (options.saveQueries) {
        const queriesDir = path.join(options.output, 'queries');
        await extractor.saveVariants(queriesDir, result.variants);
        console.log(chalk.dim(`\n📁 Individual query files saved to ${queriesDir}`));
      }

      console.log(chalk.green(`\n✅ Extraction complete!`));
      console.log(chalk.dim(`📁 Reports saved to ${options.output}`));
    } catch (error) {
      spinner.fail('Extraction failed');
      logger.error('Extraction error:', error);
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    }
  });

program.parse();
