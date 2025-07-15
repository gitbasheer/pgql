import { GraphQLExtractor, ExtractedQuery } from './GraphQLExtractor';
import { DocumentNode, parse, print, visit, Kind } from 'graphql';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface QueryVariant {
  id: string;
  originalId: string;
  filePath: string;
  content: string;
  ast: DocumentNode;
  location: {
    line: number;
    column: number;
  };
  name?: string;
  type: 'query' | 'mutation' | 'subscription' | 'fragment';
  variant: {
    conditions: Record<string, any>;
    description: string;
  };
}

export interface VariantConfiguration {
  variables: Map<string, {
    type: 'boolean' | 'enum';
    values: any[];
    description?: string;
    usedIn: string[]; // Query IDs that use this variable
  }>;
}

export interface ExtractedQueryWithVariants extends ExtractedQuery {
  variants?: QueryVariant[];
  dynamicFragments?: Array<{
    condition: string;
    trueFragment: string;
    falseFragment: string;
    location: { line: number; column: number };
  }>;
}

export class VariantAwareExtractor extends GraphQLExtractor {
  private variantConfig: VariantConfiguration = {
    variables: new Map()
  };

  async extractFromDirectory(
    directory: string, 
    patterns: string[] = ['**/*.{js,jsx,ts,tsx}'], 
    resolveFragments: boolean = true
  ): Promise<ExtractedQuery[]> {
    logger.info(`Extracting GraphQL with variant awareness from ${directory}`);
    
    const baseQueries = await super.extractFromDirectory(directory, patterns, resolveFragments);
    const allQueries: ExtractedQuery[] = [];
    
    for (const query of baseQueries) {
      const variants = await this.extractVariants(query);
      if (variants.length > 0) {
        logger.info(`Generated ${variants.length} variants for query ${query.id}`);
        allQueries.push(...variants);
      } else {
        allQueries.push(query);
      }
    }
    
    // Save variant configuration
    await this.saveVariantConfiguration(directory);
    
    return allQueries;
  }

  private async extractVariants(query: ExtractedQuery): Promise<ExtractedQuery[]> {
    // Read the source file to analyze the full context
    const fileContent = await fs.readFile(query.filePath, 'utf-8');
    
    // Find the function or context that contains this query
    const queryContext = this.findQueryContext(fileContent, query.location);
    
    // Extract dynamic patterns
    const dynamicPatterns = this.extractDynamicPatterns(queryContext, query.content);
    
    if (dynamicPatterns.length === 0) {
      return []; // No variants needed
    }
    
    // Generate all variant combinations
    const variants = this.generateVariants(query, dynamicPatterns);
    
    return variants;
  }

