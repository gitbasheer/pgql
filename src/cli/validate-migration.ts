#!/usr/bin/env node

// @ts-nocheck
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { ExtractedQuery } from '../core/extraction/types';
import { PatternExtractedQuery } from '../core/extraction/types/pattern.types';

interface ValidationOptions {
  before: string;
  after: string;
  output?: string;
  strictMode?: boolean;
  ignoreWhitespace?: boolean;
}

interface ValidationReport {
  status: 'passed' | 'failed' | 'warning';
  summary: {
    totalQueries: number;
    matchedQueries: number;
    missingQueries: number;
    extraQueries: number;
    modifiedQueries: number;
  };
  issues: ValidationIssue[];
  performance: {
    validationTime: number;
    queriesPerSecond: number;
  };
}

interface ValidationIssue {
  type: 'missing' | 'extra' | 'modified' | 'structural' | 'naming';
  severity: 'error' | 'warning' | 'info';
  queryId: string;
  message: string;
  details?: {
    before?: any;
    after?: any;
    diff?: string;
  };
}

export class MigrationValidator {
  async validateMigration(options: ValidationOptions): Promise<ValidationReport> {
    const startTime = Date.now();

    logger.info('🔍 Starting migration validation...');
    logger.info(`Before: ${options.before}`);
    logger.info(`After: ${options.after}`);

    // Load query data - handle both file paths and direct arrays
    const beforeQueries = Array.isArray(options.before) 
      ? options.before 
      : await this.loadQueries(options.before);
    const afterQueries = Array.isArray(options.after) 
      ? options.after 
      : await this.loadQueries(options.after);

    // Perform validation
    const issues: ValidationIssue[] = [];
    const summary = {
      totalQueries: beforeQueries.length,
      matchedQueries: 0,
      missingQueries: 0,
      extraQueries: 0,
      modifiedQueries: 0
    };

    // Create lookup maps
    const beforeMap = new Map(beforeQueries.map(q => [this.getQueryKey(q), q]));
    const afterMap = new Map(afterQueries.map(q => [this.getQueryKey(q), q]));

    // Check for missing queries
    for (const [key, beforeQuery] of beforeMap) {
      const afterQuery = afterMap.get(key);

      if (!afterQuery) {
        issues.push({
          type: 'missing',
          severity: 'error',
          queryId: beforeQuery.id,
          message: `Query missing after migration: ${beforeQuery.name || beforeQuery.id}`,
          details: { before: beforeQuery }
        });
        summary.missingQueries++;
      } else {
        // Query exists, check for modifications
        summary.matchedQueries++; // Count as matched since it exists in both
        const modifications = await this.compareQueries(beforeQuery, afterQuery, options);
        if (modifications.length > 0) {
          issues.push(...modifications);
          summary.modifiedQueries++;
        }
      }
    }

    // Check for extra queries
    for (const [key, afterQuery] of afterMap) {
      if (!beforeMap.has(key)) {
        issues.push({
          type: 'extra',
          severity: 'warning',
          queryId: afterQuery.id,
          message: `New query found after migration: ${afterQuery.name || afterQuery.id}`,
          details: { after: afterQuery }
        });
        summary.extraQueries++;
      }
    }

    // Determine overall status
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    let status: 'passed' | 'failed' | 'warning';
    if (errorCount > 0) {
      status = 'failed';
    } else if (warningCount > 0) {
      status = 'warning';
    } else {
      status = 'passed';
    }

    const endTime = Date.now();
    const validationTime = endTime - startTime;

    const report: ValidationReport = {
      status,
      summary,
      issues,
      performance: {
        validationTime,
        queriesPerSecond: Math.round((beforeQueries.length / validationTime) * 1000)
      }
    };

    // Output report
    await this.outputReport(report, options);

    return report;
  }

