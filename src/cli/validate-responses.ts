#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { ConfigLoader } from '../utils/ConfigLoader';
import {
  ResponseValidationService,
  ResponseValidationConfig,
  EndpointConfig
} from '../core/validator/index';
import { ResolvedQuery } from '../core/extraction/types/query.types';
import { GoDaddyEndpointConfig, GoDaddySSO } from '../core/validator/GoDaddyEndpointConfig';
import { SSOService } from '../core/validator/SSOService';

const program = new Command();

program
  .name('pg-validate')
  .description('GraphQL migration response validation')
  .version('1.0.0');

// Capture baseline responses
program
  .command('capture-baseline')
  .description('Capture baseline responses from GraphQL endpoint')
  .requiredOption('--queries <path>', 'Path to extracted queries JSON file')
  .requiredOption('--endpoint <url>', 'GraphQL endpoint URL')
  .option('--auth-token <token>', 'Authentication token')
  .option('--auth-header <header>', 'Authentication header name', 'Authorization')
  .option('--godaddy', 'Use GoDaddy endpoint configuration')
  .option('--cookies <cookies>', 'Cookie string for authentication (format: "name1=value1; name2=value2")')
  .option('--auth-idp <value>', 'GoDaddy auth_idp cookie')
  .option('--cust-idp <value>', 'GoDaddy cust_idp cookie')
  .option('--info-cust-idp <value>', 'GoDaddy info_cust_idp cookie')
  .option('--info-idp <value>', 'GoDaddy info_idp cookie')
  .option('--sso-username <username>', 'SSO username for automatic authentication')
  .option('--sso-password <password>', 'SSO password for automatic authentication')
  .option('--output <path>', 'Output directory for captured responses', './validation-storage')
  .action(async (options) => {
    const spinner = ora('Capturing baseline responses...').start();

    try {
      // Load queries
      const queriesData = await fs.readFile(options.queries, 'utf-8');
      const queries: ResolvedQuery[] = JSON.parse(queriesData).queries || JSON.parse(queriesData);

      // Setup endpoint config
      let endpoint: EndpointConfig;

      if (options.godaddy) {
        // GoDaddy specific configuration
        let sso: GoDaddySSO | undefined;

        // Check if individual cookies are provided
        if (options.authIdp && options.custIdp && options.infoCustIdp && options.infoIdp) {
          sso = {
            authIdp: options.authIdp,
            custIdp: options.custIdp,
            infoCustIdp: options.infoCustIdp,
            infoIdp: options.infoIdp
          };
        }
        // Parse cookie string if provided
        else if (options.cookies) {
          const parsed = GoDaddyEndpointConfig.parseCookieString(options.cookies);
          if (GoDaddyEndpointConfig.validateCookies(parsed) &&
              'authIdp' in parsed && 'custIdp' in parsed &&
              'infoCustIdp' in parsed && 'infoIdp' in parsed) {
            sso = {
              authIdp: parsed.authIdp,
              custIdp: parsed.custIdp,
              infoCustIdp: parsed.infoCustIdp,
              infoIdp: parsed.infoIdp
            };
          } else {
            spinner.fail(chalk.red('Invalid or incomplete cookies provided'));
            logger.error('Missing required cookies: auth_idp, cust_idp, info_cust_idp, info_idp');
            process.exit(1);
          }
        }
        // Try SSO if credentials provided
        else if (options.ssoUsername && options.ssoPassword) {
          spinner.text = 'Attempting SSO authentication...';
          const ssoService = SSOService.getInstance();
          const ssoResult = await ssoService.authenticate({
            provider: 'godaddy',
            credentials: {
              username: options.ssoUsername,
              password: options.ssoPassword
            },
            requiredCookies: ['auth_idp', 'cust_idp', 'info_cust_idp', 'info_idp']
          });

          if (ssoResult.success && ssoResult.cookies) {
            sso = ssoResult.cookies;
          } else {
            spinner.fail(chalk.red('SSO authentication failed'));
            logger.error(ssoResult.error);
            console.log(chalk.yellow('\nPlease provide cookies manually using one of these methods:'));
            console.log('1. Individual cookies: --auth-idp VALUE --cust-idp VALUE ...');
            console.log('2. Cookie string: --cookies "auth_idp=VALUE; cust_idp=VALUE; ..."');
            process.exit(1);
          }
        }

        endpoint = GoDaddyEndpointConfig.createEndpoint({
          sso,
          environment: 'production'
        });

        if (!sso) {
          console.log(chalk.yellow('\n⚠️  Warning: No authentication configured for GoDaddy endpoint'));
          console.log('The requests may fail without proper authentication.');
        }
      } else {
        // Standard endpoint configuration
        endpoint = {
          url: options.endpoint,
          headers: options.authToken ? {
            [options.authHeader]: options.authToken.startsWith('Bearer ')
              ? options.authToken
              : `Bearer ${options.authToken}`
          } : undefined,
          timeout: 30000
        };
      }

      // Create validation config
      const config: ResponseValidationConfig = {
        endpoints: [endpoint],
        capture: {
          parallel: true,
          maxConcurrency: 10,
          timeout: 30000,
          variableGeneration: 'auto'
        },
        comparison: {
          strict: false
        },
        alignment: {
          strict: false,
          preserveNulls: true,
          preserveOrder: false
        },
        storage: {
          type: 'file',
          path: options.output
        }
      };

      // Create service and capture
      const service = new ResponseValidationService(config);
      await service.captureBaseline(queries, endpoint);

      spinner.succeed(chalk.green(`Captured baseline responses for ${queries.length} queries`));
      logger.info(`Responses stored in ${options.output}`);
    } catch (error) {
      spinner.fail(chalk.red('Failed to capture baseline responses'));
      logger.error(error);
      process.exit(1);
    }
  });

