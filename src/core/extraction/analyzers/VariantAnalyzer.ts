import * as babel from '@babel/parser';
import traverse from '@babel/traverse';
import {
  ExtractedQuery,
  VariantAnalysisResult,
  DynamicPattern,
  VariantSwitch,
} from '../types/index.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';
import { logger } from '../../../utils/logger.js';

export class VariantAnalyzer {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async analyze(queries: ExtractedQuery[]): Promise<VariantAnalysisResult[]> {
    const results: VariantAnalysisResult[] = [];

    for (const query of queries) {
      const result = await this.analyzeQuery(query);
      results.push(result);
    }

    return results;
  }

  private async analyzeQuery(query: ExtractedQuery): Promise<VariantAnalysisResult> {
    const patterns: DynamicPattern[] = [];
    const switches: VariantSwitch[] = [];

    // Analyze the query content for dynamic patterns
    const contentPatterns = this.analyzeContent(query.content);
    patterns.push(...contentPatterns);

    // Analyze the source file for more context
    if (query.filePath !== 'inline') {
      const filePatterns = await this.analyzeSourceFile(query);
      patterns.push(...filePatterns);
    }

    // Convert patterns to switches
    for (const pattern of patterns) {
      const variantSwitch = this.patternToSwitch(pattern);
      if (variantSwitch) {
        switches.push(variantSwitch);
      }
    }

    // Calculate possible variants
    const possibleVariants = this.calculatePossibleVariants(switches);

    return {
      query,
      isVariant: patterns.length > 0,
      patterns,
      switches,
      possibleVariants,
      variantGenerationStrategy: possibleVariants > 10 ? 'separate' : 'inline',
    };
  }

  private analyzeContent(content: string): DynamicPattern[] {
    const patterns: DynamicPattern[] = [];

    // Pattern 1: Template literal placeholders
    const placeholderRegex = /\$\{([^}]+)\}/g;
    let match;
    while ((match = placeholderRegex.exec(content)) !== null) {
      patterns.push({
        type: 'ternary',
        location: {
          start: match.index,
          end: match.index + match[0].length,
          line: this.getLineNumber(content, match.index),
        },
        pattern: match[0],
        variables: [match[1]],
      });
    }

    // Pattern 2: Fragment spread patterns
    const fragmentSpreadRegex = /\.\.\.(\$\{[^}]+\}|\w+)/g;
    while ((match = fragmentSpreadRegex.exec(content)) !== null) {
      if (match[1].startsWith('${')) {
        patterns.push({
          type: 'ternary',
          location: {
            start: match.index,
            end: match.index + match[0].length,
            line: this.getLineNumber(content, match.index),
          },
          pattern: match[0],
          variables: [match[1].slice(2, -1)],
        });
      }
    }

    return patterns;
  }

  private async analyzeSourceFile(query: ExtractedQuery): Promise<DynamicPattern[]> {
    const patterns: DynamicPattern[] = [];

    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(query.filePath, 'utf-8');

      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy'],
      });

      // Find the specific query in the AST
      let queryFound = false;

      traverse(ast, {
        TaggedTemplateExpression: (path: any) => {
          if (!queryFound && path.node.loc?.start.line === query.location.line) {
            queryFound = true;
            const templatePatterns = this.analyzeTemplateExpression(path);
            patterns.push(...templatePatterns);
          }
        },
      });
    } catch (error) {
      logger.debug(`Could not analyze source file ${query.filePath}:`, error);
    }

    return patterns;
  }

  private analyzeTemplateExpression(path: any): DynamicPattern[] {
    const patterns: DynamicPattern[] = [];
    const quasi = path.node.quasi;

    quasi.expressions.forEach((expr: any, index: number) => {
      const pattern = this.analyzeExpression(expr);
      if (pattern) {
        pattern.location.line = expr.loc?.start.line || 0;
        patterns.push(pattern);
      }
    });

    return patterns;
  }

  private analyzeExpression(expr: any): DynamicPattern | null {
    // Ternary expression: condition ? a : b
    if (expr.type === 'ConditionalExpression') {
      return {
        type: 'ternary',
        location: {
          start: expr.start || 0,
          end: expr.end || 0,
          line: expr.loc?.start.line || 0,
        },
        pattern: 'ternary',
        variables: this.extractVariablesFromExpression(expr.test),
      };
    }

    // Function call
    if (expr.type === 'CallExpression') {
      return {
        type: 'function-call',
        location: {
          start: expr.start || 0,
          end: expr.end || 0,
          line: expr.loc?.start.line || 0,
        },
        pattern: 'function',
        variables: [],
      };
    }

    // Member expression (e.g., options.something)
    if (expr.type === 'MemberExpression') {
      const variables = this.extractVariablesFromExpression(expr);
      if (variables.length > 0) {
        return {
          type: 'ternary',
          location: {
            start: expr.start || 0,
            end: expr.end || 0,
            line: expr.loc?.start.line || 0,
          },
          pattern: 'member',
          variables,
        };
      }
    }

    return null;
  }

  private extractVariablesFromExpression(expr: any): string[] {
    const variables: string[] = [];

    if (expr.type === 'Identifier') {
      variables.push(expr.name);
    } else if (expr.type === 'MemberExpression') {
      if (expr.object.type === 'Identifier') {
        variables.push(expr.object.name);
      }
    }

    return variables;
  }

  private patternToSwitch(pattern: DynamicPattern): VariantSwitch | null {
    if (pattern.variables.length === 0) {
      return null;
    }

    const variable = pattern.variables[0];

    return {
      variable,
      type: pattern.type === 'ternary' ? 'boolean' : 'enum',
      possibleValues: pattern.type === 'ternary' ? [true, false] : [],
      location: 'fragment',
      source: pattern.pattern,
    };
  }

  private calculatePossibleVariants(switches: VariantSwitch[]): number {
    if (switches.length === 0) return 0;

    return switches.reduce((total, sw) => {
      const values = sw.possibleValues.length || 2;
      return total * values;
    }, 1);
  }

  private getLineNumber(content: string, index: number): number {
    const lines = content.substring(0, index).split('\n');
    return lines.length;
  }

  validateOperation(operation: any): boolean {
    // Default implementation
    return true;
  }

  analyzeOperation(operation: any): any {
    // Default implementation
    return { valid: true };
  }
}
