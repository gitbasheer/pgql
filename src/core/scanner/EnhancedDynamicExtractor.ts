import { DynamicGraphQLExtractor } from './DynamicGraphQLExtractor.js';
import { ExtractedQuery } from './GraphQLExtractor.js';
import { DocumentNode, parse, print, visit, Kind } from 'graphql';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs/promises';

export interface VariantCondition {
  variable: string;
  type: 'boolean' | 'enum';
  possibleValues: any[];
  usage: {
    queryId: string;
    location: string;
    trueValue: string;
    falseValue: string;
  }[];
}

export interface QueryVariantMetadata {
  originalQueryId: string;
  conditions: Record<string, any>;
  replacements: Array<{
    original: string;
    replaced: string;
    type: 'fragment' | 'field';
  }>;
}

export class EnhancedDynamicExtractor extends DynamicGraphQLExtractor {
  private conditions: Map<string, VariantCondition> = new Map();

  protected async extractFromFileWithDynamic(filePath: string): Promise<ExtractedQuery[]> {
    const queries = await this.extractFromFile(filePath);
    if (queries.length === 0) return queries;

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const allQueries: ExtractedQuery[] = [];

    for (const query of queries) {
      const variants = await this.generateProperVariants(query, fileContent);
      if (variants.length > 0) {
        allQueries.push(...variants);
      } else {
        allQueries.push(query);
      }
    }

    return allQueries;
  }

  private async generateProperVariants(
    query: ExtractedQuery,
    fileContent: string,
  ): Promise<ExtractedQuery[]> {
    // Find the actual GraphQL template literal in the source
    const queryMatch = this.findQueryInSource(query, fileContent);
    if (!queryMatch) return [];

    const { templateContent, startIndex, endIndex } = queryMatch;

    // Extract dynamic patterns from the template
    const patterns = this.extractDynamicPatternsFromTemplate(templateContent);
    if (patterns.length === 0) return [];

    // Generate all combinations
    const combinations = this.generateConditionCombinations(patterns);
    const variants: ExtractedQuery[] = [];

    for (const combination of combinations) {
      const variant = this.createProperVariant(query, templateContent, patterns, combination);
      if (variant) {
        variants.push(variant);

        // Track conditions
        this.trackConditions(query.id, patterns);
      }
    }

    return variants;
  }

  private findQueryInSource(
    query: ExtractedQuery,
    fileContent: string,
  ): { templateContent: string; startIndex: number; endIndex: number } | null {
    // Look for gql template literal that contains our query
    const gqlPattern = /gql`([\s\S]*?)`/g;
    let match;

    while ((match = gqlPattern.exec(fileContent)) !== null) {
      const templateContent = match[1];

      // Check if this template contains our query
      // Simple check: does it have the same operation name?
      if (query.name && templateContent.includes(query.name)) {
        return {
          templateContent,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        };
      }

      // For unnamed queries, check content similarity
      try {
        const templateAst = parse(templateContent);
        if (this.isSameQuery(query.ast, templateAst)) {
          return {
            templateContent,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
          };
        }
      } catch (e) {
        // Template might have dynamic parts that prevent parsing
        // We'll handle this below
      }
    }

    // If not found in gql``, look for template literal assignment
    const templatePattern = new RegExp(`(?:const|let|var)\\s+\\w+\\s*=\\s*\`([\\s\\S]*?)\``, 'g');

    while ((match = templatePattern.exec(fileContent)) !== null) {
      const templateContent = match[1];
      if (this.templateContainsQuery(templateContent, query)) {
        return {
          templateContent,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        };
      }
    }

    return null;
  }

  private isSameQuery(ast1: DocumentNode, ast2: DocumentNode): boolean {
    // Simple comparison - check operation names and types
    const op1 = ast1.definitions[0];
    const op2 = ast2.definitions[0];

    if (op1.kind !== 'OperationDefinition' || op2.kind !== 'OperationDefinition') {
      return false;
    }

    return op1.operation === op2.operation && op1.name?.value === op2.name?.value;
  }

  private templateContainsQuery(template: string, query: ExtractedQuery): boolean {
    // Check if template contains key parts of the query
    if (query.name && template.includes(query.name)) return true;

    // Check for operation type
    const opType = query.type;
    const opPattern = new RegExp(`^\\s*${opType}\\s+`, 'm');
    return opPattern.test(template);
  }

  private extractDynamicPatternsFromTemplate(template: string): Array<{
    fullMatch: string;
    variable: string;
    trueValue: string;
    falseValue: string;
    type: 'fragment' | 'field';
    index: number;
  }> {
    const patterns: Array<any> = [];

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

  private generateConditionCombinations(patterns: Array<any>): Array<Record<string, boolean>> {
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

  private createProperVariant(
    query: ExtractedQuery,
    templateContent: string,
    patterns: Array<any>,
    conditions: Record<string, boolean>,
  ): ExtractedQuery | null {
    try {
      // Replace all dynamic parts in the template
      let variantTemplate = templateContent;
      const replacements: Array<any> = [];

      // Process in reverse order to maintain string indices
      for (const pattern of [...patterns].reverse()) {
        const value = conditions[pattern.variable] ? pattern.trueValue : pattern.falseValue;
        const replacement = pattern.type === 'fragment' ? `...${value}` : value;

        // Replace in template
        variantTemplate =
          variantTemplate.substring(0, pattern.index) +
          replacement +
          variantTemplate.substring(pattern.index + pattern.fullMatch.length);

        replacements.push({
          original: pattern.fullMatch,
          replaced: replacement,
          type: pattern.type,
        });
      }

      // Parse the variant to ensure it's valid GraphQL
      const variantAst = parse(variantTemplate);

      // Create condition string for ID
      const conditionString = Object.entries(conditions)
        .map(([key, value]) => `${key}=${value}`)
        .join('-');

      // Extract operation name from AST
      const operationDef = variantAst.definitions[0];
      let operationName = query.name;
      if (operationDef.kind === 'OperationDefinition' && operationDef.name) {
        operationName = operationDef.name.value;
      }

      const variant: ExtractedQuery = {
        id: `${query.id}-variant-${conditionString}`,
        filePath: query.filePath,
        content: variantTemplate,
        ast: variantAst,
        location: query.location,
        name: operationName ? `${operationName}_${conditionString}` : undefined,
        type: query.type,
      };

      // Add metadata
      (variant as any).variantMetadata = {
        originalQueryId: query.id,
        conditions,
        replacements: replacements.reverse(),
      } as QueryVariantMetadata;

      return variant;
    } catch (error) {
      logger.error(`Failed to create variant for ${query.id}:`, error);
      return null;
    }
  }

  private trackConditions(queryId: string, patterns: Array<any>): void {
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

  async generateVariantReport(): Promise<{
    conditions: VariantCondition[];
    summary: {
      totalConditions: number;
      totalQueriesWithVariants: number;
      totalPossibleCombinations: number;
    };
  }> {
    const conditions = Array.from(this.conditions.values());

    const queriesWithVariants = new Set(conditions.flatMap((c) => c.usage.map((u) => u.queryId)));

    const totalCombinations = Math.pow(2, conditions.length);

    return {
      conditions,
      summary: {
        totalConditions: conditions.length,
        totalQueriesWithVariants: queriesWithVariants.size,
        totalPossibleCombinations: totalCombinations,
      },
    };
  }
}