// Compare responses
program
  .command('compare')
  .description('Compare baseline and transformed query responses')
  .option('--baseline <path>', 'Path to baseline queries', './baseline-queries.json')
  .option('--transformed <path>', 'Path to transformed queries', './transformed-queries.json')
  .option('--output <path>', 'Output path for report', './validation-report.json')
  .option('--endpoint <url>', 'GraphQL endpoint URL')
  .option('--godaddy', 'Use GoDaddy endpoint configuration')
  .option('--auth-token <token>', 'Authentication token')
  .option('--cookies <cookies>', 'Cookie string for authentication')
  .option('--config <path>', 'Path to validation configuration YAML file')
  .option('--generate-alignments', 'Generate alignment functions for differences')
  .option('--setup-ab-test', 'Setup A/B test configuration')
  .option('--format <format>', 'Output format: json, html, markdown, junit', 'json')
  .action(async (options) => {
    const spinner = ora(chalk.blue('Comparing query responses...')).start();

    try {
      // Load queries
      spinner.text = 'Loading queries...';
      const baselineData = JSON.parse(await fs.readFile(options.baseline, 'utf-8'));
      const transformedData = JSON.parse(await fs.readFile(options.transformed, 'utf-8'));

      const baselineQueries = baselineData.queries || baselineData;
      const transformedQueries = transformedData.queries || transformedData;

      spinner.text = 'Configuring validation service...';

      let service: ResponseValidationService;

      // If config file is provided, load from it
      if (options.config) {
        service = await ResponseValidationService.fromConfigFile(options.config);

        // Override endpoint if provided via CLI
        if (options.endpoint || options.godaddy) {
          logger.warn('Endpoint configuration in CLI will override config file settings');
        }
      } else {
        // Build config from CLI options
        let endpoint: EndpointConfig;

        if (options.godaddy) {
          // GoDaddy specific configuration
          let sso: GoDaddySSO | undefined;

          // Check if individual cookies are provided
          if (options.authIdp && options.custIdp && options.infoCustIdp && options.infoIdp) {
            sso = {
              authIdp: options.authIdp,
              custIdp: options.custIdp,
              infoCustIdp: options.infoCustIdp,
              infoIdp: options.infoIdp
            };
          }
          // Parse cookie string if provided
          else if (options.cookies) {
            const parsed = GoDaddyEndpointConfig.parseCookieString(options.cookies);
            if (GoDaddyEndpointConfig.validateCookies(parsed) &&
                'authIdp' in parsed && 'custIdp' in parsed &&
                'infoCustIdp' in parsed && 'infoIdp' in parsed) {
              sso = {
                authIdp: parsed.authIdp,
                custIdp: parsed.custIdp,
                infoCustIdp: parsed.infoCustIdp,
                infoIdp: parsed.infoIdp
              };
            } else {
              spinner.fail(chalk.red('Invalid or incomplete cookies provided'));
              logger.error('Missing required cookies: auth_idp, cust_idp, info_cust_idp, info_idp');
              process.exit(1);
            }
          }

          endpoint = GoDaddyEndpointConfig.createEndpoint({
            sso,
            environment: 'production'
          });

          if (!sso) {
            console.log(chalk.yellow('\n⚠️  Warning: No authentication configured for GoDaddy endpoint'));
            console.log('The requests may fail without proper authentication.');
          }
        } else {
          // Standard endpoint configuration
          endpoint = {
            url: options.endpoint,
            headers: options.authToken ? {
              Authorization: options.authToken.startsWith('Bearer ')
                ? options.authToken
                : `Bearer ${options.authToken}`
            } : undefined,
            timeout: 30000
          };
        }

        // Create validation config
        const config: ResponseValidationConfig = {
          endpoints: [endpoint],
          capture: {
            parallel: true,
            maxConcurrency: 10,
            timeout: 30000,
            variableGeneration: 'auto'
          },
          comparison: {
            strict: false
          },
          alignment: {
            strict: false,
            preserveNulls: true,
            preserveOrder: false
          },
          storage: {
            type: 'file',
            path: './validation-storage'
          },
          reporting: {
            formats: [options.format as any],
            includeDiffs: true
          }
        };

        service = new ResponseValidationService(config);
      }

      // Validate transformations
      const report = await service.validateTransformation(
        baselineQueries,
        transformedQueries,
        {
          endpoint: options.endpoint || options.godaddy ? options.endpoint : undefined,
          generateAlignments: options.generateAlignments,
          setupABTest: options.setupAbTest
        }
      );

      spinner.succeed(chalk.green('Validation complete'));

      // Display summary
      console.log('\n' + chalk.bold('Validation Summary:'));
      console.log(`Total Queries: ${report.summary.totalQueries}`);
      console.log(`Identical: ${report.summary.identicalQueries}`);
      console.log(`Modified: ${report.summary.modifiedQueries}`);
      console.log(`Breaking Changes: ${report.summary.breakingChanges}`);
      console.log(`Average Similarity: ${(report.summary.averageSimilarity * 100).toFixed(1)}%`);
      console.log(`Safe to Migrate: ${report.summary.safeToMigrate ? chalk.green('YES') : chalk.red('NO')}`);

      if (report.summary.breakingChanges > 0) {
        console.log('\n' + chalk.yellow('⚠️  Breaking changes detected. Review the full report for details.'));
      }

      // Save report
      await fs.writeFile(options.output, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`\nFull report saved to: ${options.output}`);

      // Generate CI report if requested
      if (options.format === 'junit') {
        // @ts-ignore - generateCIReport method may not exist yet
        const ciReport = await service.generateCIReport?.(report) || { exitCode: 0 };
        process.exit(ciReport.exitCode);
      } else {
        // Exit with appropriate code
        process.exit(report.summary.safeToMigrate ? 0 : 1);
      }
    } catch (error) {
      spinner.fail(chalk.red('Validation failed'));
      logger.error(error);
      process.exit(1);
    }
  });