  private findQueryContext(fileContent: string, location: { line: number; column: number }): string {
    const lines = fileContent.split('\n');
    
    // Find the function that contains this query
    let startLine = Math.max(0, location.line - 50);
    let endLine = Math.min(lines.length, location.line + 50);
    
    // Try to find function boundaries
    for (let i = location.line - 1; i >= 0; i--) {
      if (lines[i].match(/^(export\s+)?(const|function|class)\s+\w+/)) {
        startLine = i;
        break;
      }
    }
    
    // Find the end of the function
    let braceCount = 0;
    let inFunction = false;
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('{')) {
        braceCount += (line.match(/{/g) || []).length;
        inFunction = true;
      }
      if (line.includes('}')) {
        braceCount -= (line.match(/}/g) || []).length;
      }
      if (inFunction && braceCount === 0) {
        endLine = i + 1;
        break;
      }
    }
    
    return lines.slice(startLine, endLine).join('\n');
  }

  private extractDynamicPatterns(context: string, queryContent: string): Array<{
    type: 'fragment' | 'field';
    pattern: string;
    condition: string;
    trueValue: string;
    falseValue: string;
    variable: string;
  }> {
    const patterns: Array<any> = [];
    
    // Pattern 1: Dynamic fragment spreads in template literals
    // ...${infinityStoneEnabled ? 'ventureIsInfinityStoneFields' : 'ventureFields'}
    const fragmentPattern = /\.\.\.\$\{(\w+)\s*\?\s*['"](\w+)['"]\s*:\s*['"](\w+)['"]\s*\}/g;
    let match;
    
    while ((match = fragmentPattern.exec(context)) !== null) {
      const [fullMatch, variable, trueFragment, falseFragment] = match;
      patterns.push({
        type: 'fragment',
        pattern: fullMatch,
        condition: variable,
        trueValue: trueFragment,
        falseValue: falseFragment,
        variable
      });
      
      // Track this variable in our configuration
      if (!this.variantConfig.variables.has(variable)) {
        this.variantConfig.variables.set(variable, {
          type: 'boolean',
          values: [true, false],
          description: `Controls whether to use ${trueFragment} or ${falseFragment}`,
          usedIn: []
        });
      }
    }
    
    // Pattern 2: Dynamic fields
    // ${infinityStoneEnabled ? 'fieldA' : 'fieldB'}
    const fieldPattern = /\$\{(\w+)\s*\?\s*['"`]([^'"`]+)['"`]\s*:\s*['"`]([^'"`]+)['"`]\s*\}/g;
    
    while ((match = fieldPattern.exec(context)) !== null) {
      const [fullMatch, variable, trueValue, falseValue] = match;
      // Skip if this is a fragment spread (already handled)
      if (fullMatch.startsWith('...$')) continue;
      
      patterns.push({
        type: 'field',
        pattern: fullMatch,
        condition: variable,
        trueValue,
        falseValue,
        variable
      });
      
      // Track this variable
      if (!this.variantConfig.variables.has(variable)) {
        this.variantConfig.variables.set(variable, {
          type: 'boolean',
          values: [true, false],
          description: `Controls whether to use ${trueValue} or ${falseValue}`,
          usedIn: []
        });
      }
    }
    
    // Pattern 3: Conditional query construction
    // ${ventureQuery}(${ventureArgs})
    const queryConstructionPattern = /\$\{(\w+)\}\s*\(\s*\$\{(\w+)\}\s*\)/g;
    
    while ((match = queryConstructionPattern.exec(context)) !== null) {
      const [fullMatch, queryVar, argsVar] = match;
      // This is more complex and would need different handling
      logger.debug(`Found dynamic query construction: ${fullMatch}`);
    }
    
    return patterns;
  }

  private generateVariants(
    query: ExtractedQuery, 
    patterns: Array<any>
  ): ExtractedQuery[] {
    if (patterns.length === 0) return [];
    
    // Get unique variables
    const variables = [...new Set(patterns.map(p => p.variable))];
    
    // Generate all combinations
    const combinations = this.generateCombinations(variables);
    const variants: ExtractedQuery[] = [];
    
    for (const combination of combinations) {
      const variant = this.createVariant(query, patterns, combination);
      if (variant) {
        variants.push(variant);
        
        // Update variable usage tracking
        for (const variable of variables) {
          const varConfig = this.variantConfig.variables.get(variable);
          if (varConfig && !varConfig.usedIn.includes(query.id)) {
            varConfig.usedIn.push(query.id);
          }
        }
      }
    }
    
    return variants;
  }

  private generateCombinations(variables: string[]): Array<Record<string, any>> {
    const combinations: Array<Record<string, any>> = [];
    
    // Generate all boolean combinations
    const numCombinations = Math.pow(2, variables.length);
    
    for (let i = 0; i < numCombinations; i++) {
      const combination: Record<string, any> = {};
      
      for (let j = 0; j < variables.length; j++) {
        combination[variables[j]] = Boolean(i & (1 << j));
      }
      
      combinations.push(combination);
    }
    
    return combinations;
  }

  private createVariant(
    query: ExtractedQuery,
    patterns: Array<any>,
    conditions: Record<string, any>
  ): ExtractedQuery | null {
    let variantContent = query.content;
    let variantAst: DocumentNode;
    
    try {
      // First, apply all replacements to the content
      for (const pattern of patterns) {
        const value = conditions[pattern.variable] ? pattern.trueValue : pattern.falseValue;
        
        if (pattern.type === 'fragment') {
          // Replace in the GraphQL content
          const fragmentSpread = `...${value}`;
          // Look for the pattern in the actual GraphQL query
          const graphqlPattern = new RegExp(`\\.\\.\\.\\w+`, 'g');
          
          // Parse the AST to find fragment spreads
          variantAst = parse(variantContent);
          variantAst = visit(variantAst, {
            FragmentSpread: {
              enter(node) {
                // This is where we'd need to match and replace
                // For now, we'll handle this in a simplified way
                return node;
              }
            }
          });
        }
      }
      
      // For now, let's create a simple variant ID
      const conditionString = Object.entries(conditions)
        .map(([key, value]) => `${key}=${value}`)
        .join('-');
      
      const variantId = `${query.id}-variant-${conditionString}`;
      
      // Create the variant
      const variant: ExtractedQuery = {
        ...query,
        id: variantId,
        name: query.name ? `${query.name}_variant_${conditionString}` : undefined,
        content: variantContent
      };
      
      // Add variant metadata
      (variant as any).variant = {
        conditions,
        description: `Variant with ${conditionString}`
      };
      
      return variant;
      
    } catch (error) {
      logger.error(`Failed to create variant for ${query.id}:`, error);
      return null;
    }
  }

  private async saveVariantConfiguration(directory: string): Promise<void> {
    const configPath = path.join(directory, 'graphql-variants.json');
    
    const config = {
      generatedAt: new Date().toISOString(),
      variables: Array.from(this.variantConfig.variables.entries()).map(([name, config]) => ({
        name,
        ...config
      })),
      summary: {
        totalVariables: this.variantConfig.variables.size,
        totalQueriesWithVariants: new Set(
          Array.from(this.variantConfig.variables.values())
            .flatMap(v => v.usedIn)
        ).size
      }
    };
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    logger.info(`Variant configuration saved to ${configPath}`);
  }

  async generateVariantReport(): Promise<{
    variables: Array<{
      name: string;
      type: string;
      values: any[];
      usedIn: string[];
    }>;
    queriesWithVariants: number;
    totalPossibleVariants: number;
  }> {
    const variables = Array.from(this.variantConfig.variables.entries()).map(([name, config]) => ({
      name,
      type: config.type,
      values: config.values,
      usedIn: config.usedIn
    }));
    
    const queriesWithVariants = new Set(
      variables.flatMap(v => v.usedIn)
    ).size;
    
    const totalPossibleVariants = variables.reduce((total, variable) => {
      return total * variable.values.length;
    }, 1);
    
    return {
      variables,
      queriesWithVariants,
      totalPossibleVariants
    };
  }
}