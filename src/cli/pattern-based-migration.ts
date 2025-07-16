#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from '../utils/logger.js';
import { QueryPatternService } from '../core/extraction/engine/QueryPatternRegistry.js';
import { QueryMigrator } from '../core/extraction/engine/QueryMigrator.js';
import { PatternAwareASTStrategy } from '../core/extraction/strategies/PatternAwareASTStrategy.js';
import { PatternExtractedQuery } from '../core/extraction/types/pattern.types.js';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface PatternMigrationOptions {
  directory: string;
  pattern: string;
  outputFile?: string;
  dryRun: boolean;
  verbose: boolean;
}

export class PatternBasedMigrationCLI {
  private patternService: QueryPatternService;
  private migrator: QueryMigrator;
  private strategy: PatternAwareASTStrategy;

  constructor() {
    this.patternService = new QueryPatternService();
    this.migrator = new QueryMigrator(this.patternService);
    this.strategy = new PatternAwareASTStrategy(this.patternService);
  }

  async run(options: PatternMigrationOptions): Promise<void> {
    try {
      logger.info('Starting pattern-based migration analysis...');

      // Find all matching files
      const files = await this.findFiles(options.directory, options.pattern);
      logger.info(`Found ${files.length} files to analyze`);

      // Extract queries with pattern awareness
      const allQueries: PatternExtractedQuery[] = [];

      for (const file of files) {
        if (options.verbose) {
          logger.info(`Processing: ${file}`);
        }

        const content = await fs.promises.readFile(file, 'utf-8');
        const queries = await this.strategy.extract(file, content);
        allQueries.push(...queries);
      }

      logger.info(`Extracted ${allQueries.length} queries`);

      // Analyze patterns and generate migration recommendations
      const migrationResults = await this.migrator.migrateQueries(allQueries);
      const summary = this.migrator.generateMigrationSummary(migrationResults);

      // Generate queryNames updates
      const queryNamesUpdates = this.migrator.generateQueryNamesUpdates(migrationResults);

      // Display results
      this.displayResults(summary, queryNamesUpdates, allQueries, options);

      // Generate duplicate analysis
      const duplicateGroups = await this.strategy.groupDuplicates(allQueries);
      this.displayDuplicateAnalysis(duplicateGroups);

      // Save results if requested
      if (options.outputFile) {
        await this.saveResults(options.outputFile, {
          summary,
          queryNamesUpdates,
          migrationResults,
          duplicateGroups: Array.from(duplicateGroups.entries()),
        });
      }

      logger.info('✅ Pattern-based migration analysis complete!');
    } catch (error) {
      logger.error(`Migration analysis failed: ${error}`);
      process.exit(1);
    }
  }

  private async findFiles(directory: string, pattern: string): Promise<string[]> {
    const fullPattern = path.join(directory, pattern);
    return glob(fullPattern, { ignore: ['**/node_modules/**', '**/dist/**'] });
  }

  private displayResults(
    summary: any,
    queryNamesUpdates: any,
    queries: PatternExtractedQuery[],
    options: PatternMigrationOptions,
  ): void {
    console.log('\n📊 Migration Analysis Summary');
    console.log('═'.repeat(50));
    console.log(`Total queries analyzed: ${summary.totalQueries}`);
    console.log(`Queries needing migration: ${summary.needsMigration}`);
    console.log(`Queries requiring manual review: ${summary.requiresManualReview}`);
    console.log(`Pattern-based migrations: ${summary.patternBasedMigrations}`);
    console.log(`Static migrations: ${summary.staticMigrations}`);

    console.log('\n🔄 Version Progression');
    console.log('─'.repeat(30));
    for (const [progression, count] of Object.entries(summary.versionProgression)) {
      console.log(`${progression}: ${count} queries`);
    }

    console.log('\n📝 Changes Summary');
    console.log('─'.repeat(30));
    console.log(`QueryNames updates: ${summary.changes.queryNames}`);
    console.log(`Fragment updates: ${summary.changes.fragments}`);
    console.log(`Directive updates: ${summary.changes.directives}`);

    if (queryNamesUpdates.changes.length > 0) {
      console.log('\n🔧 QueryNames Object Updates');
      console.log('─'.repeat(30));
      for (const change of queryNamesUpdates.changes) {
        console.log(`${change.property}: ${change.from} → ${change.to}`);
        console.log(`  Reason: ${change.reason}`);
      }
    }

    // Show pattern details for queries
    console.log('\n🏷️  Pattern Analysis');
    console.log('─'.repeat(30));
    const patternQueries = queries.filter((q) => q.namePattern);
    const staticQueries = queries.filter((q) => !q.namePattern);

    console.log(`Dynamic pattern queries: ${patternQueries.length}`);
    console.log(`Static queries: ${staticQueries.length}`);

    if (options.verbose && patternQueries.length > 0) {
      console.log('\nPattern Details:');
      for (const query of patternQueries.slice(0, 5)) {
        console.log(`  📍 ${query.filePath}`);
        console.log(`     Template: ${query.namePattern?.template}`);
        console.log(`     Version: ${query.namePattern?.version}`);
        console.log(`     Deprecated: ${query.namePattern?.isDeprecated ? '⚠️  Yes' : '✅ No'}`);
        if (query.namePattern?.migrationPath) {
          console.log(`     Migration: → ${query.namePattern.migrationPath}`);
        }
      }
      if (patternQueries.length > 5) {
        console.log(`     ... and ${patternQueries.length - 5} more`);
      }
    }
  }