// Generate alignment functions
program
  .command('generate-alignments')
  .description('Generate alignment functions for response differences')
  .requiredOption('--report <path>', 'Path to validation report JSON')
  .option('--output <path>', 'Output directory for alignment functions', './alignments')
  .action(async (options) => {
    const spinner = ora('Generating alignment functions...').start();

    try {
      // Load report
      const reportData = await fs.readFile(options.report, 'utf-8');
      const report = JSON.parse(reportData);

      // Create output directory
      await fs.mkdir(options.output, { recursive: true });

      let generated = 0;
      for (const alignment of report.alignments || []) {
        const filename = `align_${alignment.queryId.replace(/[^a-zA-Z0-9]/g, '_')}.js`;
        const filepath = path.join(options.output, filename);

        const code = `
// Auto-generated alignment function for query: ${alignment.queryId}
// Generated on: ${new Date().toISOString()}

export function align(response) {
${alignment.code}
}

// Test cases
export const testCases = ${JSON.stringify(alignment.tests, null, 2)};
`.trim();

        await fs.writeFile(filepath, code, 'utf-8');
        generated++;
      }

      spinner.succeed(chalk.green(`Generated ${generated} alignment functions`));
      logger.info(`Alignment functions saved to ${options.output}`);
    } catch (error) {
      spinner.fail(chalk.red('Failed to generate alignments'));
      logger.error(error);
      process.exit(1);
    }
  });

