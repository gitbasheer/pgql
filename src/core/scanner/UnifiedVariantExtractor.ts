// @ts-nocheck
import * as babel from '@babel/parser';
import * as traverseModule from '@babel/traverse';
const traverse = (traverseModule as any).default || traverseModule;
import { NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { DocumentNode, parse, print, visit, Kind } from 'graphql';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { GraphQLExtractor, ExtractedQuery } from './GraphQLExtractor.js';
import { ErrorHandler, ErrorContext } from '../extraction/utils/ErrorHandler.js';
import {
  VariantMetadata,
  ExtractedQueryWithVariant,
  VariantCondition,
  VariantSwitch,
  VariantExtractionResult,
  VariantReport,
} from '../extraction/types/variant-extractor.types.js';

interface VariantPattern {
  fullMatch: string;
  variable: string;
  trueValue: string;
  falseValue: string;
  type: 'fragment' | 'field';
  index: number;
}

interface IncrementalCache {
  version: string;
  lastRun: string;
  fileHashes: Record<string, string>;
  extractedQueries: Record<string, ExtractedQuery[]>;
}

/**
 * Unified variant extractor that extends GraphQLExtractor
 * Combines the best features from all previous variant extractors
 */
export class UnifiedVariantExtractor extends GraphQLExtractor {
  private errorHandler: ErrorHandler;
  private conditions: Map<string, VariantCondition> = new Map();
  private incrementalCache?: IncrementalCache;
  private cacheFile: string;
  private enableIncremental: boolean;

  constructor(options?: { enableIncrementalExtraction?: boolean; cacheDir?: string }) {
    super();
    this.errorHandler = new ErrorHandler();
    this.enableIncremental = options?.enableIncrementalExtraction ?? false;
    this.cacheFile = path.join(
      options?.cacheDir || process.cwd(),
      '.graphql-extraction-cache.json',
    );

    if (this.enableIncremental) {
      this.loadIncrementalCache().catch((err) => {
        logger.warn('Failed to load incremental cache:', err);
      });
    }
  }

  /**
   * Override extractFromFile to add variant detection
   */
  async extractFromFile(filePath: string): Promise<ExtractedQuery[]> {
    const context: ErrorContext = { file: filePath, operation: 'extractFromFile' };

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Check incremental cache
      if (this.shouldUseCache(filePath, content)) {
        const cached = this.incrementalCache?.extractedQueries[filePath];
        if (cached) {
          logger.debug(`Using cached results for ${filePath}`);
          return cached;
        }
      }

      // First extract using parent class logic
      const baseQueries = await super.extractFromFile(filePath);

      // Then detect and generate variants
      const allQueries = await this.extractVariants(filePath, content, baseQueries);

      // Update cache
      if (this.enableIncremental && this.incrementalCache) {
        const hash = this.computeFileHash(content);
        this.incrementalCache.fileHashes[filePath] = hash;
        this.incrementalCache.extractedQueries[filePath] = allQueries;
        this.saveIncrementalCache().catch((err) => {
          logger.warn('Failed to save incremental cache:', err);
        });
      }

      return allQueries;
    } catch (error) {
      this.errorHandler.handleError(error, context);
      return [];
    }
  }

  /**
   * Extract variants from a file
   */
  private async extractVariants(
    filePath: string,
    content: string,
    baseQueries: ExtractedQuery[],
  ): Promise<ExtractedQuery[]> {
    const context: ErrorContext = { file: filePath, operation: 'extractVariants' };

    return (
      (await this.errorHandler.tryOperation(
        async () => {
          if (!content) {
            return baseQueries;
          }

          const ast = babel.parse(content, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
            ranges: true,
          });

          const allQueries: ExtractedQuery[] = [];
          let queryIndex = 0;

          // Map base queries by approximate location
          const queryMap = new Map<string, ExtractedQuery>();
          for (const query of baseQueries) {
            queryMap.set(`${query.location.line}-${query.location.column}`, query);
          }

          // Find variant patterns in the AST
          try {
            traverse(ast, {
              TaggedTemplateExpression: (path) => {
                if (this.isGraphQLTag(path.node.tag)) {
                  const variants = this.generateVariantsFromTemplate(
                    path,
                    filePath,
                    content,
                    queryIndex++,
                  );
                  allQueries.push(...variants);
                }
              },

              CallExpression: (path) => {
                if (this.isGraphQLCall(path.node)) {
                  const variants = this.generateVariantsFromTemplate(
                    path,
                    filePath,
                    content,
                    queryIndex++,
                  );
                  allQueries.push(...variants);
                }
              },
            });
          } catch (traverseError) {
            logger.error('AST Traverse Failed:', traverseError);
            // Fallback to base queries if traverse fails
            return baseQueries;
          }

          // If no variants found, return original queries
          return allQueries.length > 0 ? allQueries : baseQueries;
        },
        context,
        baseQueries,
      )) || baseQueries
    );
  }

  /**
   * Generate variants from a template literal
   */
  private generateVariantsFromTemplate(
    path: NodePath,
    filePath: string,
    fileContent: string,
    queryIndex: number,
  ): ExtractedQuery[] {
    const node = path.node as any;
    const templateNode = this.getTemplateNode(node);

    if (!templateNode) return [];

    const { content: templateContent, hasExpressions } = this.extractTemplateWithExpressions(
      templateNode,
      path,
    );

    // Extract dynamic patterns
    const patterns = this.extractDynamicPatterns(templateContent);

    if (patterns.length === 0) {
      // No variants, return single query
      return this.createSingleQuery(templateContent, filePath, node, queryIndex);
    }

    // Generate all variant combinations
    const variants = this.generateAllVariants(
      templateContent,
      patterns,
      filePath,
      node,
      queryIndex,
    );

    // Track conditions for reporting
    this.trackConditions(`${filePath}-${queryIndex}`, patterns);

    return variants;
  }

  /**
   * Extract template content with expression evaluation
   */
  private extractTemplateWithExpressions(
    templateNode: t.TemplateLiteral,
    path: NodePath,
  ): { content: string; hasExpressions: boolean } {
    const { quasis, expressions } = templateNode;
    let content = '';
    let hasExpressions = false;

    for (let i = 0; i < quasis.length; i++) {
      content += quasis[i].value.raw;

      if (i < expressions.length) {
        hasExpressions = true;
        const expr = expressions[i];

        // Try to evaluate the expression using Babel
        try {
          const exprPath = path.get(`quasi.expressions.${i}`) as NodePath;
          if (exprPath && 'evaluate' in exprPath) {
            const evaluated = exprPath.evaluate();

            if (evaluated.confident) {
              content += String(evaluated.value);
              continue;
            }
          }
        } catch (e) {
          // Evaluation failed, preserve expression
        }

        // Preserve the expression for pattern matching
        content += `\${${generate(expr).code}}`;
      }
    }

    return { content, hasExpressions };
  }

  /**
   * Extract dynamic patterns from template
   */
  private extractDynamicPatterns(template: string): VariantPattern[] {
    const patterns: VariantPattern[] = [];

    // Pattern for fragment spreads: ...${var ? 'fragA' : 'fragB'}
    const fragmentPattern = /\.\.\.\$\{(\w+)\s*\?\s*['"](\w+)['"]\s*:\s*['"](\w+)['"]\s*\}/g;
    let match;

    while ((match = fragmentPattern.exec(template)) !== null) {
      patterns.push({
        fullMatch: match[0],
        variable: match[1],
        trueValue: match[2],
        falseValue: match[3],
        type: 'fragment',
        index: match.index,
      });
    }

    // Pattern for field interpolations: ${var ? 'fieldA' : 'fieldB'}
    const fieldPattern = /(?<!\.\.\.)(\$\{(\w+)\s*\?\s*['"](\w+)['"]\s*:\s*['"](\w+)['"]\s*\})/g;

    while ((match = fieldPattern.exec(template)) !== null) {
      patterns.push({
        fullMatch: match[1],
        variable: match[2],
        trueValue: match[3],
        falseValue: match[4],
        type: 'field',
        index: match.index,
      });
    }

    return patterns.sort((a, b) => a.index - b.index);
  }

  /**
   * Generate all variant combinations
   */
  private generateAllVariants(
    templateContent: string,
    patterns: VariantPattern[],
    filePath: string,
    node: any,
    queryIndex: number,
  ): ExtractedQuery[] {
    const variants: ExtractedQuery[] = [];
    const combinations = this.generateConditionCombinations(patterns);

    for (const combination of combinations) {
      const variant = this.createVariant(
        templateContent,
        patterns,
        combination,
        filePath,
        node,
        queryIndex,
      );

      if (variant) {
        variants.push(variant);
      }
    }

    return variants;
  }

  /**
   * Generate all possible condition combinations
   */
  private generateConditionCombinations(
    patterns: VariantPattern[],
  ): Array<Record<string, boolean>> {
    const variables = [...new Set(patterns.map((p) => p.variable))];
    const combinations: Array<Record<string, boolean>> = [];

    const numCombinations = Math.pow(2, variables.length);

    for (let i = 0; i < numCombinations; i++) {
      const combination: Record<string, boolean> = {};

      for (let j = 0; j < variables.length; j++) {
        combination[variables[j]] = Boolean(i & (1 << j));
      }

      combinations.push(combination);
    }

    return combinations;
  }

  /**
   * Create a variant query
   */
  private createVariant(
    templateContent: string,
    patterns: VariantPattern[],
    conditions: Record<string, boolean>,
    filePath: string,
    node: any,
    queryIndex: number,
  ): ExtractedQueryWithVariant | null {
    const context: ErrorContext = {
      file: filePath,
      operation: 'createVariant',
      details: { conditions },
    };

    return this.errorHandler.tryPartialOperation(async () => {
      let variantContent = templateContent;
      const replacements: any[] = [];

      // Apply replacements in reverse order
      for (const pattern of [...patterns].reverse()) {
        const value = conditions[pattern.variable] ? pattern.trueValue : pattern.falseValue;
        const replacement = pattern.type === 'fragment' ? `...${value}` : value;

        variantContent =
          variantContent.substring(0, pattern.index) +
          replacement +
          variantContent.substring(pattern.index + pattern.fullMatch.length);

        replacements.push({
          original: pattern.fullMatch,
          replaced: replacement,
          type: pattern.type,
        });
      }

      // Parse the variant
      const ast = parse(variantContent);

      // Generate variant ID
      const conditionString = Object.entries(conditions)
        .map(([key, value]) => `${key}=${value}`)
        .join('-');

      const operationInfo = this.extractOperationInfo(ast);
      const variantName = operationInfo.name
        ? `${operationInfo.name}_${conditionString}`
        : `Query_${queryIndex}_${conditionString}`;

      const variant: ExtractedQueryWithVariant = {
        id: `${filePath}-${queryIndex}-variant-${conditionString}`,
        filePath,
        content: variantContent,
        ast,
        location: {
          line: node.loc?.start.line || 0,
          column: node.loc?.start.column || 0,
        },
        name: variantName,
        type: operationInfo.type,
        variantMetadata: {
          isVariant: true,
          originalQueryId: `${filePath}-${queryIndex}`,
          conditions,
          replacements: replacements.reverse(),
        },
      };

      return variant;
    }, context);
  }

  /**
   * Create a single non-variant query
   */
  private createSingleQuery(
    content: string,
    filePath: string,
    node: any,
    queryIndex: number,
  ): ExtractedQuery[] {
    try {
      const ast = parse(content);
      const operationInfo = this.extractOperationInfo(ast);

      return [
        {
          id: `${filePath}-${queryIndex}`,
          filePath,
          content,
          ast,
          location: {
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
          },
          name: operationInfo.name,
          type: operationInfo.type,
        },
      ];
    } catch (error) {
      this.errorHandler.handleError(error, {
        file: filePath,
        operation: 'createSingleQuery',
      });
      return [];
    }
  }

  /**
   * Extract operation info from AST
   */
  private extractOperationInfo(ast: DocumentNode): {
    name?: string;
    type: 'query' | 'mutation' | 'subscription' | 'fragment';
  } {
    const definition = ast.definitions[0];

    if (definition.kind === Kind.OPERATION_DEFINITION) {
      return {
        name: definition.name?.value,
        type: definition.operation,
      };
    } else if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      return {
        name: definition.name.value,
        type: 'fragment',
      };
    }

    return { type: 'query' };
  }

  /**
   * Check if a tag is a GraphQL tag
   */
  private isGraphQLTag(tag: any): boolean {
    return t.isIdentifier(tag) && ['gql', 'graphql', 'GraphQL'].includes(tag.name);
  }

  /**
   * Check if a call is a GraphQL call
   */
  private isGraphQLCall(node: any): boolean {
    return (
      node.type === 'CallExpression' &&
      t.isIdentifier(node.callee) &&
      ['gql', 'graphql', 'GraphQL'].includes(node.callee.name) &&
      node.arguments.length > 0 &&
      t.isTemplateLiteral(node.arguments[0])
    );
  }

  /**
   * Get template node from AST node
   */
  private getTemplateNode(node: any): t.TemplateLiteral | null {
    if (node.type === 'TaggedTemplateExpression') {
      return node.quasi;
    } else if (node.type === 'CallExpression' && t.isTemplateLiteral(node.arguments[0])) {
      return node.arguments[0];
    }
    return null;
  }

  /**
   * Track conditions for reporting
   */
  private trackConditions(queryId: string, patterns: VariantPattern[]): void {
    for (const pattern of patterns) {
      const { variable, trueValue, falseValue } = pattern;

      if (!this.conditions.has(variable)) {
        this.conditions.set(variable, {
          variable,
          type: 'boolean',
          possibleValues: [true, false],
          usage: [],
        });
      }

      const condition = this.conditions.get(variable)!;
      condition.usage.push({
        queryId,
        location: pattern.type,
        trueValue,
        falseValue,
      });
    }
  }

  /**
   * Extract with variants (for backward compatibility)
   */
  async extractWithVariants(
    directory: string,
    patterns?: string[],
  ): Promise<VariantExtractionResult> {
    const queries = await this.extractFromDirectory(directory, patterns);

    // Separate variants from original queries
    const variants = queries.filter(
      (q): q is ExtractedQueryWithVariant =>
        !!(q as ExtractedQueryWithVariant).variantMetadata?.isVariant,
    );
    const originalQueries = queries.filter(
      (q) => !(q as ExtractedQueryWithVariant).variantMetadata?.isVariant,
    );

    // Create switches map
    const switches = new Map<string, VariantSwitch>();
    for (const condition of this.conditions.values()) {
      switches.set(condition.variable, {
        variable: condition.variable,
        type: condition.type,
        possibleValues: condition.possibleValues,
        location: (condition.usage[0]?.location as any) || 'unknown',
        description: `Used in ${condition.usage.length} queries`,
      });
    }

    // Get unique original query IDs that have variants
    const queriesWithVariants = [
      ...new Set(variants.map((v) => v.variantMetadata!.originalQueryId)),
    ];

    return {
      queries: originalQueries,
      variants,
      switches,
      conditions: Array.from(this.conditions.values()),
      summary: {
        totalOriginalQueries: originalQueries.length,
        totalVariants: variants.length,
        totalSwitches: switches.size,
        queriesWithVariants,
      },
    };
  }

  /**
   * Generate variant report
   */
  async generateVariantReport(): Promise<VariantReport> {
    const conditions = Array.from(this.conditions.values());

    const queriesWithVariants = new Set(conditions.flatMap((c) => c.usage.map((u) => u.queryId)));

    const totalCombinations = Math.pow(2, conditions.length);

    const report: VariantReport = {
      conditions,
      summary: {
        totalConditions: conditions.length,
        totalQueriesWithVariants: queriesWithVariants.size,
        totalPossibleCombinations: totalCombinations,
      },
    };

    // Add error report if there are errors
    const errorReport = this.errorHandler.getErrorReport();
    if (errorReport.totalErrors > 0) {
      report.errors = errorReport;
    }

    return report;
  }

  /**
   * Save variants to files
   */
  async saveVariants(outputDir: string, variants: ExtractedQueryWithVariant[]): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    for (const variant of variants) {
      const fileName = `${variant.name || variant.id}.graphql`;
      const filePath = path.join(outputDir, fileName);
      await fs.writeFile(filePath, variant.content);
    }

    logger.info(`Saved ${variants.length} variants to ${outputDir}`);
  }

  // Incremental extraction support

  private shouldUseCache(filePath: string, content: string): boolean {
    if (!this.enableIncremental || !this.incrementalCache) {
      return false;
    }

    const currentHash = this.computeFileHash(content);
    const cachedHash = this.incrementalCache.fileHashes[filePath];

    return currentHash === cachedHash;
  }

  private computeFileHash(content: string): string {
    if (!content) return '';
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async loadIncrementalCache(): Promise<void> {
    try {
      const cacheContent = await fs.readFile(this.cacheFile, 'utf-8');
      const cache = JSON.parse(cacheContent);

      // Validate cache version
      if (cache.version !== '1.0') {
        logger.warn('Incompatible cache version, starting fresh');
        this.initializeCache();
        return;
      }

      // Reconstruct ASTs
      const extractedQueries: Record<string, ExtractedQuery[]> = {};
      for (const [file, queries] of Object.entries(cache.extractedQueries)) {
        extractedQueries[file] = (queries as any[]).map((q) => ({
          ...q,
          ast: parse(q.content),
        }));
      }

      this.incrementalCache = {
        version: cache.version,
        lastRun: cache.lastRun,
        fileHashes: cache.fileHashes,
        extractedQueries,
      };

      logger.info(`Loaded incremental cache from ${cache.lastRun}`);
    } catch (error) {
      this.initializeCache();
    }
  }

  private initializeCache(): void {
    this.incrementalCache = {
      version: '1.0',
      lastRun: new Date().toISOString(),
      fileHashes: {},
      extractedQueries: {},
    };
  }

  private async saveIncrementalCache(): Promise<void> {
    if (!this.incrementalCache) return;

    // Don't store ASTs in cache
    const cacheData = {
      version: this.incrementalCache.version,
      lastRun: new Date().toISOString(),
      fileHashes: this.incrementalCache.fileHashes,
      extractedQueries: Object.fromEntries(
        Object.entries(this.incrementalCache.extractedQueries).map(([file, queries]) => [
          file,
          queries.map((q) => ({ ...q, ast: undefined })),
        ]),
      ),
    };

    await fs.writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2));
  }
}
