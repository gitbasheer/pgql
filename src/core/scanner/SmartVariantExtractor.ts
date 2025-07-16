import { ExtractedQuery } from './GraphQLExtractor.js';
import { DocumentNode, parse, print, visit, Kind, FragmentSpreadNode } from 'graphql';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs/promises';
import path from 'node:path';
import * as babel from '@babel/parser';
import * as traverseModule from '@babel/traverse';
const traverse = (traverseModule as any).default || traverseModule;
import generate from '@babel/generator';

export interface VariantSwitch {
  variable: string;
  type: 'boolean' | 'enum';
  possibleValues: any[];
  location: 'fragment' | 'field' | 'variable';
  description?: string;
}

export interface QueryVariant {
  id: string;
  originalQueryId: string;
  queryName: string;
  filePath: string;
  content: string; // Fully resolved GraphQL with fragments inlined
  ast: DocumentNode;
  conditions: Record<string, any>;
  usedFragments: string[];
  switchConfig: VariantSwitch[];
}

export interface VariantExtractionResult {
  queries: ExtractedQuery[];
  variants: QueryVariant[];
  switches: Map<string, VariantSwitch>;
  summary: {
    totalOriginalQueries: number;
    totalVariants: number;
    totalSwitches: number;
    queriesWithVariants: string[];
  };
}

export class SmartVariantExtractor {
  private switches: Map<string, VariantSwitch> = new Map();
  private fragmentDefinitions: Map<string, string> = new Map();

  async extractWithVariants(
    directory: string,
    patterns: string[] = ['**/*.{js,jsx,ts,tsx}'],
  ): Promise<VariantExtractionResult> {
    logger.info('Smart variant extraction starting...');

    // First, collect all fragment definitions
    await this.collectAllFragments(directory);

    // Extract queries and their variants
    const allQueries: ExtractedQuery[] = [];
    const allVariants: QueryVariant[] = [];
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
    // Scan all JavaScript/TypeScript files for fragments
    const allFiles = await this.findFiles(directory, ['**/*.{js,jsx,ts,tsx}']);

    for (const file of allFiles) {
      await this.extractFragmentsFromFile(file);
    }

    logger.info(`Collected ${this.fragmentDefinitions.size} fragment definitions`);
  }