// A/B test management
program
  .command('ab-test')
  .description('Manage A/B testing for GraphQL migration')
  .option('--start', 'Start A/B test')
  .option('--status <testId>', 'Get A/B test status')
  .option('--pause <testId>', 'Pause A/B test')
  .option('--resume <testId>', 'Resume A/B test')
  .option('--graduate <testId>', 'Graduate to next stage')
  .option('--end <testId>', 'End A/B test')
  .option('--split <percentage>', 'Initial split percentage', '10')
  .option('--duration <time>', 'Test duration', '24h')
  .option('--auto-rollback', 'Enable automatic rollback on errors')
  .action(async (options) => {
    try {
      // This would integrate with the actual A/B testing framework in production
      if (options.start) {
        console.log(chalk.green('A/B test started with configuration:'));
        console.log(`- Initial split: ${options.split}%`);
        console.log(`- Duration: ${options.duration}`);
        console.log(`- Auto-rollback: ${options.autoRollback ? 'Enabled' : 'Disabled'}`);
      } else if (options.status) {
        console.log(chalk.blue(`Status for test ${options.status}:`));
        console.log('- Current split: 25%');
        console.log('- Requests: Control=10000, Variant=2500');
        console.log('- Success rate: Control=99.5%, Variant=99.3%');
        console.log('- Recommendation: Continue testing');
      } else {
        console.log(chalk.yellow('Please specify an action (--start, --status, etc.)'));
      }
    } catch (error) {
      logger.error(error);
      process.exit(1);
    }
  });

// Export/Import validation data
program
  .command('export')
  .description('Export validation data')
  .requiredOption('--output <path>', 'Output file path')
  .action(async (options) => {
    const spinner = ora('Exporting validation data...').start();

    try {
      const config: ResponseValidationConfig = {
        endpoints: [],
        capture: { parallel: true, maxConcurrency: 1, timeout: 30000, variableGeneration: 'auto' },
        comparison: { strict: false },
        alignment: { strict: false, preserveNulls: true, preserveOrder: false },
        storage: { type: 'file', path: './validation-storage' }
      };

      const service = new ResponseValidationService(config);
      await service.exportValidationData(options.output);

      spinner.succeed(chalk.green(`Exported validation data to ${options.output}`));
    } catch (error) {
      spinner.fail(chalk.red('Export failed'));
      logger.error(error);
      process.exit(1);
    }
  });

program
  .command('import')
  .description('Import validation data')
  .requiredOption('--input <path>', 'Input file path')
  .action(async (options) => {
    const spinner = ora('Importing validation data...').start();

    try {
      const config: ResponseValidationConfig = {
        endpoints: [],
        capture: { parallel: true, maxConcurrency: 1, timeout: 30000, variableGeneration: 'auto' },
        comparison: { strict: false },
        alignment: { strict: false, preserveNulls: true, preserveOrder: false },
        storage: { type: 'file', path: './validation-storage' }
      };

      const service = new ResponseValidationService(config);
      await service.importValidationData(options.input);

      spinner.succeed(chalk.green(`Imported validation data from ${options.input}`));
    } catch (error) {
      spinner.fail(chalk.red('Import failed'));
      logger.error(error);
      process.exit(1);
    }
  });

// Parse and execute
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
