import * as fs from 'fs/promises';
import * as path from 'path';
import { ExtractionResult } from '../types/index.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';
import { logger } from '../../../utils/logger.js';
import { validateWritePath } from '../../../utils/securePath.js';

export class HTMLReporter {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async generate(result: ExtractionResult): Promise<void> {
    // SECURITY FIX: Validate output path to prevent traversal
    const outputDir = this.context.options.outputDir || '.';
    const outputPath = validateWritePath(outputDir, 'extraction-report.html');
    
    if (!outputPath) {
      throw new Error(`Invalid output path for HTML report: ${outputDir}`);
    }
    
    const html = this.generateHTML(result);
    
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html);
    
    logger.info(`HTML report written to ${outputPath}`);
  }

  private escapeHtml(str: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, char => htmlEscapes[char]);
  }

  private generateHTML(result: ExtractionResult): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GraphQL Extraction Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 2px solid #e1e4e8;
            padding-bottom: 10px;
        }
        h2 {
            color: #586069;
            margin-top: 30px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background: #f6f8fa;
            padding: 15px;
            border-radius: 6px;
            text-align: center;
        }
        .stat-value {
            font-size: 36px;
            font-weight: bold;
            color: #0366d6;
        }
        .stat-label {
            color: #586069;
            font-size: 14px;
            margin-top: 5px;
        }
        .query-list {
            margin: 20px 0;
        }
        .query-item {
            background: #f6f8fa;
            padding: 15px;
            margin: 10px 0;
            border-radius: 6px;
            border-left: 4px solid #0366d6;
        }
        .query-name {
            font-weight: bold;
            color: #0366d6;
        }
        .query-meta {
            color: #586069;
            font-size: 14px;
            margin-top: 5px;
        }
        .error-list {
            background: #fff5f5;
            border: 1px solid #ffdddd;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
        }
        .error-item {
            color: #d73a49;
            margin: 5px 0;
        }
        pre {
            background: #f6f8fa;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
        }
        .variant-badge {
            display: inline-block;
            background: #28a745;
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            margin-left: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>GraphQL Extraction Report</h1>
        
        <h2>Summary Statistics</h2>
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${result.stats.totalQueries}</div>
                <div class="stat-label">Total Queries</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${result.stats.totalVariants}</div>
                <div class="stat-label">Total Variants</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${result.stats.totalFragments}</div>
                <div class="stat-label">Total Fragments</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${result.stats.totalErrors}</div>
                <div class="stat-label">Total Errors</div>
            </div>
        </div>
        
        <h2>Extracted Queries</h2>
        <div class="query-list">
            ${result.queries.map(q => `
                <div class="query-item">
                    <div class="query-name">
                        ${this.escapeHtml(q.name || 'Unnamed Query')}
                        ${q.originalName ? `<small>(was: ${this.escapeHtml(q.originalName)})</small>` : ''}
                        ${this.hasVariants(q.id, result) ? '<span class="variant-badge">Has Variants</span>' : ''}
                    </div>
                    <div class="query-meta">
                        Type: ${this.escapeHtml(q.type)} | File: ${this.escapeHtml(q.filePath)} | Line: ${q.location.line}
                    </div>
                </div>
            `).join('')}
        </div>
        
        ${result.variants.length > 0 ? `
            <h2>Query Variants</h2>
            <div class="query-list">
                ${result.variants.map(v => `
                    <div class="query-item">
                        <div class="query-name">${v.queryName} - Variant</div>
                        <div class="query-meta">
                            Conditions: ${v.conditions.description || JSON.stringify(v.conditions.switches)}
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
        
        ${result.errors.length > 0 ? `
            <h2>Errors</h2>
            <div class="error-list">
                ${result.errors.map(e => `
                    <div class="error-item">
                        ${e.file}:${e.line || '?'} - ${e.message}
                    </div>
                `).join('')}
            </div>
        ` : ''}
        
        <h2>Extraction Details</h2>
        <pre>${JSON.stringify({
            directory: this.context.options.directory,
            patterns: this.context.options.patterns,
            strategy: result.stats.strategy,
            duration: `${result.stats.duration}ms`
        }, null, 2)}</pre>
    </div>
</body>
</html>`;
  }

  private hasVariants(queryId: string, result: ExtractionResult): boolean {
    return result.variants.some(v => v.originalQueryId === queryId);
  }
}