  private async loadQueries(filePath: string): Promise<ExtractedQuery[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (!content || content.trim() === '') {
        throw new Error(`File is empty or undefined: ${filePath}`);
      }
      const data = JSON.parse(content);

      // Handle different formats
      if (Array.isArray(data)) {
        return data;
      } else if (data.queries) {
        return data.queries;
      } else if (data.extractedQueries) {
        return data.extractedQueries;
      } else {
        throw new Error('Unknown query file format');
      }
    } catch (error) {
      logger.error(`Failed to load queries from ${filePath}:`, error);
      throw error;
    }
  }

  private getQueryKey(query: ExtractedQuery): string {
    // Use content fingerprint if available (pattern-based queries)
    if ('contentFingerprint' in query && query.contentFingerprint) {
      return query.contentFingerprint;
    }

    // For migration validation, use query name and file path for matching
    // This allows us to track the same logical query even if content changes
    const filePath = query.filePath || query.sourceFile || '';
    const queryName = query.name || 'unnamed';
    
    // Use file path + name as key to identify the same query across migrations
    return `${filePath}:${queryName}`;
  }

  private normalizeQueryContent(content: string): string {
    return content
      .replace(/\s+/g, ' ')
      .replace(/\$\{[^}]+\}/g, '${...}')
      .trim();
  }

  private async compareQueries(
    before: ExtractedQuery,
    after: ExtractedQuery,
    options: ValidationOptions
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Compare names
    if (before.name !== after.name) {
      const severity = options.strictMode ? 'error' : 'warning';
      issues.push({
        type: 'naming',
        severity,
        queryId: before.id,
        message: `Query name changed: "${before.name}" → "${after.name}"`,
        details: {
          before: before.name,
          after: after.name
        }
      });
    }

    // Compare content
    const beforeContent = this.normalizeQueryContent(before.source || before.content || '');
    const afterContent = this.normalizeQueryContent(after.source || after.content || '');

    if (beforeContent !== afterContent) {
      const severity = options.strictMode ? 'error' : 'warning';
      issues.push({
        type: 'structural',
        severity,
        queryId: before.id,
        message: `Query structure changed`,
        details: {
          before: beforeContent,
          after: afterContent,
          diff: this.generateDiff(beforeContent, afterContent)
        }
      });
    }

    // Compare types
    if (before.type !== after.type) {
      issues.push({
        type: 'structural',
        severity: 'error',
        queryId: before.id,
        message: `Query type changed: ${before.type} → ${after.type}`,
        details: {
          before: before.type,
          after: after.type
        }
      });
    }

    // Check pattern-specific fields
    if (this.isPatternQuery(after)) {
      await this.validatePatternSpecificFields(before, after as PatternExtractedQuery, issues);
    }

    return issues;
  }

  private isPatternQuery(query: ExtractedQuery): query is PatternExtractedQuery {
    return 'namePattern' in query || 'contentFingerprint' in query;
  }

  private async validatePatternSpecificFields(
    before: ExtractedQuery,
    after: PatternExtractedQuery,
    issues: ValidationIssue[]
  ): Promise<void> {
    // Validate pattern metadata
    if (after.patternMetadata) {
      const { isDynamic, hasInterpolation } = after.patternMetadata;

      const beforeHasInterpolation = (before.source || before.content || '').includes('${');
      if (hasInterpolation !== beforeHasInterpolation) {
        issues.push({
          type: 'structural',
          severity: 'warning',
          queryId: before.id,
          message: `Interpolation detection mismatch: expected ${beforeHasInterpolation}, got ${hasInterpolation}`,
          details: {
            before: beforeHasInterpolation,
            after: hasInterpolation
          }
        });
      }
    }

    // Validate pattern preservation
    if (after.namePattern && !after.namePattern.includes('${')) {
      issues.push({
        type: 'naming',
        severity: 'info',
        queryId: before.id,
        message: `Query converted to static pattern: ${after.namePattern}`,
        details: {
          pattern: after.namePattern
        }
      });
    }
  }

  private generateDiff(before: string, after: string): string {
    // Simple diff implementation
    if (before === after) return 'No changes';

    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');

    const maxLines = Math.max(beforeLines.length, afterLines.length);
    const diff: string[] = [];

    for (let i = 0; i < maxLines; i++) {
      const beforeLine = beforeLines[i] || '';
      const afterLine = afterLines[i] || '';

      if (beforeLine !== afterLine) {
        if (beforeLine) diff.push(`- ${beforeLine}`);
        if (afterLine) diff.push(`+ ${afterLine}`);
      }
    }

    return diff.length > 0 ? diff.join('\n') : 'Content normalized differently';
  }

  private async outputReport(report: ValidationReport, options: ValidationOptions): Promise<void> {
    // Console output
    this.printConsoleReport(report);

    // File output
    if (options.output) {
      await fs.writeFile(options.output, JSON.stringify(report, null, 2), 'utf-8');
      logger.info(`📄 Detailed report written to ${options.output}`);
    }
  }

  private printConsoleReport(report: ValidationReport): void {
    const { status, summary, issues, performance } = report;

    // Status indicator
    const statusIcon = status === 'passed' ? '✅' : status === 'warning' ? '⚠️' : '❌';
    console.log(`\n${statusIcon} Migration Validation: ${status.toUpperCase()}`);

    // Summary
    console.log('\n📊 Summary:');
    console.log(`  Total queries: ${summary.totalQueries}`);
    console.log(`  Matched: ${summary.matchedQueries}`);
    console.log(`  Modified: ${summary.modifiedQueries}`);
    console.log(`  Missing: ${summary.missingQueries}`);
    console.log(`  Extra: ${summary.extraQueries}`);

    // Performance
    console.log('\n⚡ Performance:');
    console.log(`  Validation time: ${performance.validationTime}ms`);
    console.log(`  Queries/second: ${performance.queriesPerSecond}`);

    // Issues
    if (issues.length > 0) {
      console.log('\n🔍 Issues Found:');

      const errorIssues = issues.filter(i => i.severity === 'error');
      const warningIssues = issues.filter(i => i.severity === 'warning');
      const infoIssues = issues.filter(i => i.severity === 'info');

      if (errorIssues.length > 0) {
        console.log(`\n❌ Errors (${errorIssues.length}):`);
        errorIssues.slice(0, 5).forEach(issue => {
          console.log(`  • ${issue.message}`);
        });
        if (errorIssues.length > 5) {
          console.log(`  ... and ${errorIssues.length - 5} more errors`);
        }
      }

      if (warningIssues.length > 0) {
        console.log(`\n⚠️ Warnings (${warningIssues.length}):`);
        warningIssues.slice(0, 3).forEach(issue => {
          console.log(`  • ${issue.message}`);
        });
        if (warningIssues.length > 3) {
          console.log(`  ... and ${warningIssues.length - 3} more warnings`);
        }
      }

      if (infoIssues.length > 0) {
        console.log(`\nℹ️ Info (${infoIssues.length}):`);
        infoIssues.slice(0, 2).forEach(issue => {
          console.log(`  • ${issue.message}`);
        });
        if (infoIssues.length > 2) {
          console.log(`  ... and ${infoIssues.length - 2} more info items`);
        }
      }
    } else {
      console.log('\n✨ No issues found! Migration appears successful.');
    }

    // Recommendations
    if (status === 'failed') {
      console.log('\n🚨 Migration validation failed. Please review the errors above.');
    } else if (status === 'warning') {
      console.log('\n⚠️ Migration completed with warnings. Review recommended.');
    } else {
      console.log('\n🎉 Migration validation passed successfully!');
    }
  }
}

// CLI Setup
const program = new Command();

program
  .name('validate-migration')
  .description('Validate that pattern migration preserved query behavior')
  .version('1.0.0');

program
  .option('-b, --before <path>', 'Path to queries before migration')
  .option('-a, --after <path>', 'Path to queries after migration')
  .option('-o, --output <path>', 'Output path for detailed report')
  .option('--strict', 'Enable strict validation mode')
  .option('--ignore-whitespace', 'Ignore whitespace differences')
  .action(async (options) => {
    try {
      if (!options.before || !options.after) {
        logger.error('❌ Both --before and --after paths are required');
        process.exit(1);
      }

      const validator = new MigrationValidator();
      const report = await validator.validateMigration({
        before: options.before,
        after: options.after,
        output: options.output,
        strictMode: options.strict,
        ignoreWhitespace: options.ignoreWhitespace
      });

      // Exit with appropriate code
      if (report.status === 'failed') {
        process.exit(1);
      } else if (report.status === 'warning') {
        process.exit(2);
      } else {
        process.exit(0);
      }
    } catch (error) {
      logger.error('❌ Validation failed:', error);
      process.exit(1);
    }
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export default program;
