#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { promises as fs } from 'fs';
import { logger } from '../utils/logger.js';
import { GitHubService, MigrationSummary } from '../core/integration/GitHubService';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PRGenerationOptions {
  schema: string;
  base?: string;
  title?: string;
  draft?: boolean;
  labels?: string;
  assignees?: string;
  reviewers?: string;
  summaryFile?: string;
  branch?: string;
  noCommit?: boolean;
  noPush?: boolean;
  // A/B Testing flags
  abTest?: boolean;
  abVariant?: 'control' | 'treatment';
  abPercentage?: number;
  abMetadata?: string;
}

const program = new Command();

program
  .name('generate-pr')
  .description('Generate a GitHub pull request for GraphQL migration changes')
  .version('1.0.0')
  .requiredOption('-s, --schema <path>', 'Path to the GraphQL schema file')
  .option('-b, --base <branch>', 'Base branch for the PR (default: main)', 'main')
  .option('-t, --title <title>', 'Custom PR title')
  .option('-d, --draft', 'Create as draft PR')
  .option('-l, --labels <labels>', 'Comma-separated list of labels')
  .option('-a, --assignees <assignees>', 'Comma-separated list of assignees')
  .option('-r, --reviewers <reviewers>', 'Comma-separated list of reviewers')
  .option('--summary-file <path>', 'Path to migration summary JSON file')
  .option('--branch <name>', 'Custom branch name (auto-generated if not provided)')
  .option('--no-commit', 'Skip creating commit')
  .option('--no-push', 'Skip pushing to remote')
  .option('--ab-test', 'Enable A/B testing for this migration')
  .option('--ab-variant <variant>', 'A/B test variant (control|treatment)', 'control')
  .option('--ab-percentage <number>', 'Percentage of traffic for A/B test', '10')
  .option('--ab-metadata <json>', 'Additional A/B test metadata as JSON string')
  .action(async (options: PRGenerationOptions) => {
    try {
      logger.info('Starting PR generation process...');

      // Validate schema file exists
      const schemaPath = path.resolve(options.schema);
      try {
        await fs.access(schemaPath);
      } catch {
        logger.error(`Schema file not found: ${schemaPath}`);
        process.exit(1);
      }

      // Initialize GitHub service
      const githubService = new GitHubService();

      // Check git status
      const gitStatus = await githubService.getGitStatus();
      if (!gitStatus.isGitRepo) {
        logger.error('Not a git repository. Please run this command from within a git repository.');
        process.exit(1);
      }

      // Load or generate migration summary
      let summary: MigrationSummary = {
        totalFiles: 0,
        totalQueries: 0,
        transformedQueries: 0,
        deprecationsFixed: 0,
        filesModified: [],
        validationPassed: false
      };

      if (options.summaryFile) {
        try {
          const summaryContent = await fs.readFile(options.summaryFile, 'utf-8');
          summary = JSON.parse(summaryContent);
          logger.info(`Loaded migration summary from ${options.summaryFile}`);
        } catch (error) {
          logger.error(`Failed to load summary file: ${error}`);
          process.exit(1);
        }
      } else {
        // Try to find default summary file
        const defaultSummaryPaths = [
          './migration-summary.json',
          './extraction-results.json',
          './test-pipeline/migration-summary.json'
        ];

        let summaryLoaded = false;
        for (const summaryPath of defaultSummaryPaths) {
          try {
            const summaryContent = await fs.readFile(summaryPath, 'utf-8');
            const data = JSON.parse(summaryContent);

            // Convert extraction results format to migration summary if needed
            if (data.extractedQueries) {
              const filePathSet = new Set<string>();
              data.extractedQueries.forEach((q: any) => {
                if (q.filePath) filePathSet.add(q.filePath);
              });

              summary = {
                totalFiles: data.totalFiles || 0,
                totalQueries: data.extractedQueries.length,
                transformedQueries: data.extractedQueries.filter((q: any) => q.transformed).length,
                deprecationsFixed: data.deprecationsFound || 0,
                filesModified: Array.from(filePathSet),
                validationPassed: data.validationStatus === 'passed'
              };
            } else {
              summary = data;
            }

            summaryLoaded = true;
            logger.info(`Loaded migration summary from ${summaryPath}`);
            break;
          } catch {
            // Continue to next path
          }
        }

        if (!summaryLoaded) {
          // Create a basic summary
          logger.warn('No migration summary found. Creating basic PR with minimal information.');
          summary = {
            totalFiles: 0,
            totalQueries: 0,
            transformedQueries: 0,
            deprecationsFixed: 0,
            filesModified: [],
            validationPassed: false
          };
        }
      }

      // Check for modified files if not in summary
      if (summary.filesModified.length === 0 && gitStatus.hasUncommittedChanges) {
        const { stdout } = await import('child_process').then(cp =>
          new Promise<{ stdout: string }>((resolve, reject) => {
            cp.exec('git diff --name-only', (error, stdout) => {
              if (error) reject(error);
              else resolve({ stdout });
            });
          })
        );
        summary.filesModified = stdout.trim().split('\n').filter(f => f);
      }

      if (summary.filesModified.length === 0) {
        logger.warn('No modified files found. Make sure you have run the migration first.');
      }

      // Generate branch name
      const branchName = options.branch || githubService.generateBranchName();

      // Create feature branch
      try {
        await githubService.createFeatureBranch(branchName);
        logger.info(`Created branch: ${branchName}`);
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          logger.warn(`Branch ${branchName} already exists. Using existing branch.`);
          // Checkout the existing branch
          await import('child_process').then(cp =>
            new Promise<void>((resolve, reject) => {
              cp.exec(`git checkout ${branchName}`, (error) => {
                if (error) reject(error);
                else resolve();
              });
            })
          );
        } else {
          throw error;
        }
      }

      // Stage and commit changes
      if (!options.noCommit && summary.filesModified.length > 0) {
        try {
          await githubService.stageFiles(summary.filesModified);

          const commitMessage = `feat: Apply GraphQL schema migration

- Transformed ${summary.transformedQueries} queries
- Fixed ${summary.deprecationsFixed} deprecations
- Modified ${summary.filesModified.length} files`;

          const commitHash = await githubService.createCommit(
            'feat: Apply GraphQL schema migration',
            commitMessage
          );
          logger.info(`Created commit: ${commitHash}`);
        } catch (error: any) {
          if (error.message.includes('No changes to commit')) {
            logger.info('No changes to commit. Proceeding with existing commits.');
          } else {
            throw error;
          }
        }
      }

      // Push to remote
      if (!options.noPush) {
        await githubService.pushToRemote(branchName);
      }

      // Generate PR title and body
      let prTitle = options.title ||
        `GraphQL Schema Migration: ${summary.transformedQueries} queries updated`;
      
      // Add A/B test indicator to title if enabled
      if (options.abTest) {
        prTitle += ` [A/B: ${options.abVariant}@${options.abPercentage}%]`;
      }

      let prBody = githubService.generatePRBody(summary);
      
      // Add A/B test information to PR body
      if (options.abTest) {
        let abTestSection = `\n\n## A/B Test Configuration\n` +
          `- **Enabled**: ✅\n` +
          `- **Variant**: ${options.abVariant}\n` +
          `- **Traffic Percentage**: ${options.abPercentage}%\n` +
          `- **Test Duration**: 14 days (recommended)\n` +
          `- **Success Metrics**: Error rate, latency, user feedback\n`;
        
        if (options.abMetadata) {
          try {
            const metadata = JSON.parse(options.abMetadata);
            abTestSection += `- **Metadata**: ${JSON.stringify(metadata, null, 2)}\n`;
          } catch (e) {
            logger.warn('Invalid A/B metadata JSON, skipping');
          }
        }
        
        prBody += abTestSection;
      }

      // Parse optional parameters
      let labels = options.labels?.split(',').map(l => l.trim()).filter(l => l) || [];
      
      // Add A/B test labels if enabled
      if (options.abTest) {
        labels.push('a/b-test', `variant:${options.abVariant}`, 'experimental');
      }
      
      const assignees = options.assignees?.split(',').map(a => a.trim()).filter(a => a);
      const reviewers = options.reviewers?.split(',').map(r => r.trim()).filter(r => r);

      // Create pull request
      const pr = await githubService.createPR({
        title: prTitle,
        body: prBody,
        base: options.base,
        draft: options.draft,
        labels,
        assignees,
        reviewers
      });

      // Log success
      console.log(chalk.green('\n✅ Pull request created successfully!'));
      console.log(chalk.blue(`   URL: ${pr.url}`));
      console.log(chalk.dim(`   Number: #${pr.number}`));
      console.log(chalk.dim(`   Title: ${pr.title}`));
      console.log(chalk.dim(`   Base: ${pr.baseRefName}`));
      console.log(chalk.dim(`   Head: ${pr.headRefName}`));

      // Save PR info
      const prInfo: any = {
        number: pr.number,
        url: pr.url,
        title: pr.title,
        base: pr.baseRefName,
        head: pr.headRefName,
        files: summary.filesModified,
        operations: {
          totalFiles: summary.totalFiles,
          totalQueries: summary.totalQueries,
          transformedQueries: summary.transformedQueries,
          deprecationsFixed: summary.deprecationsFixed,
          validationPassed: summary.validationPassed
        },
        createdAt: new Date().toISOString()
      };
      
      // Add A/B test configuration to PR info
      if (options.abTest) {
        prInfo.abTest = {
          enabled: true,
          variant: options.abVariant,
          percentage: parseInt(String(options.abPercentage || '10')),
          metadata: options.abMetadata ? JSON.parse(options.abMetadata) : null,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days
        };
      }

      await fs.writeFile(
        'pr-info.json',
        JSON.stringify(prInfo, null, 2)
      );
      logger.info('PR information saved to pr-info.json');

    } catch (error) {
      logger.error('Failed to generate PR:', error);
      process.exit(1);
    }
  });

// Only parse if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generate-pr.ts') || process.argv[1]?.endsWith('generate-pr.js')) {
  program.parse(process.argv);

  // Show help if no arguments provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

// Export for testing
export { program };
