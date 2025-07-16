import { ExtractedQuery } from './GraphQLExtractor.js';
import { DocumentNode, parse, print } from 'graphql';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs/promises';
import path from 'node:path';
import * as babel from '@babel/parser';
import * as traverseModule from '@babel/traverse';
const traverse = (traverseModule as any).default || traverseModule;
import * as t from '@babel/types';

export interface AdvancedVariantSwitch {
  variable: string;
  type: 'boolean' | 'enum';
  possibleValues: any[];
  location: 'fragment' | 'field' | 'variable';
  description?: string;
}

export interface AdvancedQueryVariant {
  id: string;
  originalQueryId: string;
  queryName: string;
  filePath: string;
  content: string; // Fully resolved GraphQL with fragments inlined
  ast: DocumentNode;
  conditions: Record<string, any>;
  usedFragments: string[];
  switchConfig: AdvancedVariantSwitch[];
}

export interface AdvancedVariantExtractionResult {
  queries: ExtractedQuery[];
  variants: AdvancedQueryVariant[];
  switches: Map<string, AdvancedVariantSwitch>;
  summary: {
    totalOriginalQueries: number;
    totalVariants: number;
    totalSwitches: number;
    queriesWithVariants: string[];
  };
}

interface DynamicFragment {
  conditionVar: string;
  trueFragment: string;
  falseFragment: string;
  expressionIndex: number;
}

export class AdvancedVariantExtractor {
  private switches: Map<string, AdvancedVariantSwitch> = new Map();
  private fragmentDefinitions: Map<string, string> = new Map();

  async extractWithVariants(
    directory: string,
    patterns: string[] = ['**/*.{js,jsx,ts,tsx}'],
  ): Promise<AdvancedVariantExtractionResult> {
    logger.info('Advanced variant extraction starting...');

    // First, collect all fragment definitions
    await this.collectAllFragments(directory);

    // Extract queries and their variants
    const allQueries: ExtractedQuery[] = [];
    const allVariants: AdvancedQueryVariant[] = [];
    const queriesWithVariants: Set<string> = new Set();

    const files = await this.findFiles(directory, patterns);

    for (const file of files) {
      const result = await this.extractFromFile(file);
      allQueries.push(...result.queries);
      allVariants.push(...result.variants);

      result.variants.forEach((v) => queriesWithVariants.add(v.originalQueryId));
    }

    return {
      queries: allQueries,
      variants: allVariants,
      switches: this.switches,
      summary: {
        totalOriginalQueries: allQueries.length,
        totalVariants: allVariants.length,
        totalSwitches: this.switches.size,
        queriesWithVariants: Array.from(queriesWithVariants),
      },
    };
  }

  private async collectAllFragments(directory: string): Promise<void> {
    const allFiles = await this.findFiles(directory, ['**/*.{js,jsx,ts,tsx}']);

    for (const file of allFiles) {
      await this.extractFragmentsFromFile(file);
    }

    logger.info(`Collected ${this.fragmentDefinitions.size} fragment definitions`);
  }

