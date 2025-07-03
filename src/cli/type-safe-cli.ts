#!/usr/bin/env node

import { Command } from 'commander';
import { z } from 'zod';
import chalk from 'chalk';
import ora from 'ora';
import { match } from 'ts-pattern';
import { GraphQLExtractor } from '../core/scanner/GraphQLExtractor';
import { SchemaAnalyzer } from '../core/analyzer/SchemaAnalyzer';
import { TypeSafeTransformer } from '../core/transformer/TypeSafeTransformer';
import { loadConfig } from '../core/config/ConfigValidator';
import { buildSchema } from 'graphql';
import * as fs from 'fs/promises';

// Type-safe CLI arguments
const ScanOptionsSchema = z.object({
  apps: z.string(),
  schema: z.string(),
  output: z.string().optional(),
  format: z.enum(['json', 'csv', 'html']).default('json'),
  verbose: z.boolean().default(false)
});

type ScanOptions = z.infer<typeof ScanOptionsSchema>;

// Type-safe command builder
function createCLI(): Command {
  const program = new Command();

  program
    .name('graphql-migrate')
    .version('1.0.0')
    .description('Type-safe GraphQL migration tool');

  program
    .command('scan')
    .description('Scan for GraphQL queries')
    .requiredOption('--apps <path>', 'Path to applications')
    .requiredOption('--schema <path>', 'Path to GraphQL schema')
    .option('--output <path>', 'Output directory')
    .option('--format <type>', 'Output format', 'json')
    .option('--verbose', 'Verbose output')
    .action(async (options: unknown) => {
      // Validate options at runtime
      const validatedOptions = ScanOptionsSchema.parse(options);
      await scanCommand(validatedOptions);
    });

  program
    .command('analyze')
    .description('Analyze GraphQL schema for deprecations')
    .requiredOption('--schema <path>', 'Path to GraphQL schema')
    .option('--output <path>', 'Output file for analysis')
    .action(async (options: any) => {
      await analyzeCommand(options);
    });

  program
    .command('transform')
    .description('Transform queries based on analysis')
    .requiredOption('--input <path>', 'Input queries file')
    .requiredOption('--schema <path>', 'GraphQL schema')
    .option('--output <path>', 'Output directory')
    .option('--dry-run', 'Preview without applying')
    .action(async (options: any) => {
      await transformCommand(options);
    });

  return program;
}

async function scanCommand(options: ScanOptions): Promise<void> {
  const spinner = ora('Scanning for GraphQL queries...').start();
  
  try {
    const extractor = new GraphQLExtractor();
    const results = await extractor.extractFromDirectory(options.apps);

    // Type-safe output handling
    match(options.format)
      .with('json', () => outputJSON(results, options.output))
      .with('csv', () => outputCSV(results, options.output))
      .with('html', () => outputHTML(results, options.output))
      .exhaustive();  // TypeScript ensures all cases handled

    spinner.succeed(`Found ${results.length} queries`);
  } catch (error) {
    spinner.fail('Scan failed');
    console.error(error);
    process.exit(1);
  }
}

async function analyzeCommand(options: any): Promise<void> {
  const spinner = ora('Analyzing schema...').start();
  
  try {
    const schemaContent = await fs.readFile(options.schema, 'utf-8');
    const schema = buildSchema(schemaContent);
    
    const analyzer = new SchemaAnalyzer(schema);
    const deprecatedFields = analyzer.findDeprecatedFields();
    const rules = analyzer.generateMigrationRules();

    const output = {
      deprecatedFields: Array.from(deprecatedFields.entries()),
      migrationRules: rules,
      summary: {
        totalDeprecations: Array.from(deprecatedFields.values()).flat().length,
        typesAffected: deprecatedFields.size
      }
    };

    if (options.output) {
      await fs.writeFile(options.output, JSON.stringify(output, null, 2));
    }

    spinner.succeed(`Found ${output.summary.totalDeprecations} deprecations`);
  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(error);
    process.exit(1);
  }
}

async function transformCommand(options: any): Promise<void> {
  const spinner = ora('Transforming queries...').start();
  
  try {
    const schemaContent = await fs.readFile(options.schema, 'utf-8');
    const schema = buildSchema(schemaContent);
    
    const analyzer = new SchemaAnalyzer(schema);
    const rules = analyzer.generateMigrationRules();
    
    const transformer = new TypeSafeTransformer(schema, rules);
    
    // Load queries
    const queriesData = JSON.parse(await fs.readFile(options.input, 'utf-8'));
    
    let successCount = 0;
    let errorCount = 0;

    for (const query of queriesData.queries || queriesData) {
      const result = transformer.transform(query.content || query, {
        file: query.file || 'unknown',
        schema,
        options: {
          preserveAliases: true,
          addTypeAnnotations: false,
          generateTests: false
        }
      });

      if (result.isOk()) {
        successCount++;
        
        if (!options.dryRun && options.output) {
          // Save transformed query
          const outputPath = `${options.output}/${query.id}.transformed.graphql`;
          await fs.writeFile(outputPath, result.value.transformedCode);
        }
      } else {
        errorCount++;
        console.error(chalk.red(`Failed to transform ${query.id}:`), result.error);
      }
    }

    spinner.succeed(`Transformed ${successCount} queries (${errorCount} errors)`);
  } catch (error) {
    spinner.fail('Transform failed');
    console.error(error);
    process.exit(1);
  }
}

// Output functions with type safety
async function outputJSON(data: any, outputPath?: string): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  
  if (outputPath) {
    await fs.writeFile(outputPath, json);
  } else {
    console.log(json);
  }
}

async function outputCSV(data: any, outputPath?: string): Promise<void> {
  // Convert to CSV format
  const csv = 'id,file,type,name\n' + 
    data.map((q: any) => `${q.id},${q.filePath},${q.type},${q.name || ''}`).join('\n');
  
  if (outputPath) {
    await fs.writeFile(outputPath, csv);
  } else {
    console.log(csv);
  }
}

async function outputHTML(data: any, outputPath?: string): Promise<void> {
  // Generate HTML report
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>GraphQL Migration Report</title>
      <style>
        body { font-family: Arial, sans-serif; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <h1>GraphQL Migration Report</h1>
      <table>
        <tr>
          <th>ID</th>
          <th>File</th>
          <th>Type</th>
          <th>Name</th>
        </tr>
        ${data.map((q: any) => `
          <tr>
            <td>${q.id}</td>
            <td>${q.filePath}</td>
            <td>${q.type}</td>
            <td>${q.name || '-'}</td>
          </tr>
        `).join('')}
      </table>
    </body>
    </html>
  `;
  
  if (outputPath) {
    await fs.writeFile(outputPath, html);
  } else {
    console.log(html);
  }
}

// Run CLI
const cli = createCLI();
cli.parse(process.argv);