  private displayDuplicateAnalysis(duplicateGroups: Map<string, PatternExtractedQuery[]>): void {
    const duplicates = Array.from(duplicateGroups.entries()).filter(
      ([_, queries]) => queries.length > 1,
    );

    if (duplicates.length === 0) {
      console.log('\n✅ No duplicate queries found');
      return;
    }

    console.log('\n🔍 Duplicate Query Analysis');
    console.log('─'.repeat(30));
    console.log(`Found ${duplicates.length} groups of duplicate queries`);

    for (const [fingerprint, queries] of duplicates.slice(0, 3)) {
      console.log(`\n📋 Group ${fingerprint.substring(0, 8)}... (${queries.length} queries)`);

      for (const query of queries) {
        console.log(`  📍 ${query.filePath}:${query.location.line}`);
        if (query.namePattern) {
          console.log(`     Pattern: ${query.namePattern.template} (${query.namePattern.version})`);
        }
      }
    }

    if (duplicates.length > 3) {
      console.log(`\n... and ${duplicates.length - 3} more duplicate groups`);
    }
  }

  private async saveResults(outputFile: string, results: any): Promise<void> {
    const outputDir = path.dirname(outputFile);
    await fs.promises.mkdir(outputDir, { recursive: true });

    await fs.promises.writeFile(outputFile, JSON.stringify(results, null, 2), 'utf-8');

    logger.info(`Results saved to: ${outputFile}`);
  }
}

// CLI Setup
const program = new Command();

program
  .name('pattern-migration')
  .description('Analyze GraphQL queries using pattern-based approach instead of normalization')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze queries with pattern-based migration approach')
  .option('-d, --directory <path>', 'Directory to search for queries', './src')
  .option('-p, --pattern <pattern>', 'File pattern to match', '**/*.{ts,tsx,js,jsx}')
  .option('-o, --output-file <file>', 'Output file for results')
  .option('--dry-run', 'Run analysis without making changes', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (options) => {
    const cli = new PatternBasedMigrationCLI();
    await cli.run(options);
  });

program
  .command('demo')
  .description('Run a demo showing the difference between old and new approaches')
  .action(async () => {
    console.log('🎭 Pattern-Based Migration Demo');
    console.log('═'.repeat(50));

    console.log('\n❌ Old Approach (Normalization):');
    console.log('  1. Load queryNames.js with eval()');
    console.log('  2. Resolve ${queryNames.byIdV1} → "getVentureHomeDataByVentureIdDashboard"');
    console.log('  3. Normalize query name, breaking dynamic selection');
    console.log('  4. Lose context about versions and feature flags');
    console.log('  5. Brittle state mutation during extraction');

    console.log('\n✅ New Approach (Pattern Tracking):');
    console.log('  1. Registry maps patterns to versions and metadata');
    console.log('  2. Preserve ${queryNames.byIdV1} template in query');
    console.log('  3. Track: V1 → V3 migration path');
    console.log('  4. Detect: ventureFields → ventureInfinityStoneDataFields');
    console.log('  5. Recommend: Update queryNames object, not query string');
    console.log('  6. Respect: infinityStoneEnabled feature flag conditions');

    console.log('\n🔧 Migration Strategy:');
    console.log('  Instead of changing:');
    console.log('    query getVentureHomeDataByVentureIdDashboard { ... }');
    console.log('  To:');
    console.log('    query getVentureHomeDataByVentureIdDashboardV3 { ... }');
    console.log('  We preserve:');
    console.log('    query ${queryNames.byIdV1} { ... }');
    console.log('  And update:');
    console.log('    queryNames.byIdV1 → points to V3 query name');

    console.log('\n🎯 Benefits:');
    console.log('  ✅ Preserves application logic');
    console.log('  ✅ Enables safe migration');
    console.log('  ✅ Handles versioning correctly');
    console.log('  ✅ Supports feature flags');
    console.log('  ✅ Content-based duplicate detection');
    console.log('  ✅ No brittle state mutations');

    console.log('\n📋 To run actual analysis:');
    console.log('  npx tsx pattern-migration analyze --directory ./src --verbose');
  });

if (require.main === module) {
  program.parse(process.argv);
}

export default program;
