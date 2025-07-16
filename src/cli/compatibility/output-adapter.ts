/**
 * Output Format Adapter for CLI Backward Compatibility
 * Ensures stable output formats across versions
 */

import { logger } from '../../utils/logger.js';

export interface OutputOptions {
  outputVersion?: string;
  legacyFormat?: boolean;
  format?: 'json' | 'typescript' | 'html' | 'markdown' | 'junit';
  json?: boolean; // Pure JSON to stdout
  quiet?: boolean; // No progress indicators
}

export class OutputAdapter {
  private version: string;
  private options: OutputOptions;

  constructor(options: OutputOptions = {}) {
    this.options = options;
    this.version = options.outputVersion || process.env.PG_CLI_OUTPUT_VERSION || '1.0';

    if (options.legacyFormat) {
      this.version = '0.9'; // Pre-1.0 format
    }
  }

  /**
   * Adapt extraction output to requested version
   */
  adaptExtractionOutput(data: any): any {
    switch (this.version) {
      case '0.9':
        // Legacy format (pre-1.0)
        return {
          queries: data.queries || data.operations,
          total: data.totalQueries || data.totalOperations,
          fragments: data.fragments || [],
          timestamp: data.timestamp,
        };

      case '1.0':
      default:
        // Current stable format
        return {
          timestamp: data.timestamp,
          directory: data.directory,
          totalQueries: data.totalQueries || data.operations?.length || 0,
          queries: data.queries || data.operations || [],
          fragments: data.fragments || [],
          variants: data.variants || [],
          errors: data.errors || [],
          stats: data.stats || {
            totalFiles: 0,
            totalQueries: data.totalQueries || 0,
            totalFragments: data.fragments?.length || 0,
            totalVariants: data.variants?.length || 0,
            extractionTime: data.extractionTime || 0,
          },
        };

      case '2.0':
        // Future format (not yet released)
        logger.warn('Output version 2.0 is experimental');
        return {
          version: '2.0',
          metadata: {
            timestamp: data.timestamp,
            directory: data.directory,
            tool: 'pg-cli',
            version: process.env.npm_package_version,
          },
          operations: data.queries || data.operations || [],
          fragments: data.fragments || [],
          variants: data.variants || [],
          diagnostics: {
            errors: data.errors || [],
            warnings: data.warnings || [],
          },
          statistics: data.stats || {},
        };
    }
  }

  /**
   * Adapt transformation output to requested version
   */
  adaptTransformationOutput(data: any): any {
    switch (this.version) {
      case '0.9':
        // Legacy format
        return {
          transformed: data.transformations?.length || 0,
          changes: data.transformations || [],
          timestamp: data.timestamp,
        };

      case '1.0':
      default:
        // Current stable format
        return {
          timestamp: data.timestamp,
          totalTransformed: data.totalTransformed || data.transformations?.length || 0,
          transformations: data.transformations || [],
          summary: data.summary || {
            total: data.totalTransformed || 0,
            transformed: data.transformations?.filter((t: any) => t.changes.length > 0).length || 0,
            skipped: 0,
            failed: 0,
          },
        };
    }
  }

  /**
   * Adapt validation output to requested version and format
   */
  adaptValidationOutput(data: any): any {
    // Handle format-specific outputs
    if (this.options.format && this.options.format !== 'json') {
      return this.formatValidationOutput(data, this.options.format);
    }

    // JSON output versioning
    switch (this.version) {
      case '0.9':
        // Legacy format
        return {
          valid: data.results?.valid || 0,
          invalid: data.results?.invalid || 0,
          queries: data.queries || [],
          timestamp: data.timestamp,
        };

      case '1.0':
      default:
        // Current stable format
        return data;
    }
  }

  /**
   * Format validation output for different formats
   */
  private formatValidationOutput(data: any, format: string): string {
    switch (format) {
      case 'junit':
        return this.toJUnitFormat(data);

      case 'markdown':
        return this.toMarkdownFormat(data);

      case 'html':
        return this.toHTMLFormat(data);

      default:
        return JSON.stringify(data, null, 2);
    }
  }