  private async extractFragmentsFromFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Look for fragment definitions
      const fragmentPattern = /fragment\s+(\w+)\s+on\s+(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs;

      let match;
      while ((match = fragmentPattern.exec(content)) !== null) {
        const [fullMatch, fragmentName, typeName, fragmentBody] = match;
        const fragmentDef = `fragment ${fragmentName} on ${typeName} {${fragmentBody}}`;
        this.fragmentDefinitions.set(fragmentName, fragmentDef);
        logger.debug(`Found fragment ${fragmentName} in ${path.basename(filePath)}`);
      }
    } catch (error) {
      logger.debug(`Error extracting fragments from ${filePath}:`, error);
    }
  }

  private async extractFromFile(
    filePath: string,
  ): Promise<{ queries: ExtractedQuery[]; variants: AdvancedQueryVariant[] }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const queries: ExtractedQuery[] = [];
    const variants: AdvancedQueryVariant[] = [];

    try {
      // Parse JavaScript/TypeScript file
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      });

      // Find GraphQL queries with dynamic fragments
      traverse(ast, {
        // Look for gql template literals
        TaggedTemplateExpression: (nodePath: any) => {
          logger.debug(
            `Found TaggedTemplateExpression, tag: ${nodePath.node.tag.type} ${nodePath.node.tag.name}`,
          );

          if (nodePath.node.tag.type === 'Identifier' && nodePath.node.tag.name === 'gql') {
            logger.debug('Found gql tagged template');
            const result = this.analyzeGQLTemplate(nodePath, filePath);
            if (result) {
              variants.push(...result);
            }
          }
        },
      });
    } catch (error) {
      logger.warn(`Failed to parse ${filePath}:`, error);
    }

    return { queries, variants };
  }

  private analyzeGQLTemplate(nodePath: any, filePath: string): AdvancedQueryVariant[] | null {
    try {
      const node = nodePath.node;
      const quasi = node.quasi;

      // Extract template parts and expressions
      const quasis = quasi.quasis;
      const expressions = quasi.expressions;

      logger.debug(`Analyzing GQL template in ${filePath} with ${expressions.length} expressions`);

      // Find dynamic fragment expressions
      const dynamicFragments: DynamicFragment[] = [];

      expressions.forEach((expr: any, index: number) => {
        logger.debug(`Expression ${index}: type=${expr.type}`);

        if (expr.type === 'ConditionalExpression') {
          // Check if this is a fragment spread
          const prevText = quasis[index].value.raw;
          const nextText = quasis[index + 1]?.value.raw || '';

          logger.debug(`Prev text: "${prevText}", Next text: "${nextText}"`);

          if (prevText.trim().endsWith('...') && this.isFragmentExpression(expr)) {
            const conditionVar = this.extractConditionVariable(expr.test);
            const trueFragment = this.extractFragmentName(expr.consequent);
            const falseFragment = this.extractFragmentName(expr.alternate);

            logger.debug(
              `Condition: ${conditionVar}, True: ${trueFragment}, False: ${falseFragment}`,
            );

            if (conditionVar && trueFragment && falseFragment) {
              dynamicFragments.push({
                conditionVar,
                trueFragment,
                falseFragment,
                expressionIndex: index,
              });

              // Track this switch
              if (!this.switches.has(conditionVar)) {
                this.switches.set(conditionVar, {
                  variable: conditionVar,
                  type: 'boolean',
                  possibleValues: [true, false],
                  location: 'fragment',
                });
              }
            }
          }
        }
      });

      logger.debug(`Found ${dynamicFragments.length} dynamic fragments`);

      if (dynamicFragments.length === 0) {
        return null;
      }

      // Generate variants
      return this.generateVariants(quasis, expressions, dynamicFragments, filePath);
    } catch (error) {
      logger.error(`Failed to analyze GQL template:`, error);
      return null;
    }
  }

  private isFragmentExpression(expr: any): boolean {
    logger.debug(
      `Checking fragment expression: consequent=${expr.consequent?.type}, alternate=${expr.alternate?.type}`,
    );

    // Check if both branches are string literals (fragment names)
    return (
      expr.type === 'ConditionalExpression' &&
      ((expr.consequent.type === 'Literal' && typeof expr.consequent.value === 'string') ||
        expr.consequent.type === 'StringLiteral') &&
      ((expr.alternate.type === 'Literal' && typeof expr.alternate.value === 'string') ||
        expr.alternate.type === 'StringLiteral')
    );
  }

  private extractConditionVariable(test: any): string | null {
    if (test.type === 'Identifier') {
      return test.name;
    }
    if (test.type === 'MemberExpression' && test.property.type === 'Identifier') {
      return test.property.name;
    }
    return null;
  }

  private extractFragmentName(node: any): string | null {
    logger.debug(`Extracting fragment name from node type: ${node.type}`);

    if (node.type === 'Literal' && typeof node.value === 'string') {
      return node.value;
    }
    if (node.type === 'StringLiteral' && typeof node.value === 'string') {
      return node.value;
    }

    logger.debug(`Could not extract fragment name from node:`, JSON.stringify(node, null, 2));
    return null;
  }

  private generateVariants(
    quasis: any[],
    expressions: any[],
    dynamicFragments: DynamicFragment[],
    filePath: string,
  ): AdvancedQueryVariant[] {
    const variants: AdvancedQueryVariant[] = [];

    // Generate all combinations of conditions
    const conditions = [...new Set(dynamicFragments.map((f) => f.conditionVar))];
    const combinations = this.generateCombinations(conditions);

    for (const combo of combinations) {
      // Build the query for this combination
      let queryText = '';

      for (let i = 0; i < quasis.length; i++) {
        queryText += quasis[i].value.raw;

        if (i < expressions.length) {
          // Check if this is a dynamic fragment
          const dynFrag = dynamicFragments.find((f) => f.expressionIndex === i);
          if (dynFrag) {
            // Use the appropriate fragment based on condition
            const fragmentName = combo[dynFrag.conditionVar]
              ? dynFrag.trueFragment
              : dynFrag.falseFragment;
            queryText += fragmentName;
          } else {
            // Skip other interpolations for now
            queryText += '';
          }
        }
      }

      // Clean and parse the query
      const cleanedQuery = this.cleanQuery(queryText);
      if (!cleanedQuery) {
        logger.debug(`Failed to clean query for combination ${JSON.stringify(combo)}`);
        continue;
      }

      logger.debug(`Generated query for ${JSON.stringify(combo)}:\n${cleanedQuery}`);

      try {
        const ast = parse(cleanedQuery);
        const queryName = this.extractQueryName(cleanedQuery);
        const usedFragments = this.extractUsedFragments(cleanedQuery);

        // Add fragment definitions
        const fullyResolvedQuery = this.inlineFragments(cleanedQuery, usedFragments);

        // Try to parse the full query with fragments
        let fullAst: DocumentNode;
        try {
          fullAst = parse(fullyResolvedQuery);
        } catch (parseError) {
          logger.error(`Failed to parse full query with fragments: ${parseError}`);
          logger.debug(`Full query:\n${fullyResolvedQuery}`);
          continue;
        }

        // Generate variant ID
        const conditionStr = Object.entries(combo)
          .map(([k, v]) => `${k}_${v}`)
          .join('_');

        const fileName =
          filePath
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/, '') || 'unknown';
        const variantId = `${fileName}_${queryName}_variant_${conditionStr}`;

        variants.push({
          id: variantId,
          originalQueryId: `${fileName}_${queryName}`,
          queryName: `${queryName}_${conditionStr}`,
          filePath,
          content: fullyResolvedQuery,
          ast: fullAst,
          conditions: combo,
          usedFragments,
          switchConfig: dynamicFragments.map((f) => ({
            variable: f.conditionVar,
            type: 'boolean' as const,
            possibleValues: [true, false],
            location: 'fragment' as const,
          })),
        });
      } catch (error) {
        logger.error(`Failed to parse variant:`, error);
      }
    }

    return variants;
  }

  private cleanQuery(queryText: string): string | null {
    // Remove extra whitespace and normalize
    const cleaned = queryText.replace(/\s+/g, ' ').trim();

    // Extract just the GraphQL part
    const gqlMatch = cleaned.match(/(query|mutation|subscription)[\s\S]+/);
    return gqlMatch ? gqlMatch[0] : null;
  }

  private extractQueryName(graphql: string): string {
    const match = graphql.match(/(?:query|mutation|subscription)\s+(\w+)/);
    return match ? match[1] : 'unnamed';
  }

  private extractUsedFragments(graphql: string): string[] {
    const fragments: string[] = [];
    const pattern = /\.\.\.\s*(\w+)/g;
    let match;

    while ((match = pattern.exec(graphql)) !== null) {
      fragments.push(match[1]);
    }

    return [...new Set(fragments)];
  }

  private generateCombinations(conditions: string[]): Array<Record<string, boolean>> {
    const combinations: Array<Record<string, boolean>> = [];
    const count = Math.pow(2, conditions.length);

    logger.debug(`Generating ${count} combinations for conditions: ${conditions.join(', ')}`);

    for (let i = 0; i < count; i++) {
      const combo: Record<string, boolean> = {};
      for (let j = 0; j < conditions.length; j++) {
        combo[conditions[j]] = Boolean(i & (1 << j));
      }
      combinations.push(combo);
      logger.debug(`Combination ${i}: ${JSON.stringify(combo)}`);
    }

    return combinations;
  }

  private inlineFragments(query: string, fragmentNames: string[]): string {
    let result = query;
    const usedFragmentDefs: string[] = [];

    for (const fragName of fragmentNames) {
      const fragDef = this.fragmentDefinitions.get(fragName);
      if (fragDef) {
        usedFragmentDefs.push(fragDef);
      } else {
        logger.warn(`Fragment ${fragName} definition not found`);
      }
    }

    // Append fragment definitions to the query
    if (usedFragmentDefs.length > 0) {
      result = `${query}\n\n${usedFragmentDefs.join('\n\n')}`;
    }

    return result;
  }

  private async findFiles(directory: string, patterns: string[]): Promise<string[]> {
    const glob = (await import('fast-glob')).default;
    return glob(patterns, {
      cwd: directory,
      absolute: true,
      ignore: ['**/node_modules/**', '**/__generated__/**'],
    });
  }

  async saveVariants(variants: AdvancedQueryVariant[], outputDir: string): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    for (const variant of variants) {
      // Create descriptive filename
      const conditions = Object.entries(variant.conditions)
        .map(([k, v]) => `${k}_${v}`)
        .join('_');

      const filename = `${variant.queryName}.graphql`;
      const filepath = path.join(outputDir, filename);

      await fs.writeFile(filepath, variant.content);
    }

    // Save switch configuration
    const switchConfig = {
      switches: Array.from(this.switches.entries()).map(([name, config]) => ({
        name,
        ...config,
      })),
      totalVariants: variants.length,
    };

    await fs.writeFile(
      path.join(outputDir, 'variant-switches.json'),
      JSON.stringify(switchConfig, null, 2),
    );

    logger.info(`Saved ${variants.length} variants to ${outputDir}`);
  }
}
