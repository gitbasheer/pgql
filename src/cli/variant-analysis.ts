#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { UnifiedVariantExtractor } from '../core/scanner/UnifiedVariantExtractor';
import { OperationAnalyzer } from '../core/analyzer/OperationAnalyzer';
import { logger } from '../utils/logger';

const program = new Command();

program
  .name('pg-variant-analysis')
  .description('Analyze GraphQL query variants and conditions')
  .version('0.1.0')
  .argument('<directory>', 'Directory to analyze')
  .option('-o, --output <dir>', 'Output directory for reports', './variant-analysis')
  .option('-p, --pattern <patterns...>', 'File patterns to scan', ['**/*.{js,jsx,ts,tsx}'])
  .action(async (directory: string, options: any) => {
    const spinner = ora('Analyzing GraphQL query variants...').start();
    
    try {
      // Extract with variant awareness
      const extractor = new UnifiedVariantExtractor({ enableIncrementalExtraction: true });
      const queries = await extractor.extractFromDirectory(
        directory,
        options.pattern,
        true // resolve fragments
      );
      
      spinner.succeed(`Found ${queries.length} total queries (including variants)`);
      
      // Generate variant report
      const variantReport = await extractor.generateVariantReport();
      
      // Separate original queries from variants
      const originalQueries = queries.filter(q => !(q as any).variantMetadata?.isVariant);
      const variants = queries.filter(q => (q as any).variantMetadata?.isVariant);
      
      console.log(chalk.blue('\n📊 Variant Analysis Summary:\n'));
      console.log(`  Original queries: ${originalQueries.length}`);
      console.log(`  Generated variants: ${variants.length}`);
      console.log(`  Condition variables: ${variantReport.summary.totalConditions}`);
      console.log(`  Queries with variants: ${variantReport.summary.totalQueriesWithVariants}`);
      
      if (variantReport.conditions.length > 0) {
        console.log(chalk.yellow('\n🔧 Condition Variables:\n'));
        
        for (const condition of variantReport.conditions) {
          console.log(`  ${chalk.bold(condition.variable)} (${condition.type})`);
          console.log(`    Possible values: ${condition.possibleValues.join(', ')}`);
          console.log(`    Used in ${condition.usage.length} locations:`);
          
          const usageByQuery = new Map<string, any[]>();
          for (const usage of condition.usage) {
            if (!usageByQuery.has(usage.queryId)) {
              usageByQuery.set(usage.queryId, []);
            }
            usageByQuery.get(usage.queryId)!.push(usage);
          }
          
          for (const [queryId, usages] of usageByQuery) {
            console.log(`      - ${queryId}`);
            for (const usage of usages) {
              console.log(`        ${usage.trueValue} / ${usage.falseValue}`);
            }
          }
        }
      }
      
      // Group variants by original query
      const variantsByOriginal = new Map<string, any[]>();
      for (const variant of variants) {
        const metadata = (variant as any).variantMetadata;
        if (!variantsByOriginal.has(metadata.originalQueryId)) {
          variantsByOriginal.set(metadata.originalQueryId, []);
        }
        variantsByOriginal.get(metadata.originalQueryId)!.push(variant);
      }
      
      if (variantsByOriginal.size > 0) {
        console.log(chalk.green('\n🎯 Queries with Variants:\n'));
        
        for (const [originalId, queryVariants] of variantsByOriginal) {
          const original = originalQueries.find(q => q.id === originalId);
          console.log(`  ${chalk.bold(original?.name || originalId)}`);
          console.log(`    ${queryVariants.length} variants generated:`);
          
          for (const variant of queryVariants) {
            const metadata = (variant as any).variantMetadata;
            const conditionStr = Object.entries(metadata.conditions)
              .map(([k, v]) => `${k}=${v}`)
              .join(', ');
            console.log(`      - ${conditionStr}`);
          }
        }
      }
      
      // Analyze operations including variants
      const analyzer = new OperationAnalyzer();
      const operationGroups = analyzer.analyzeOperations(queries);
      const operationReport = analyzer.generateOperationReport();
      
      // Create output directory
      await fs.mkdir(options.output, { recursive: true });
      
      // Save detailed reports
      const detailedReport = {
        timestamp: new Date().toISOString(),
        directory,
        summary: {
          totalQueries: queries.length,
          originalQueries: originalQueries.length,
          variants: variants.length,
          conditions: variantReport.summary.totalConditions,
          queriesWithVariants: variantReport.summary.totalQueriesWithVariants
        },
        conditions: variantReport.conditions,
        variantsByQuery: Array.from(variantsByOriginal.entries()).map(([id, variants]) => ({
          originalQueryId: id,
          variantCount: variants.length,
          variants: variants.map(v => ({
            id: v.id,
            name: v.name,
            conditions: (v as any).variantMetadata.conditions,
            replacements: (v as any).variantMetadata.replacements
          }))
        })),
        operationAnalysis: operationReport
      };
      
      const reportPath = path.join(options.output, 'variant-analysis.json');
      await fs.writeFile(reportPath, JSON.stringify(detailedReport, null, 2));
      
      // Save extracted queries with variants
      const queriesPath = path.join(options.output, 'queries-with-variants.json');
      await fs.writeFile(queriesPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        directory,
        totalQueries: queries.length,
        queries: queries.map(q => ({
          id: q.id,
          file: q.filePath,
          name: q.name,
          type: q.type,
          location: q.location,
          content: q.content,
          variantMetadata: (q as any).variantMetadata
        }))
      }, null, 2));
      
      // Generate HTML visualization
      const htmlReport = generateHTMLReport(detailedReport);
      const htmlPath = path.join(options.output, 'variant-analysis.html');
      await fs.writeFile(htmlPath, htmlReport);
      
      console.log(chalk.green(`\n✅ Analysis complete!`));
      console.log(chalk.dim(`Reports saved to ${options.output}`));
      
      // Show recommendations
      if (variantReport.summary.totalConditions > 0) {
        console.log(chalk.yellow('\n💡 Recommendations:\n'));
        console.log('  1. Consider creating TypeScript types for each variant');
        console.log('  2. Document which conditions control which features');
        console.log('  3. Test all variant combinations in your migration');
        console.log('  4. Consider consolidating similar variants if possible');
      }
      
    } catch (error) {
      spinner.fail('Analysis failed');
      logger.error('Error:', error);
      process.exit(1);
    }
  });

