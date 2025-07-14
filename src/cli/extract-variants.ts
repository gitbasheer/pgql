#!/usr/bin/env node
// @ts-nocheck

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { UnifiedExtractor, ExtractionOptions } from '../core/extraction/index';
import { logger } from '../utils/logger';

const program = new Command();

program
  .name('pg-extract-variants')
  .description('Extract GraphQL queries with all variants based on conditional logic')
  .version('0.1.0')
  .argument('<directory>', 'Directory to scan')
  .option('-o, --output <dir>', 'Output directory', './extracted-variants')
  .option('-p, --pattern <patterns...>', 'File patterns to scan', ['**/*.{js,jsx,ts,tsx}'])
  .option('--save-queries', 'Save individual query files', false)
  .action(async (directory: string, options: any) => {
    const spinner = ora('Extracting GraphQL query variants...').start();
    
    try {
      // Configure for variant extraction
      const extractionOptions: ExtractionOptions = {
        directory,
        patterns: options.pattern,
        detectVariants: true,
        generateVariants: true,
        analyzeContext: true,
        reporters: options.saveQueries ? ['json', 'html', 'files'] : ['json', 'html'],
        outputDir: options.output
      };
      
      const extractor = new UnifiedExtractor(extractionOptions);
      const result = await extractor.extract();
      
      spinner.succeed(`Extraction complete`);
      
      // Display summary
      console.log(chalk.blue('\n📊 Extraction Summary:\n'));
      console.log(`  Original queries: ${result.stats.totalQueries}`);
      console.log(`  Generated variants: ${result.stats.totalVariants}`);
      console.log(`  Condition switches: ${result.switches.size}`);
      console.log(`  Queries with variants: ${result.variants.length > 0 ? new Set(result.variants.map(v => v.originalQueryId)).size : 0}`);
      
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
        summary: {
          totalOriginalQueries: result.stats.totalQueries,
          totalVariants: result.stats.totalVariants,
          totalSwitches: result.switches.size,
          queriesWithVariants: result.variants.length > 0 ? Array.from(new Set(result.variants.map(v => v.originalQueryId))) : []
        },
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
        })),
        queries: result.queries.map(q => ({
          id: q.id,
          name: q.name,
          type: q.type,
          filePath: q.filePath
        }))
      };
      
      const reportPath = path.join(options.output, 'variant-extraction-report.json');
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
      
      // Individual query files are already saved if saveQueries option was true
      if (options.saveQueries) {
        console.log(chalk.dim(`\n📁 Individual query files saved to ${options.output}/extracted-queries`));
      }
      
      // Generate comparison HTML
      const htmlReport = generateComparisonHTML(result);
      const htmlPath = path.join(options.output, 'variant-comparison.html');
      await fs.writeFile(htmlPath, htmlReport);
      
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

function generateComparisonHTML(result: any): string {
  const variantsByQuery = new Map<string, typeof result.variants>();
  for (const variant of result.variants) {
    if (!variantsByQuery.has(variant.originalQueryId)) {
      variantsByQuery.set(variant.originalQueryId, []);
    }
    variantsByQuery.get(variant.originalQueryId)!.push(variant);
  }
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GraphQL Query Variants Comparison</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }
    .switches {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .switch-item {
      background: #e3f2fd;
      padding: 15px;
      margin: 10px 0;
      border-radius: 6px;
      border-left: 4px solid #2196f3;
    }
    .query-group {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .variant-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .variant-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #dee2e6;
    }
    .variant-conditions {
      background: #e8f5e9;
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 10px;
      font-family: monospace;
      font-size: 14px;
    }
    .variant-fragments {
      background: #fff3e0;
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 10px;
    }
    .variant-content {
      background: #263238;
      color: #aed581;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      white-space: pre;
      max-height: 400px;
      overflow-y: auto;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .stat-card {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 6px;
      text-align: center;
    }
    .stat-value {
      font-size: 36px;
      font-weight: bold;
      color: #2196f3;
    }
    .stat-label {
      font-size: 14px;
      color: #666;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>GraphQL Query Variants Comparison</h1>
    <div>Generated: ${new Date().toLocaleString()}</div>
    <div>Directory: ${result.summary.directory || 'N/A'}</div>
    
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${result.summary.totalOriginalQueries}</div>
        <div class="stat-label">Original Queries</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${result.summary.totalVariants}</div>
        <div class="stat-label">Generated Variants</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${result.summary.totalSwitches}</div>
        <div class="stat-label">Condition Switches</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${result.summary.queriesWithVariants.length}</div>
        <div class="stat-label">Queries with Variants</div>
      </div>
    </div>
  </div>

  <div class="switches">
    <h2>🔀 Detected Condition Switches</h2>
    ${(() => {
      const entries = Array.from(result.switches.entries());
      return entries.map((entry: any) => {
        const [name, config] = entry;
        return `
          <div class="switch-item">
            <h3>${name}</h3>
            <div>Type: <strong>${config.type}</strong></div>
            <div>Possible Values: <code>${config.possibleValues.join(', ')}</code></div>
            <div>Used in: ${config.location} spreads</div>
          </div>
        `;
      }).join('');
    })()}
  </div>

  ${Array.from(variantsByQuery.entries()).map(([queryId, variants]) => `
    <div class="query-group">
      <h2>📄 ${queryId}</h2>
      <div>Variants: ${variants.length}</div>
      
      <div class="variant-grid">
        ${variants.map((variant: any) => `
          <div class="variant-card">
            <h3>${variant.queryName}</h3>
            
            <div class="variant-conditions">
              Conditions: ${Object.entries(variant.conditions).map(([k, v]) => `${k}=${v}`).join(', ')}
            </div>
            
            <div class="variant-fragments">
              Fragments: ${variant.usedFragments.join(', ') || 'none'}
            </div>
            
            <div class="variant-content">${escapeHtml(variant.content)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.replace(/[&<>"']/g, m => map[m]);
}

program.parse();