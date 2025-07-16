#!/usr/bin/env node
// @ts-nocheck

import { Command } from 'commander';
import * as path from 'path';
import { UnifiedExtractor, ExtractionOptions } from '../core/extraction/index.js';
import { logger } from '../utils/logger.js';

const program = new Command();

program.name('pg-extract').description('Unified GraphQL extraction tool').version('2.0.0');

program
  .command('extract')
  .description('Extract GraphQL operations from a directory')
  .option('-d, --directory <path>', 'Directory to extract from', process.cwd())
  .option('-p, --patterns <patterns...>', 'File patterns to match', ['**/*.{js,jsx,ts,tsx}'])
  .option('-i, --ignore <patterns...>', 'Patterns to ignore')
  .option('-o, --output <path>', 'Output directory', '.')

  // Strategy options
  .option('--strategy <type>', 'Extraction strategy: pluck, ast, or hybrid', 'hybrid')

  // Analysis options
  .option('--no-variants', 'Disable variant detection')
  .option('--no-context', 'Disable context analysis')
  .option('--no-resolve-names', 'Disable name resolution')

  // Resolution options
  .option('--no-fragments', 'Disable fragment resolution')
  .option('--fragments-dir <path>', 'Directory to search for fragments')
  .option('--inline-fragments', 'Inline fragments in the output')

  // Transformation options
  .option(
    '--naming <convention>',
    'Naming convention: pascalCase, camelCase, or preserve',
    'pascalCase',
  )
  .option('--no-normalize-names', 'Disable name normalization')

  // Output options
  .option('--reporters <types...>', 'Output reporters: json, html, files', ['json'])

  // Performance options
  .option('--no-cache', 'Disable caching')
  .option('--no-parallel', 'Disable parallel processing')
  .option('--concurrency <number>', 'Max concurrent file processing', '4')

  .action(async (options) => {
    try {
      const extractionOptions: ExtractionOptions = {
        directory: path.resolve(options.directory),
        patterns: options.patterns,
        ignore: options.ignore,
        strategies: options.strategy === 'hybrid' ? ['hybrid'] : [options.strategy],
        detectVariants: options.variants,
        analyzeContext: options.context,
        resolveNames: options.resolveNames,
        resolveFragments: options.fragments,
        fragmentsDirectory: options.fragmentsDir,
        normalizeNames: options.normalizeNames,
        generateVariants: options.variants,
        inlineFragments: options.inlineFragments,
        namingConvention: options.naming,
        reporters: options.reporters,
        outputDir: options.output,
        cache: options.cache,
        parallel: options.parallel,
        maxConcurrency: parseInt(options.concurrency),
      };

      logger.info('Starting unified extraction with options:', extractionOptions);

      const extractor = new UnifiedExtractor(extractionOptions);
      const result = await extractor.extract();

      logger.info('Extraction completed successfully!');
      logger.info(
        `Extracted ${result.queries.length} queries with ${result.variants.length} variants`,
      );

      if (result.errors.length > 0) {
        logger.warn(`Completed with ${result.errors.length} errors`);
      }

      process.exit(0);
    } catch (error) {
      logger.error('Extraction failed:', error);
      process.exit(1);
    }
  });

// Additional commands for specific use cases
program
  .command('variants')
  .description('Extract with focus on variant detection')
  .option('-d, --directory <path>', 'Directory to extract from', process.cwd())
  .option('-o, --output <path>', 'Output directory', '.')
  .action(async (options) => {
    const extractionOptions: ExtractionOptions = {
      directory: path.resolve(options.directory),
      detectVariants: true,
      generateVariants: true,
      reporters: ['json', 'html', 'files'],
      outputDir: options.output,
    };

    const extractor = new UnifiedExtractor(extractionOptions);
    await extractor.extract();
  });

program
  .command('simple')
  .description('Simple extraction without variants or advanced features')
  .option('-d, --directory <path>', 'Directory to extract from', process.cwd())
  .option('-o, --output <path>', 'Output directory', '.')
  .action(async (options) => {
    const extractionOptions: ExtractionOptions = {
      directory: path.resolve(options.directory),
      strategies: ['pluck'],
      detectVariants: false,
      generateVariants: false,
      analyzeContext: false,
      reporters: ['json'],
      outputDir: options.output,
    };

    const extractor = new UnifiedExtractor(extractionOptions);
    await extractor.extract();
  });

program.parse();
