#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { formatGraphQL } from '../utils/formatter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

program
  .name('pg-cli')
  .description('🚀 GraphQL Migration Tool - Everything you need in one place')
  .version('0.1.0');

// Helper function to run CLI commands
async function runCLI(scriptPath: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tsx', [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

// 🔍 ANALYSIS COMMANDS
const analysis = program
  .command('analyze')
  .description('🔍 Analyze your GraphQL operations and schema');

analysis
  .command('operations [directory]')
  .description('Analyze GraphQL operations in your codebase')
  .option('-s, --schema <path>', 'GraphQL schema file', './schema.graphql')
  .option('-o, --output <path>', 'Output directory', './analysis')
  .option('--detailed', 'Show detailed analysis')
  .action(async (directory = './src', options) => {
    const args = [
      directory,
      ...(options.schema ? ['-s', options.schema] : []),
      ...(options.output ? ['-o', options.output] : []),
      ...(options.detailed ? ['--detailed'] : [])
    ];
    await runCLI(join(__dirname, 'analyze-operations.ts'), args);
  });

analysis
  .command('variants [directory]')
  .description('Analyze query variants and dynamic fragments')
  .option('-o, --output <path>', 'Output directory', './variant-analysis')
  .option('--advanced', 'Use advanced variant extraction')
  .action(async (directory = './src', options) => {
    const scriptPath = options.advanced
      ? 'extract-advanced-variants.ts'
      : 'variant-analysis.ts';
    const args = [
      directory,
      ...(options.output ? ['-o', options.output] : [])
    ];
    await runCLI(join(__dirname, scriptPath), args);
  });

analysis
  .command('production-readiness [directory]')
  .description('Run comprehensive production readiness analysis')
  .requiredOption('-s, --schema <path>', 'GraphQL schema file')
  .option('-o, --output <path>', 'Output directory', './production-report')
  .option('--skip-validation', 'Skip schema validation')
  .option('--continue-on-error', 'Continue on errors')
  .action(async (directory = './src', options) => {
    const args = [
      directory,
      '-s', options.schema,
      ...(options.output ? ['-o', options.output] : []),
      ...(options.skipValidation ? ['--skip-validation'] : []),
      ...(options.continueOnError ? ['--continue-on-error'] : [])
    ];
    await runCLI(join(__dirname, 'production-pipeline.ts'), args);
  });

// 📤 EXTRACTION COMMANDS
const extract = program
  .command('extract')
  .description('📤 Extract GraphQL operations from your codebase');

extract
  .command('queries [directory]')
  .description('Extract GraphQL queries from source files')
  .option('-o, --output <path>', 'Output file', './extracted-queries.json')
  .option('-p, --pattern <patterns...>', 'File patterns to scan', ['**/*.{js,jsx,ts,tsx}'])
  .option('--dynamic', 'Extract dynamic variants')
  .option('--no-fragments', 'Skip fragment resolution')
  .action(async (directory = './src', options) => {
    const args = [
      'extract',
      directory,
      ...(options.output ? ['-o', options.output] : []),
      ...(options.pattern ? ['-p', ...options.pattern] : []),
      ...(options.dynamic ? ['--dynamic'] : []),
      ...(options.fragments === false ? ['--no-fragments'] : [])
    ];
    await runCLI(join(__dirname, 'extract-transform.ts'), args);
  });

extract
  .command('variants [directory]')
  .description('Extract query variants and alternatives')
  .option('-o, --output <path>', 'Output directory', './extracted-variants')
  .option('--advanced', 'Use advanced extraction methods')
  .action(async (directory = './src', options) => {
    const scriptPath = options.advanced
      ? 'extract-advanced-variants.ts'
      : 'extract-variants.ts';
    const args = [
      directory,
      ...(options.output ? ['-o', options.output] : [])
    ];
    await runCLI(join(__dirname, scriptPath), args);
  });

extract
  .command('unified [directory]')
  .description('Unified extraction with all features')
  .option('-o, --output <path>', 'Output directory', './extraction-results')
  .option('--config <path>', 'Configuration file')
  .action(async (directory = './src', options) => {
    const args = [
      directory,
      ...(options.output ? ['-o', options.output] : []),
      ...(options.config ? ['-c', options.config] : [])
    ];
    await runCLI(join(__dirname, 'unified-extract.ts'), args);
  });

// 🔄 TRANSFORMATION COMMANDS
const transform = program
  .command('transform')
  .description('🔄 Transform GraphQL operations based on schema changes');

transform
  .command('queries')
  .description('Transform queries based on deprecation rules')
  .option('-i, --input <path>', 'Input queries file', './extracted-queries.json')
  .option('-s, --schema <path>', 'GraphQL schema file', './schema.graphql')
  .option('-o, --output <path>', 'Output directory', './transformed')
  .option('--dry-run', 'Preview changes without applying')
  .option('--validate', 'Validate against schema', true)
  .action(async (options) => {
    const args = [
      'transform',
      ...(options.input ? ['-i', options.input] : []),
      ...(options.schema ? ['-s', options.schema] : []),
      ...(options.output ? ['-o', options.output] : []),
      ...(options.dryRun ? ['--dry-run'] : []),
      ...(options.validate ? ['--validate'] : [])
    ];
    await runCLI(join(__dirname, 'extract-transform.ts'), args);
  });

// ✅ VALIDATION COMMANDS
const validate = program
  .command('validate')
  .description('✅ Validate GraphQL operations and responses');

validate
  .command('schema')
  .description('Validate queries against GraphQL schema')
  .option('-q, --queries <path>', 'Queries file', './extracted-queries.json')
  .option('-s, --schema <path>', 'GraphQL schema file', './schema.graphql')
  .option('--pipeline', 'Run full validation pipeline')
  .action(async (options) => {
    if (options.pipeline) {
      const args = [
        'pipeline',
        options.schema,
        ...(options.queries ? ['--queries', options.queries] : [])
      ];
      await runCLI(join(__dirname, 'validate-pipeline.ts'), args);
    } else {
      console.log(chalk.yellow('Use --pipeline flag for full validation'));
    }
  });

validate
  .command('responses')
  .description('Validate response data integrity')
  .option('--queries <path>', 'Queries file', './extracted-queries.json')
  .option('--endpoint <url>', 'GraphQL endpoint URL')
  .option('--godaddy', 'Use GoDaddy configuration')
  .option('--capture-baseline', 'Capture baseline responses')
  .option('--compare', 'Compare baseline vs transformed')
  .option('--auth-token <token>', 'Authentication token')
  .option('--cookies <cookies>', 'Cookie string for auth')
  .action(async (options) => {
    const command = options.captureBaseline ? 'capture-baseline' : 'compare';
    const args = [
      command,
      ...(options.queries ? ['--queries', options.queries] : []),
      ...(options.endpoint ? ['--endpoint', options.endpoint] : []),
      ...(options.godaddy ? ['--godaddy'] : []),
      ...(options.authToken ? ['--auth-token', options.authToken] : []),
      ...(options.cookies ? ['--cookies', options.cookies] : [])
    ];
    await runCLI(join(__dirname, 'validate-responses.ts'), args);
  });

validate
  .command('variants')
  .description('Validate extracted query variants')
  .option('-i, --input <path>', 'Input directory', './extracted-variants')
  .option('-s, --schema <path>', 'GraphQL schema file', './schema.graphql')
  .action(async (options) => {
    const args = [
      ...(options.input ? ['-i', options.input] : []),
      ...(options.schema ? ['-s', options.schema] : [])
    ];
    await runCLI(join(__dirname, 'validate-variants.ts'), args);
  });

// 🚀 MIGRATION COMMANDS
const migrate = program
  .command('migrate')
  .description('🚀 Run GraphQL migrations with safety checks');

migrate
  .command('full')
  .description('Run complete migration pipeline')
  .option('-d, --directory <path>', 'Source directory', './src')
  .option('-s, --schema <path>', 'GraphQL schema file', './schema.graphql')
  .option('-c, --config <path>', 'Configuration file', './migration.config.yaml')
  .option('--dry-run', 'Preview changes without applying')
  .option('--interactive', 'Interactive mode with confirmations')
  .option('--validate-responses', 'Validate response data')
  .option('--create-pr', 'Create GitHub PR after migration')
  .option('--rollout <percent>', 'Progressive rollout percentage', '1')
  .action(async (options) => {
    const args = [
      ...(options.directory ? ['-d', options.directory] : []),
      ...(options.schema ? ['-s', options.schema] : []),
      ...(options.config ? ['-c', options.config] : []),
      ...(options.dryRun ? ['--dry-run'] : []),
      ...(options.interactive ? ['--interactive'] : []),
      ...(options.validateResponses ? ['--validate-responses'] : []),
      ...(options.createPr ? ['--create-pr'] : []),
      ...(options.rollout ? ['--rollout', options.rollout] : [])
    ];
    await runCLI(join(__dirname, 'migrate.ts'), args);
  });

migrate
  .command('apply')
  .description('Apply transformations to source files')
  .option('-i, --input <path>', 'Transformed queries directory', './transformed')
  .option('--dry-run', 'Preview changes without applying')
  .action(async (options) => {
    const args = [
      'apply',
      ...(options.input ? ['-i', options.input] : []),
      ...(options.dryRun ? ['--dry-run'] : [])
    ];
    await runCLI(join(__dirname, 'extract-transform.ts'), args);
  });

migrate
  .command('pattern-migrate')
  .description('Run pattern-aware migration with centralized query naming')
  .option('-d, --directory <path>', 'Source directory', './src')
  .option('-s, --schema <path>', 'GraphQL schema file', './schema.graphql')
  .option('--dry-run', 'Preview changes without applying')
  .option('--demo', 'Run in demo mode showing pattern detection')
  .action(async (options) => {
    const args = [
      ...(options.directory ? ['--directory', options.directory] : []),
      ...(options.schema ? ['--schema', options.schema] : []),
      ...(options.dryRun ? ['--dry-run'] : []),
      ...(options.demo ? ['--demo'] : [])
    ];
    await runCLI(join(__dirname, 'pattern-based-migration.ts'), args);
  });

// 🔧 UTILITY COMMANDS
const utils = program
  .command('utils')
  .description('🔧 Utility commands for development and maintenance');

utils
  .command('generate-pr')
  .description('Generate GitHub pull request for migration')
  .requiredOption('-s, --schema <path>', 'GraphQL schema file')
  .option('-b, --base <branch>', 'Base branch', 'main')
  .option('-t, --title <title>', 'PR title')
  .option('--draft', 'Create as draft PR')
  .option('--summary-file <path>', 'Migration summary file')
  .action(async (options) => {
    const args = [
      '-s', options.schema,
      ...(options.base ? ['-b', options.base] : []),
      ...(options.title ? ['-t', options.title] : []),
      ...(options.draft ? ['--draft'] : []),
      ...(options.summaryFile ? ['--summary-file', options.summaryFile] : [])
    ];
    await runCLI(join(__dirname, 'generate-pr.ts'), args);
  });

utils
  .command('type-safe')
  .description('Run type-safe operations')
  .option('-o, --operation <name>', 'Specific operation to run')
  .action(async (options) => {
    const args = [
      ...(options.operation ? ['-o', options.operation] : [])
    ];
    await runCLI(join(__dirname, 'type-safe-cli.ts'), args);
  });

utils
  .command('convert-querynames')
  .description('Convert queryNames.js files to pattern registry format')
  .requiredOption('-i, --input <path>', 'Path to queryNames.js file')
  .option('-o, --output <path>', 'Output path for pattern registry', './pattern-registry.json')
  .option('-f, --format <type>', 'Output format: json or typescript', 'json')
  .option('--dry-run', 'Preview conversion without writing files')
  .action(async (options) => {
    const args = [
      '-i', options.input,
      '-o', options.output,
      '-f', options.format,
      ...(options.dryRun ? ['--dry-run'] : [])
    ];
    await runCLI(join(__dirname, 'convert-querynames.ts'), args);
  });

utils
  .command('validate-migration')
  .description('Validate that pattern migration preserved query behavior')
  .requiredOption('-b, --before <path>', 'Path to queries before migration')
  .requiredOption('-a, --after <path>', 'Path to queries after migration')
  .option('-o, --output <path>', 'Output path for detailed report')
  .option('--strict', 'Enable strict validation mode')
  .option('--ignore-whitespace', 'Ignore whitespace differences')
  .action(async (options) => {
    const args = [
      '-b', options.before,
      '-a', options.after,
      ...(options.output ? ['-o', options.output] : []),
      ...(options.strict ? ['--strict'] : []),
      ...(options.ignoreWhitespace ? ['--ignore-whitespace'] : [])
    ];
    await runCLI(join(__dirname, 'validate-migration.ts'), args);
  });

// 🐙 GITHUB COMMANDS
const github = program
  .command('github')
  .alias('gh')
  .description('🐙 GitHub CLI integration for exploring codebases');

github
  .command('search <query>')
  .description('Search for GraphQL files in GitHub repositories')
  .option('-r, --repo <repo>', 'Specific repository (owner/repo format)')
  .option('-o, --org <org>', 'Search within organization')
  .option('-l, --language <lang>', 'Language filter', 'graphql')
  .option('-n, --limit <n>', 'Number of results', '10')
  .option('--include-forks', 'Include forked repositories')
  .action(async (query, options) => {
    const spinner = ora('Searching GitHub repositories...').start();

    try {
      // Build search query
      let searchQuery = query;
      if (options.org) searchQuery += ` org:${options.org}`;
      if (options.language) searchQuery += ` language:${options.language}`;
      if (!options.includeForks) searchQuery += ' fork:false';

      // Use GitHub CLI
      const { execSync } = await import('child_process');

      if (options.repo) {
        // Search within specific repo
        const cmd = `gh api search/code?q=${encodeURIComponent(query)}+repo:${options.repo} --jq '.items[] | {path: .path, url: .html_url, repo: .repository.full_name}'`;
        const result = execSync(cmd, { encoding: 'utf-8' });
        spinner.succeed('Search completed');
        console.log(result);
      } else {
        // General search
        const cmd = `gh api search/code?q=${encodeURIComponent(searchQuery)} --jq '.items[0:${options.limit}] | .[] | {path: .path, url: .html_url, repo: .repository.full_name}'`;
        const result = execSync(cmd, { encoding: 'utf-8' });
        spinner.succeed('Search completed');
        console.log(result);
      }
    } catch (error) {
      spinner.fail('Search failed');
      console.error(chalk.red('Error:'), error);
    }
  });

github
  .command('view <file>')
  .description('View a file from a GitHub repository')
  .requiredOption('-r, --repo <repo>', 'Repository (owner/repo format)')
  .option('-b, --branch <branch>', 'Branch name', 'main')
  .option('--raw', 'Show raw content without syntax highlighting')
  .action(async (file, options) => {
    try {
      const { execSync } = await import('child_process');

      if (options.raw) {
        // Get raw content
        const cmd = `gh api repos/${options.repo}/contents/${file}?ref=${options.branch} --jq '.content' | base64 -d`;
        const content = execSync(cmd, { encoding: 'utf-8' });
        console.log(content);
      } else {
        // Use gh repo view for better formatting
        const cmd = `gh repo view ${options.repo} --branch ${options.branch} --json owner,name | gh api repos/{.owner.login}/{.name}/contents/${file}?ref=${options.branch} --jq '.content' | base64 -d`;
        const content = execSync(cmd, { encoding: 'utf-8' });

        // Syntax highlight if it's a GraphQL file
        if (file.endsWith('.graphql') || file.endsWith('.gql')) {
          const highlighted = await formatGraphQL(content);
          console.log(highlighted);
        } else {
          console.log(content);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error viewing file:'), error);
    }
  });

github
  .command('analyze-repo <repo>')
  .description('Analyze GraphQL usage in a repository')
  .option('-b, --branch <branch>', 'Branch to analyze', 'main')
  .option('-o, --output <path>', 'Output directory for analysis')
  .option('--clone', 'Clone and analyze locally (more thorough)')
  .action(async (repo, options) => {
    const spinner = ora(`Analyzing repository ${repo}...`).start();

    try {
      const { execSync } = await import('child_process');

      if (options.clone) {
        // Clone and analyze locally
        spinner.text = 'Cloning repository...';
        const tempDir = `/tmp/gh-analyze-${Date.now()}`;
        execSync(`gh repo clone ${repo} ${tempDir} -- --depth 1 --branch ${options.branch}`, { stdio: 'pipe' });

        spinner.text = 'Extracting GraphQL operations...';
        const outputDir = options.output || `./analysis-${repo.replace('/', '-')}`;

        // Use our extraction tools
        await runCLI(join(__dirname, 'extract-transform.ts'), [
          'extract',
          tempDir,
          '-o', `${outputDir}/extracted-queries.json`,
          '--dynamic'
        ]);

        spinner.text = 'Analyzing operations...';
        await runCLI(join(__dirname, 'analyze-operations.ts'), [
          tempDir,
          '-o', outputDir
        ]);

        // Cleanup
        execSync(`rm -rf ${tempDir}`, { stdio: 'pipe' });

        spinner.succeed(`Analysis complete. Results saved to ${outputDir}`);
      } else {
        // Remote analysis using GitHub API
        spinner.text = 'Searching for GraphQL files...';

        // Find GraphQL files
        const searchCmd = `gh api search/code?q=extension:graphql+extension:gql+repo:${repo} --jq '.items[] | .path'`;
        const files = execSync(searchCmd, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

        console.log(chalk.cyan(`\nFound ${files.length} GraphQL files in ${repo}:`));
        files.forEach(file => console.log(`  - ${file}`));

        // Search for GraphQL usage in code
        spinner.text = 'Searching for GraphQL usage in code...';
        const codeSearchCmd = `gh api search/code?q=graphql+OR+gql\`+repo:${repo} --jq '.total_count'`;
        const usageCount = execSync(codeSearchCmd, { encoding: 'utf-8' }).trim();

        console.log(chalk.cyan(`\nGraphQL usage: ${usageCount} files contain GraphQL references`));

        spinner.succeed('Remote analysis complete');
      }
    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error:'), error);
    }
  });

github
  .command('compare-schemas')
  .description('Compare GraphQL schemas across repositories')
  .requiredOption('-s, --source <repo>', 'Source repository (owner/repo)')
  .requiredOption('-t, --target <repo>', 'Target repository (owner/repo)')
  .option('--source-file <path>', 'Source schema file path', 'schema.graphql')
  .option('--target-file <path>', 'Target schema file path', 'schema.graphql')
  .action(async (options) => {
    const spinner = ora('Fetching schemas...').start();

    try {
      const { execSync } = await import('child_process');
      const { writeFileSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { join: pathJoin } = await import('path');

      // Fetch source schema
      spinner.text = `Fetching schema from ${options.source}...`;
      const sourceCmd = `gh api repos/${options.source}/contents/${options.sourceFile} --jq '.content' | base64 -d`;
      const sourceSchema = execSync(sourceCmd, { encoding: 'utf-8' });
      const sourceFile = pathJoin(tmpdir(), 'source-schema.graphql');
      writeFileSync(sourceFile, sourceSchema);

      // Fetch target schema
      spinner.text = `Fetching schema from ${options.target}...`;
      const targetCmd = `gh api repos/${options.target}/contents/${options.targetFile} --jq '.content' | base64 -d`;
      const targetSchema = execSync(targetCmd, { encoding: 'utf-8' });
      const targetFile = pathJoin(tmpdir(), 'target-schema.graphql');
      writeFileSync(targetFile, targetSchema);

      spinner.succeed('Schemas fetched successfully');

      // Run deprecation analysis
      console.log(chalk.blue('\n🔍 Analyzing schema differences...\n'));

      await runCLI(join(__dirname, 'analyze-operations.ts'), [
        '--schema-compare',
        sourceFile,
        targetFile
      ]);

    } catch (error) {
      spinner.fail('Comparison failed');
      console.error(chalk.red('Error:'), error);
    }
  });

github
  .command('list-queries <repo>')
  .description('List all GraphQL queries in a repository')
  .option('-b, --branch <branch>', 'Branch name', 'main')
  .option('-p, --pattern <pattern>', 'File pattern to search', '**/*.{js,jsx,ts,tsx}')
  .option('--download', 'Download queries locally')
  .action(async (repo, options) => {
    const spinner = ora(`Finding GraphQL queries in ${repo}...`).start();

    try {
      const { execSync } = await import('child_process');

      // Search for files containing GraphQL queries
      const searchCmd = `gh api search/code?q=gql\\\`+OR+graphql\\\`+OR+useQuery+OR+useMutation+repo:${repo}+extension:js+extension:jsx+extension:ts+extension:tsx --jq '.items[] | {path: .path, url: .html_url}'`;
      const results = execSync(searchCmd, { encoding: 'utf-8' });

      spinner.succeed('Search completed');

      if (options.download) {
        console.log(chalk.yellow('\n⬇️  Downloading queries...'));
        // Implementation for downloading and extracting queries
        console.log(chalk.green('✅ Download functionality coming soon!'));
      } else {
        console.log(chalk.cyan('\n📋 Files containing GraphQL queries:'));
        console.log(results);
      }

    } catch (error) {
      spinner.fail('Search failed');
      console.error(chalk.red('Error:'), error);
    }
  });

// 📊 MONITORING COMMANDS
const monitor = program
  .command('monitor')
  .description('📊 Monitor migration progress and health');

monitor
  .command('health')
  .description('Check migration health status')
  .option('-c, --config <path>', 'Configuration file', './migration.config.yaml')
  .option('--real-time', 'Real-time monitoring')
  .action(async (options) => {
    const args = [
      'monitor',
      ...(options.config ? ['-c', options.config] : []),
      ...(options.realTime ? ['--real-time'] : [])
    ];
    await runCLI(join(__dirname, 'unified-cli.ts'), args);
  });

// 🎯 QUICK START COMMANDS
program
  .command('quick-start')
  .description('🎯 Interactive quick start wizard for new projects')
  .action(async () => {
    console.log(chalk.blue('\n🚀 GraphQL Migration Quick Start Wizard\n'));
    console.log('Welcome! This interactive wizard will guide you through your GraphQL migration journey.\n');

    // Check current status
    const checkFile = async (path: string): Promise<boolean> => {
      try {
        const { access } = await import('fs/promises');
        await access(path);
        return true;
      } catch {
        return false;
      }
    };

    const extractedExists = await checkFile('./extracted-queries.json');
    const transformedExists = await checkFile('./transformed');
    const reportExists = await checkFile('./production-report');
    const schemaExists = await checkFile('./data/schema.graphql') || await checkFile('./schema.graphql');

    // Show current status
    console.log(chalk.cyan('📋 Current Status:'));
    console.log(`${extractedExists ? '✅' : '❌'} Queries extracted`);
    console.log(`${transformedExists ? '✅' : '❌'} Queries transformed`);
    console.log(`${reportExists ? '✅' : '❌'} Production report generated`);
    console.log(`${schemaExists ? '✅' : '❌'} GraphQL schema found`);
    console.log('');

    // Interactive flow
    let continueWizard = true;

    while (continueWizard) {
      const choices = [];

      // Add choices based on current status
      if (!schemaExists) {
        choices.push({
          name: '🔍 Help me find my GraphQL schema',
          value: 'find-schema'
        });
      }

      if (!extractedExists) {
        choices.push({
          name: '📤 Extract GraphQL queries from my codebase',
          value: 'extract'
        });
      }

      if (extractedExists && !transformedExists && schemaExists) {
        choices.push({
          name: '🔄 Transform queries (dry run first)',
          value: 'transform'
        });
      }

      if (extractedExists && schemaExists) {
        choices.push({
          name: '✅ Validate queries against schema',
          value: 'validate'
        });
      }

      if (extractedExists && transformedExists) {
        choices.push({
          name: '🚀 Run full migration (interactive)',
          value: 'migrate'
        });
      }

      if (schemaExists) {
        choices.push({
          name: '🔍 Analyze my codebase',
          value: 'analyze'
        });

        choices.push({
          name: '🏭 Run production readiness check',
          value: 'production-check'
        });
      }

      // Always available options
      choices.push({
        name: '📋 Show detailed status',
        value: 'status'
      });

      choices.push({
        name: '📚 Show available commands',
        value: 'help'
      });

      choices.push({
        name: '🚪 Exit wizard',
        value: 'exit'
      });

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices
        }
      ]);

      console.log(''); // Add spacing

      try {
        switch (action) {
          case 'find-schema':
            console.log(chalk.yellow('🔍 Looking for GraphQL schema files...'));
            console.log('\nCommon schema locations:');
            console.log('  - ./schema.graphql');
            console.log('  - ./data/schema.graphql');
            console.log('  - ./src/schema.graphql');
            console.log('  - ./graphql/schema.graphql');
            console.log('  - ./api/schema.graphql');

            const { schemaPath } = await inquirer.prompt([
              {
                type: 'input',
                name: 'schemaPath',
                message: 'Enter your GraphQL schema file path:',
                default: './schema.graphql'
              }
            ]);

            const schemaFound = await checkFile(schemaPath);
            if (schemaFound) {
              console.log(chalk.green(`✅ Found schema at ${schemaPath}`));
            } else {
              console.log(chalk.red(`❌ Schema not found at ${schemaPath}`));
              console.log('Please check the path and try again.');
            }
            break;

          case 'extract':
            console.log(chalk.blue('📤 Extracting GraphQL queries...'));
            const { sourceDir } = await inquirer.prompt([
              {
                type: 'input',
                name: 'sourceDir',
                message: 'Enter your source directory:',
                default: './src'
              }
            ]);

            await runCLI(join(__dirname, 'extract-transform.ts'), [
              'extract',
              sourceDir,
              '-o', './extracted-queries.json'
            ]);
            break;

          case 'transform':
            console.log(chalk.blue('🔄 Transforming queries...'));
            const { schemaForTransform } = await inquirer.prompt([
              {
                type: 'input',
                name: 'schemaForTransform',
                message: 'Enter your GraphQL schema path:',
                default: schemaExists ? (await checkFile('./data/schema.graphql') ? './data/schema.graphql' : './schema.graphql') : './schema.graphql'
              }
            ]);

            const { dryRun } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'dryRun',
                message: 'Run as dry-run first (recommended)?',
                default: true
              }
            ]);

            const transformArgs = [
              'transform',
              '-s', schemaForTransform,
              ...(dryRun ? ['--dry-run'] : [])
            ];

            await runCLI(join(__dirname, 'extract-transform.ts'), transformArgs);
            break;

          case 'validate':
            console.log(chalk.blue('✅ Validating queries...'));
            const schemaForValidate = schemaExists ? (await checkFile('./data/schema.graphql') ? './data/schema.graphql' : './schema.graphql') : './schema.graphql';

            await runCLI(join(__dirname, 'validate-pipeline.ts'), [
              'pipeline',
              schemaForValidate,
              '--queries', './extracted-queries.json'
            ]);
            break;

          case 'migrate':
            console.log(chalk.blue('🚀 Running full migration...'));
            const { migrateInteractive } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'migrateInteractive',
                message: 'Run in interactive mode (recommended)?',
                default: true
              }
            ]);

            const migrationArgs = [
              '--dry-run',
              ...(migrateInteractive ? ['--interactive'] : [])
            ];

            await runCLI(join(__dirname, 'migrate.ts'), migrationArgs);
            break;

          case 'analyze':
            console.log(chalk.blue('🔍 Analyzing codebase...'));
            const { analyzeSourceDir } = await inquirer.prompt([
              {
                type: 'input',
                name: 'analyzeSourceDir',
                message: 'Enter your source directory:',
                default: './src'
              }
            ]);

            const analyzeSchema = schemaExists ? (await checkFile('./data/schema.graphql') ? './data/schema.graphql' : './schema.graphql') : './schema.graphql';

            await runCLI(join(__dirname, 'analyze-operations.ts'), [
              analyzeSourceDir,
              '-s', analyzeSchema,
              '--detailed'
            ]);
            break;

          case 'production-check':
            console.log(chalk.blue('🏭 Running production readiness check...'));
            const { prodSourceDir } = await inquirer.prompt([
              {
                type: 'input',
                name: 'prodSourceDir',
                message: 'Enter your source directory:',
                default: './src'
              }
            ]);

            const prodSchema = schemaExists ? (await checkFile('./data/schema.graphql') ? './data/schema.graphql' : './schema.graphql') : './schema.graphql';

            await runCLI(join(__dirname, 'production-pipeline.ts'), [
              prodSourceDir,
              '-s', prodSchema
            ]);
            break;

          case 'status':
            console.log(chalk.blue('📋 Detailed Status Report\n'));

            // Re-check status
            const newExtractedExists = await checkFile('./extracted-queries.json');
            const newTransformedExists = await checkFile('./transformed');
            const newReportExists = await checkFile('./production-report');
            const newSchemaExists = await checkFile('./data/schema.graphql') || await checkFile('./schema.graphql');

            console.log('📁 Files:');
            console.log(`  ${newExtractedExists ? '✅' : '❌'} ./extracted-queries.json`);
            console.log(`  ${newTransformedExists ? '✅' : '❌'} ./transformed/`);
            console.log(`  ${newReportExists ? '✅' : '❌'} ./production-report/`);
            console.log(`  ${newSchemaExists ? '✅' : '❌'} GraphQL schema`);
            console.log('');

            if (!newExtractedExists) {
              console.log(chalk.yellow('🎯 Next recommended step: Extract queries'));
            } else if (!newTransformedExists) {
              console.log(chalk.yellow('🎯 Next recommended step: Transform queries'));
            } else {
              console.log(chalk.green('✅ Ready for migration!'));
            }
            break;

          case 'help':
            console.log(chalk.blue('📚 Available Commands\n'));
            console.log('You can also run these commands directly:');
            console.log('');
            console.log(chalk.cyan('Analysis:'));
            console.log('  npm run cli analyze operations ./src -s ./schema.graphql');
            console.log('');
            console.log(chalk.cyan('Extraction:'));
            console.log('  npm run cli extract queries ./src');
            console.log('');
            console.log(chalk.cyan('Transformation:'));
            console.log('  npm run cli transform queries -s ./schema.graphql --dry-run');
            console.log('');
            console.log(chalk.cyan('Validation:'));
            console.log('  npm run cli validate schema --pipeline');
            console.log('');
            console.log(chalk.cyan('Migration:'));
            console.log('  npm run cli migrate full --interactive --dry-run');
            console.log('');
            console.log(chalk.yellow('💡 Use --help with any command for more options'));
            break;

          case 'exit':
            continueWizard = false;
            console.log(chalk.green('👋 Thanks for using the GraphQL Migration Tool!'));
            console.log('You can restart this wizard anytime with: npm run cli quick-start');
            break;
        }
      } catch (error) {
        console.error(chalk.red('❌ Command failed:'), error);
        const { continueAfterError } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueAfterError',
            message: 'Continue with the wizard?',
            default: true
          }
        ]);

        if (!continueAfterError) {
          continueWizard = false;
        }
      }

      if (continueWizard) {
        console.log('\n' + '─'.repeat(50) + '\n');
      }
    }
  });

