#!/usr/bin/env node
// @ts-nocheck

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { logger } from '../utils/logger.js';
import { QueryPattern } from '../core/extraction/types/pattern.types.js';

interface ConversionOptions {
  input: string;
  output: string;
  format?: 'json' | 'typescript';
  dryRun?: boolean;
}

interface PatternRegistry {
  patterns: QueryPattern[];
  metadata: {
    convertedFrom: string;
    convertedAt: string;
    totalPatterns: number;
  };
}

export class QueryNamesConverter {
  async convertQueryNamesToPatterns(options: ConversionOptions): Promise<PatternRegistry> {
    logger.info(`Converting queryNames.js from ${options.input}`);

    // Read and parse the queryNames.js file
    const content = await fs.readFile(options.input, 'utf-8');
    const queryNames = await this.extractQueryNamesFromFile(content);

    // Convert to pattern registry format
    const patterns: QueryPattern[] = Object.entries(queryNames).map(([key, value]) => ({
      pattern: `\${queryNames.${key}}`,
      template: `query \${queryNames.${key}}`,
      name: value as string,
      version: this.detectVersion(value as string),
      deprecated: false,
      replacement: this.suggestReplacement(value as string),
      conditions: [],
      fragments: [],
      metadata: {
        sourceKey: key,
        convertedFrom: 'queryNames.js',
      },
    }));

    const registry: PatternRegistry = {
      patterns,
      metadata: {
        convertedFrom: options.input,
        convertedAt: new Date().toISOString(),
        totalPatterns: patterns.length,
      },
    };

    if (!options.dryRun) {
      await this.writePatternRegistry(registry, options);
    }

    logger.info(`✅ Converted ${patterns.length} patterns from ${options.input}`);
    return registry;
  }

  private async extractQueryNamesFromFile(content: string): Promise<Record<string, string>> {
    const queryNames: Record<string, string> = {};

    try {
      const ast = parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });

      traverse(ast, {
        ObjectExpression: (path: any) => {
          const parent = path.parent;
          if (
            (parent.type === 'VariableDeclarator' && parent.id.name === 'queryNames') ||
            parent.type === 'ExportDefaultDeclaration' ||
            parent.type === 'ExportNamedDeclaration'
          ) {
            path.node.properties.forEach((prop: any) => {
              if (prop.type === 'ObjectProperty') {
                const key = prop.key.name || prop.key.value;
                const value = prop.value.value;
                if (key && value) {
                  queryNames[key] = value;
                }
              }
            });
          }
        },
      });
    } catch (error) {
      logger.error(`Failed to parse queryNames file: ${error}`);
      throw error;
    }

    return queryNames;
  }

  private detectVersion(queryName: string): string {
    // Smart version detection based on common patterns
    if (queryName.includes('V3') || queryName.includes('v3')) return 'V3';
    if (queryName.includes('V2') || queryName.includes('v2')) return 'V2';
    if (queryName.includes('V1') || queryName.includes('v1')) return 'V1';
    if (queryName.includes('Latest') || queryName.includes('latest')) return 'V3';

    // Fallback: assume V1 for legacy queries
    return 'V1';
  }

  private suggestReplacement(queryName: string): string | undefined {
    // Suggest replacements for known deprecated patterns
    if (queryName.includes('byId') && !queryName.includes('V2') && !queryName.includes('V3')) {
      return queryName.replace('byId', 'byIdV2');
    }
    if (queryName.includes('getUser') && !queryName.includes('V2')) {
      return queryName.replace('getUser', 'getUserV2');
    }

    return undefined;
  }

  private async writePatternRegistry(
    registry: PatternRegistry,
    options: ConversionOptions,
  ): Promise<void> {
    const outputPath = options.output;

    if (options.format === 'typescript') {
      const tsContent = this.generateTypeScriptRegistry(registry);
      await fs.writeFile(outputPath.replace('.json', '.js'), tsContent, 'utf-8');
    } else {
      await fs.writeFile(outputPath, JSON.stringify(registry, null, 2), 'utf-8');
    }

    logger.info(`✅ Pattern registry written to ${outputPath}`);
  }

  private generateTypeScriptRegistry(registry: PatternRegistry): string {
    return `// Auto-generated pattern registry from queryNames.js
// Generated at: ${registry.metadata.convertedAt}

import { QueryPattern } from '../core/extraction/types/pattern.types.js';

export const queryPatternRegistry: QueryPattern[] = ${JSON.stringify(registry.patterns, null, 2)};

export const registryMetadata = ${JSON.stringify(registry.metadata, null, 2)};
`;
  }
}

// CLI Setup
const program = new Command();

program
  .name('convert-querynames')
  .description('Convert queryNames.js files to pattern registry format')
  .version('1.0.0');

program
  .option('-i, --input <path>', 'Path to queryNames.js file')
  .option('-o, --output <path>', 'Output path for pattern registry', './pattern-registry.json')
  .option('-f, --format <type>', 'Output format: json or typescript', 'json')
  .option('--dry-run', 'Preview conversion without writing files')
  .action(async (options) => {
    try {
      if (!options.input) {
        logger.error('❌ Input file is required. Use -i or --input to specify queryNames.js path');
        process.exit(1);
      }

      const converter = new QueryNamesConverter();
      const registry = await converter.convertQueryNamesToPatterns(options);

      if (options.dryRun) {
        console.log('\n📋 Preview of converted patterns:');
        console.log(JSON.stringify(registry, null, 2));
        console.log(`\n📊 Would convert ${registry.patterns.length} patterns`);
      } else {
        console.log('\n✅ Conversion complete!');
        console.log(`📁 Output: ${options.output}`);
        console.log(`📊 Converted: ${registry.patterns.length} patterns`);

        // Suggest next steps
        console.log('\n🎯 Next steps:');
        console.log('1. Review the generated pattern registry');
        console.log('2. Run migration validation: npm run cli validate-migration');
        console.log('3. Test the new pattern-based system: npm run cli pattern-migrate --demo');
      }
    } catch (error) {
      logger.error('❌ Conversion failed:', error);
      process.exit(1);
    }
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export default program;