  /**
   * Convert to JUnit XML format
   */
  private toJUnitFormat(data: any): string {
    const results = data.results || {};
    const queries = data.queries || [];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<testsuites name="GraphQL Validation" tests="${results.total}" failures="${results.invalid}">\n`;
    xml += `  <testsuite name="Query Validation" tests="${results.total}" failures="${results.invalid}">\n`;

    for (const query of queries) {
      xml += `    <testcase name="${query.id}" classname="graphql.queries">\n`;
      if (!query.valid) {
        for (const error of query.errors || []) {
          xml += `      <failure message="${this.escapeXML(error.message)}">\n`;
          xml += `        ${this.escapeXML(JSON.stringify(error, null, 2))}\n`;
          xml += `      </failure>\n`;
        }
      }
      xml += `    </testcase>\n`;
    }

    xml += `  </testsuite>\n`;
    xml += `</testsuites>\n`;

    return xml;
  }

  /**
   * Convert to Markdown format
   */
  private toMarkdownFormat(data: any): string {
    const results = data.results || {};
    let md = '# GraphQL Validation Report\n\n';

    md += `## Summary\n\n`;
    md += `- **Total Queries**: ${results.total}\n`;
    md += `- **Valid**: ${results.valid}\n`;
    md += `- **Invalid**: ${results.invalid}\n`;
    md += `- **Warnings**: ${results.warnings}\n\n`;

    if (results.invalid > 0) {
      md += `## Errors\n\n`;
      for (const query of data.queries || []) {
        if (!query.valid) {
          md += `### ${query.id}\n\n`;
          md += `File: \`${query.file}\`\n\n`;
          for (const error of query.errors || []) {
            md += `- ❌ ${error.message}\n`;
            if (error.extensions?.suggestion) {
              md += `  - 💡 ${error.extensions.suggestion}\n`;
            }
          }
          md += '\n';
        }
      }
    }

    return md;
  }

  /**
   * Convert to HTML format
   */
  private toHTMLFormat(data: any): string {
    const results = data.results || {};
    let html = `<!DOCTYPE html>
<html>
<head>
  <title>GraphQL Validation Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .summary { background: #f0f0f0; padding: 10px; margin-bottom: 20px; }
    .error { color: red; }
    .warning { color: orange; }
    .success { color: green; }
  </style>
</head>
<body>
  <h1>GraphQL Validation Report</h1>
  <div class="summary">
    <h2>Summary</h2>
    <p>Total: ${results.total} | Valid: <span class="success">${results.valid}</span> | Invalid: <span class="error">${results.invalid}</span></p>
  </div>
`;

    if (results.invalid > 0) {
      html += '<h2>Errors</h2>\n';
      for (const query of data.queries || []) {
        if (!query.valid) {
          html += `<div class="query-error">
            <h3>${query.id}</h3>
            <p>File: <code>${query.file}</code></p>
            <ul>`;

          for (const error of query.errors || []) {
            html += `<li class="error">${this.escapeHTML(error.message)}</li>`;
          }

          html += '</ul></div>';
        }
      }
    }

    html += '</body></html>';
    return html;
  }

  /**
   * Helper to escape XML special characters
   */
  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Helper to escape HTML special characters
   */
  private escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Write output to appropriate destination
   */
  async writeOutput(data: any, outputPath?: string): Promise<void> {
    const shouldOutputJSON = this.options.json || process.env.PG_CLI_JSON_STDOUT === '1';

    if (shouldOutputJSON && !outputPath) {
      // Output to stdout as pure JSON
      console.log(JSON.stringify(data, null, 2));
    } else if (outputPath) {
      // Write to file
      const fs = await import('fs/promises');
      await fs.writeFile(outputPath, JSON.stringify(data, null, 2));

      if (!this.options.quiet) {
        logger.info(`Output written to ${outputPath}`);
      }
    }
  }
}

/**
 * Create output adapter from CLI options
 */
export function createOutputAdapter(options: any): OutputAdapter {
  return new OutputAdapter({
    outputVersion: options.outputVersion,
    legacyFormat: options.legacyFormat,
    format: options.format,
    json: options.json,
    quiet: options.quiet || process.env.PG_CLI_NO_PROGRESS === '1',
  });
}