// 📋 STATUS COMMAND
program
  .command('status')
  .description('📋 Show current migration status')
  .action(async () => {
    console.log(chalk.blue('\n📋 Migration Status\n'));

    const checkFile = async (path: string): Promise<boolean> => {
      try {
        const { access } = await import('fs/promises');
        await access(path);
        return true;
      } catch {
        return false;
      }
    };

    const extractedExists = await checkFile('./extracted-queries.json');
    const transformedExists = await checkFile('./transformed');
    const reportExists = await checkFile('./production-report');

    console.log(`${extractedExists ? '✅' : '❌'} Queries extracted`);
    console.log(`${transformedExists ? '✅' : '❌'} Queries transformed`);
    console.log(`${reportExists ? '✅' : '❌'} Production report generated`);

    if (!extractedExists) {
      console.log(chalk.yellow('\nNext step: pg-cli extract queries ./src'));
    } else if (!transformedExists) {
      console.log(chalk.yellow('\nNext step: pg-cli transform queries -s ./schema.graphql'));
    } else {
      console.log(chalk.green('\n✅ Ready for migration!'));
      console.log(chalk.yellow('Run: pg-cli migrate full --interactive --dry-run'));
    }
  });

// Add help examples
program.on('--help', () => {
  console.log('\n🌟 Common Usage Examples:');
  console.log('');
  console.log('  # Quick analysis of your codebase');
  console.log('  $ pg-cli analyze operations ./src -s ./schema.graphql');
  console.log('');
  console.log('  # Extract and transform in one go');
  console.log('  $ pg-cli extract queries ./src && pg-cli transform queries -s ./schema.graphql');
  console.log('');
  console.log('  # Complete migration with safety checks');
  console.log('  $ pg-cli migrate full --interactive --validate-responses');
  console.log('');
  console.log('  # Production readiness check');
  console.log('  $ pg-cli analyze production-readiness ./src -s ./schema.graphql');
  console.log('');
  console.log('  # Check current status');
  console.log('  $ pg-cli status');
  console.log('');
  console.log('💡 Use --help with any command for detailed options');
});

program.parse();