function generateHTMLReport(report: any): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GraphQL Variant Analysis Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
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
    h1 {
      margin: 0 0 20px 0;
      color: #1a1a1a;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .metric-card {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 6px;
      text-align: center;
    }
    .metric-value {
      font-size: 36px;
      font-weight: bold;
      color: #2563eb;
    }
    .metric-label {
      font-size: 14px;
      color: #666;
      margin-top: 5px;
    }
    .section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .condition-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 6px;
      margin: 10px 0;
      border-left: 4px solid #2563eb;
    }
    .condition-name {
      font-weight: bold;
      font-size: 18px;
      color: #1a1a1a;
    }
    .condition-usage {
      margin-top: 10px;
      font-size: 14px;
    }
    .variant-group {
      margin: 20px 0;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 6px;
    }
    .variant-list {
      margin-top: 10px;
      padding-left: 20px;
    }
    .variant-item {
      margin: 5px 0;
      font-family: monospace;
      font-size: 14px;
      color: #059669;
    }
    code {
      background: #e5e7eb;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>GraphQL Variant Analysis Report</h1>
    <div>Generated: ${new Date(report.timestamp).toLocaleString()}</div>
    <div>Directory: ${report.directory}</div>
  </div>

  <div class="summary-grid">
    <div class="metric-card">
      <div class="metric-value">${report.summary.totalQueries}</div>
      <div class="metric-label">Total Queries</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${report.summary.originalQueries}</div>
      <div class="metric-label">Original Queries</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${report.summary.variants}</div>
      <div class="metric-label">Generated Variants</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${report.summary.conditions}</div>
      <div class="metric-label">Condition Variables</div>
    </div>
  </div>

  <div class="section">
    <h2>🔧 Condition Variables</h2>
    ${report.conditions.map((condition: any) => `
      <div class="condition-card">
        <div class="condition-name">${condition.variable}</div>
        <div>Type: <code>${condition.type}</code></div>
        <div>Values: ${condition.possibleValues.map((v: any) => `<code>${v}</code>`).join(', ')}</div>
        <div class="condition-usage">
          <strong>Used in ${condition.usage.length} locations:</strong>
          <ul>
            ${condition.usage.map((u: any) => `
              <li>${u.queryId}: <code>${u.trueValue}</code> / <code>${u.falseValue}</code></li>
            `).join('')}
          </ul>
        </div>
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h2>🎯 Queries with Variants</h2>
    ${report.variantsByQuery.map((group: any) => `
      <div class="variant-group">
        <h3>${group.originalQueryId}</h3>
        <div>${group.variantCount} variants generated</div>
        <div class="variant-list">
          ${group.variants.map((v: any) => `
            <div class="variant-item">
              ${Object.entries(v.conditions).map(([k, val]) => `${k}=${val}`).join(', ')}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h2>📊 Operation Analysis</h2>
    <div>Total Operations: ${report.operationAnalysis.totalOperations}</div>
    <div>Unique Operations: ${report.operationAnalysis.uniqueOperations}</div>
    <div>Unnamed Operations: ${report.operationAnalysis.unnamedOperations}</div>
    
    <h3>Fragment Usage</h3>
    <ul>
      ${report.operationAnalysis.fragmentUsage.map((f: any) => `
        <li><code>${f.fragment}</code>: Used in ${f.usageCount} operations</li>
      `).join('')}
    </ul>
  </div>
</body>
</html>`;
}

program.parse();