  private async extractFragmentsFromFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Look for fragment definitions in the actual queries/files
      // Pattern to match fragment definitions with nested braces
      const fragmentPattern = /fragment\s+(\w+)\s+on\s+(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs;

      let match;
      while ((match = fragmentPattern.exec(content)) !== null) {
        const [fullMatch, fragmentName, typeName, fragmentBody] = match;
        const fragmentDef = `fragment ${fragmentName} on ${typeName} {${fragmentBody}}`;
        this.fragmentDefinitions.set(fragmentName, fragmentDef);
        logger.debug(`Found fragment ${fragmentName} in ${path.basename(filePath)}`);
      }

      // Also look for exported fragment variables
      const exportPattern = /export\s+const\s+(\w+Fragment)\s*=\s*`([^`]+)`/gs;
      while ((match = exportPattern.exec(content)) !== null) {
        const [, varName, fragmentContent] = match;

        // Check if it contains a fragment definition
        const innerMatch = fragmentContent.match(/fragment\s+(\w+)\s+on\s+(\w+)/);
        if (innerMatch) {
          const [, fragmentName] = innerMatch;
          // For now, store the raw content - in a real implementation,
          // we'd need to resolve template interpolations
          this.fragmentDefinitions.set(fragmentName, fragmentContent.trim());
          logger.debug(`Found exported fragment ${fragmentName} in ${path.basename(filePath)}`);
        }
      }
    } catch (error) {
      logger.debug(`Error extracting fragments from ${filePath}:`, error);
    }
  }

  private async extractFromFile(
    filePath: string,
  ): Promise<{ queries: ExtractedQuery[]; variants: QueryVariant[] }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const queries: ExtractedQuery[] = [];
    const variants: QueryVariant[] = [];

    try {
      // Parse JavaScript/TypeScript file
      const ast = babel.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      });

      // Find GraphQL queries with dynamic fragments
      traverse(ast, {
        // Look for gql template literals
        TaggedTemplateExpression: (path: any) => {
          if (path.node.tag.type === 'Identifier' && path.node.tag.name === 'gql') {
            const result = this.analyzeGraphQLTemplate(path, filePath, content);
            if (result) {
              if (result.variants.length > 0) {
                variants.push(...result.variants);
              } else if (result.query) {
                queries.push(result.query);
              }
            }
          }
        },

        // Look for template literals assigned to variables
        VariableDeclarator: (path: any) => {
          if (
            path.node.init?.type === 'TemplateLiteral' ||
            path.node.init?.type === 'TaggedTemplateExpression'
          ) {
            const result = this.analyzeGraphQLTemplate(path, filePath, content);
            if (result) {
              if (result.variants.length > 0) {
                variants.push(...result.variants);
              } else if (result.query) {
                queries.push(result.query);
              }
            }
          }
        },
      });
    } catch (error) {
      logger.warn(`Failed to parse ${filePath}:`, error);
    }

    return { queries, variants };
  }

  private analyzeGraphQLTemplate(
    path: any,
    filePath: string,
    fileContent: string,
  ): { query?: ExtractedQuery; variants: QueryVariant[] } | null {
    try {
      // Find the gql tag template literal
      let templateContent = '';
      let rawTemplate = '';

      if (path.node.type === 'TaggedTemplateExpression' && path.node.tag.name === 'gql') {
        // Direct gql`` template
        const quasi = path.node.quasi;
        const elements = quasi.quasis;
        const expressions = quasi.expressions;

        // Reconstruct template with placeholders
        for (let i = 0; i < elements.length; i++) {
          templateContent += elements[i].value.raw;
          if (i < expressions.length) {
            templateContent += '${___EXPR_' + i + '___}';
          }
        }
        rawTemplate = templateContent;
      } else if (
        path.node.type === 'VariableDeclarator' &&
        path.node.init?.type === 'TaggedTemplateExpression' &&
        path.node.init.tag.name === 'gql'
      ) {
        // Variable assignment with gql``
        const quasi = path.node.init.quasi;
        const elements = quasi.quasis;
        const expressions = quasi.expressions;

        // Reconstruct template with placeholders
        for (let i = 0; i < elements.length; i++) {
          templateContent += elements[i].value.raw;
          if (i < expressions.length) {
            templateContent += '${___EXPR_' + i + '___}';
          }
        }
        rawTemplate = templateContent;
      } else {
        return null;
      }

      // Check for dynamic fragments
      const dynamicFragments = this.findDynamicFragments(templateContent);

      if (dynamicFragments.length === 0) {
        // No dynamic fragments, return as regular query
        return null;
      }

      // Generate variants for each combination
      const variants = this.generateQueryVariants(
        path,
        filePath,
        templateContent,
        dynamicFragments,
      );

      return { variants };
    } catch (error) {
      logger.debug(`Failed to analyze template:`, error);
      return null;
    }
  }

  private findDynamicFragments(template: string): Array<{
    fullMatch: string;
    condition: string;
    trueValue: string;
    falseValue: string;
    index: number;
  }> {
    const fragments: Array<any> = [];

    // Pattern: ...${condition ? 'fragmentA' : 'fragmentB'}
    const pattern = /\.\.\.\$\{(\w+)\s*\?\s*['"`](\w+)['"`]\s*:\s*['"`](\w+)['"`]\s*\}/g;
    let match;

    while ((match = pattern.exec(template)) !== null) {
      fragments.push({
        fullMatch: match[0],
        condition: match[1],
        trueValue: match[2],
        falseValue: match[3],
        index: match.index,
      });

      // Track this switch
      if (!this.switches.has(match[1])) {
        this.switches.set(match[1], {
          variable: match[1],
          type: 'boolean',
          possibleValues: [true, false],
          location: 'fragment',
        });
      }
    }

    return fragments;
  }

  private generateQueryVariants(
    path: any,
    filePath: string,
    template: string,
    dynamicFragments: Array<any>,
  ): QueryVariant[] {
    const variants: QueryVariant[] = [];

    // Get query name if available
    const queryName = this.extractQueryName(template) || 'unnamed';

    // Generate all combinations
    const conditions = [...new Set(dynamicFragments.map((f) => f.condition))];
    const combinations = this.generateCombinations(conditions);

    for (const combo of combinations) {
      const variant = this.createVariant(
        path,
        filePath,
        template,
        dynamicFragments,
        combo,
        queryName,
      );

      if (variant) {
        variants.push(variant);
      }
    }

    return variants;
  }

  private generateCombinations(conditions: string[]): Array<Record<string, boolean>> {
    const combinations: Array<Record<string, boolean>> = [];
    const count = Math.pow(2, conditions.length);

    for (let i = 0; i < count; i++) {
      const combo: Record<string, boolean> = {};
      for (let j = 0; j < conditions.length; j++) {
        combo[conditions[j]] = Boolean(i & (1 << j));
      }
      combinations.push(combo);
    }

    return combinations;
  }

  private createVariant(
    path: any,
    filePath: string,
    template: string,
    dynamicFragments: Array<any>,
    conditions: Record<string, boolean>,
    queryName: string,
  ): QueryVariant | null {
    try {
      // Replace all dynamic fragments with their resolved values
      let resolvedTemplate = template;
      const usedFragments: string[] = [];

      // Sort by index descending to maintain positions
      const sortedFragments = [...dynamicFragments].sort((a, b) => b.index - a.index);

      for (const frag of sortedFragments) {
        const fragmentName = conditions[frag.condition] ? frag.trueValue : frag.falseValue;
        usedFragments.push(fragmentName);

        // Replace the dynamic spread with the actual fragment spread
        resolvedTemplate =
          resolvedTemplate.substring(0, frag.index) +
          `...${fragmentName}` +
          resolvedTemplate.substring(frag.index + frag.fullMatch.length);
      }

      // Parse the resolved template to get clean GraphQL
      const cleanQuery = this.extractGraphQLFromTemplate(resolvedTemplate);
      if (!cleanQuery) return null;

      // Inline fragment definitions
      const fullyResolvedQuery = this.inlineFragments(cleanQuery, usedFragments);

      // Generate variant ID
      const conditionStr = Object.entries(conditions)
        .map(([k, v]) => `${k}_${v}`)
        .join('_');

      const fileName =
        filePath
          .split('/')
          .pop()
          ?.replace(/\.[^.]+$/, '') || 'unknown';
      const variantId = `${fileName}_${queryName}_variant_${conditionStr}`;

      return {
        id: variantId,
        originalQueryId: `${fileName}_${queryName}`,
        queryName: `${queryName}_${conditionStr}`,
        filePath,
        content: fullyResolvedQuery,
        ast: parse(fullyResolvedQuery),
        conditions,
        usedFragments,
        switchConfig: dynamicFragments.map((f) => ({
          variable: f.condition,
          type: 'boolean' as const,
          possibleValues: [true, false],
          location: 'fragment' as const,
        })),
      };
    } catch (error) {
      logger.error(`Failed to create variant:`, error);
      return null;
    }
  }

  private extractGraphQLFromTemplate(template: string): string | null {
    // Remove template literal syntax
    const cleaned = template
      .replace(/^[^`]*`/, '') // Remove everything before first backtick
      .replace(/`[^`]*$/, '') // Remove everything after last backtick
      .replace(/\$\{[^}]+\}/g, ''); // Remove any remaining interpolations

    // Try to extract just the GraphQL part
    const gqlMatch = cleaned.match(/(query|mutation|subscription|fragment)[\s\S]+/);
    return gqlMatch ? gqlMatch[0].trim() : null;
  }

  private extractQueryName(graphql: string): string | null {
    const match = graphql.match(/(?:query|mutation|subscription)\s+(\w+)/);
    return match ? match[1] : null;
  }

  private inlineFragments(query: string, fragmentNames: string[]): string {
    let result = query;

    // Add fragment definitions that are used
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

  async saveVariants(variants: QueryVariant[], outputDir: string): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    for (const variant of variants) {
      // Create descriptive filename
      const conditions = Object.entries(variant.conditions)
        .map(([k, v]) => `${k}_${v}`)
        .join('_');

      const filename = `${variant.queryName}_${conditions}.graphql`;
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
