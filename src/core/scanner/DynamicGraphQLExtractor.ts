import { DocumentNode, parse, visit, FragmentSpreadNode, FieldNode, print } from 'graphql';
import { GraphQLExtractor, ExtractedQuery } from './GraphQLExtractor.js';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateReadPath } from '../../utils/securePath.js';

export interface QueryVariant {
  condition: string;
  conditionValue: any;
  fragmentName: string;
}

export interface ExtractedQueryWithVariants extends ExtractedQuery {
  variants?: {
    conditionVariable: string;
    possibleFragments: string[];
    variantQueries: Array<{
      condition: string;
      query: ExtractedQuery;
    }>;
  };
}

export class DynamicGraphQLExtractor extends GraphQLExtractor {
  /**
   * Enhanced extraction that detects dynamic fragment spreads and generates variants
   */
  async extractFromFile(filePath: string): Promise<ExtractedQuery[]> {
    // SECURITY FIX: Validate path to prevent traversal
    const validatedPath = validateReadPath(filePath);
    if (!validatedPath) {
      logger.warn(`Skipping potentially malicious file path: ${filePath}`);
      return [];
    }
    
    const content = await fs.readFile(validatedPath, 'utf-8');
    const baseQueries = await super.extractFromFile(filePath);
    const enhancedQueries: ExtractedQuery[] = [];

    for (const query of baseQueries) {
      // Check if this query might have dynamic fragments by analyzing the source
      const dynamicFragments = await this.detectDynamicFragments(filePath, content, query);
      
      if (dynamicFragments.length > 0) {
        // Generate variants for each dynamic fragment
        const variants = await this.generateQueryVariants(query, dynamicFragments, filePath, content);
        enhancedQueries.push(...variants);
      } else {
        // No dynamic fragments, keep the original query
        enhancedQueries.push(query);
      }
    }

    return enhancedQueries;
  }

  /**
   * Detect dynamic fragment spreads in the source code
   */
  private async detectDynamicFragments(
    filePath: string,
    fileContent: string,
    query: ExtractedQuery
  ): Promise<Array<{ line: number; pattern: string; condition: string; fragments: string[] }>> {
    const dynamicFragments: Array<{ line: number; pattern: string; condition: string; fragments: string[] }> = [];
    
    // Pattern to match dynamic fragment spreads like:
    // ...${infinityStoneEnabled ? 'ventureProjectGroupsField' : 'ventureFields'}
    const dynamicFragmentPattern = /\.\.\.\$\{([^?]+)\s*\?\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]\s*\}/g;
    
    // Also check for template literal variations
    const templatePattern = /\.\.\.\${([^}]+)}/g;
    
    const lines = fileContent.split('\n');
    
    lines.forEach((line, index) => {
      let match: RegExpExecArray | null;
      
      // Check for ternary operator pattern
      while ((match = dynamicFragmentPattern.exec(line)) !== null) {
        dynamicFragments.push({
          line: index + 1,
          pattern: match[0],
          condition: match[1].trim(),
          fragments: [match[2], match[3]]
        });
      }
      
      // Reset regex
      dynamicFragmentPattern.lastIndex = 0;
      
      // Check for more complex template patterns
      while ((match = templatePattern.exec(line)) !== null) {
        const expression = match[1];
        const currentMatch = match[0]; // Capture match[0] while match is not null
        
        // Check if it's a ternary expression we haven't caught
        const ternaryMatch = expression.match(/([^?]+)\s*\?\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/);
        if (ternaryMatch && !dynamicFragments.some(df => df.pattern === currentMatch)) {
          dynamicFragments.push({
            line: index + 1,
            pattern: currentMatch,
            condition: ternaryMatch[1].trim(),
            fragments: [ternaryMatch[2], ternaryMatch[3]]
          });
        }
      }
    });

    // Filter to only include dynamic fragments that are within the query's location
    const relevantFragments = dynamicFragments.filter(df => {
      // Check if the dynamic fragment is within reasonable proximity of the query
      return Math.abs(df.line - query.location.line) < 50; // Adjust threshold as needed
    });

    logger.debug(`Found ${relevantFragments.length} dynamic fragments in ${filePath}`);
    return relevantFragments;
  }

  /**
   * Generate query variants for each possible fragment combination
   */
  private async generateQueryVariants(
    originalQuery: ExtractedQuery,
    dynamicFragments: Array<{ line: number; pattern: string; condition: string; fragments: string[] }>,
    filePath: string,
    fileContent: string
  ): Promise<ExtractedQuery[]> {
    const variants: ExtractedQuery[] = [];
    
    // For each dynamic fragment, generate all possible combinations
    if (dynamicFragments.length === 0) {
      return [originalQuery];
    }

    // Generate all combinations of fragment selections
    const combinations = this.generateCombinations(dynamicFragments);
    
    for (const combination of combinations) {
      let variantContent = originalQuery.content;
      let variantId = originalQuery.id;
      const conditionSuffix: string[] = [];
      
      // Replace each dynamic fragment with the selected variant
      for (let i = 0; i < dynamicFragments.length; i++) {
        const dynamic = dynamicFragments[i];
        const selectedFragment = combination[i];
        
        // Create a pattern to find the fragment spread in the GraphQL query
        const spreadPattern = new RegExp(`\\.\\.\\.\\w+`, 'g');
        
        // We need to be more intelligent about replacement
        // Look for the actual fragment spread in the parsed AST
        let modifiedContent = variantContent;
        
        // For now, do a simple replacement approach
        // In a real implementation, we'd parse and modify the AST
        const fragmentSpreadRegex = /\.\.\.[\w${}?:'"\\s]+/g;
        
        modifiedContent = this.replaceFragmentSpread(
          modifiedContent,
          dynamic.pattern,
          `...${selectedFragment}`,
          dynamic.fragments,
          selectedFragment
        );
        
        variantContent = modifiedContent;
        
        // Build condition suffix for the variant ID
        const conditionValue = selectedFragment === dynamic.fragments[0] ? 'true' : 'false';
        conditionSuffix.push(`${dynamic.condition}=${conditionValue}`);
      }
      
      // Create variant query
      let variantAst: DocumentNode;
      try {
        variantAst = parse(variantContent);
      } catch (error) {
        logger.warn(`Failed to parse variant for ${originalQuery.id}:`, error);
        continue;
      }
      
      const variant: ExtractedQuery = {
        ...originalQuery,
        id: `${originalQuery.id}-variant-${conditionSuffix.join('-')}`,
        content: variantContent,
        ast: variantAst,
        name: originalQuery.name ? `${originalQuery.name}_${conditionSuffix.join('_')}` : undefined
      };
      
      variants.push(variant);
    }
    
    // Also include the original query as a variant if it's valid
    if (variants.length === 0) {
      variants.push(originalQuery);
    }
    
    logger.info(`Generated ${variants.length} variants for query ${originalQuery.id}`);
    return variants;
  }

  /**
   * Replace dynamic fragment spread with concrete fragment
   */
  private replaceFragmentSpread(
    content: string,
    dynamicPattern: string,
    replacement: string,
    possibleFragments: string[],
    selectedFragment: string
  ): string {
    // First, try to find the exact pattern in the content
    if (content.includes(dynamicPattern)) {
      return content.replace(dynamicPattern, replacement);
    }
    
    // If not found, the content might already be processed by graphql-tag-pluck
    // Look for any of the possible fragment spreads
    for (const fragment of possibleFragments) {
      const fragmentSpread = `...${fragment}`;
      if (content.includes(fragmentSpread) && fragment !== selectedFragment) {
        // Replace with the selected fragment
        return content.replace(fragmentSpread, `...${selectedFragment}`);
      }
    }
    
    // If we still haven't found it, try a more general approach
    // This handles cases where the template literal has been processed
    const ast = parse(content);
    
    const modifiedAst = visit(ast, {
      FragmentSpread(node) {
        if (possibleFragments.includes(node.name.value)) {
          return {
            ...node,
            name: {
              ...node.name,
              value: selectedFragment
            }
          };
        }
        return node;
      }
    });
    
    // Convert back to string (simplified approach)
    // In production, use graphql printer
    return this.astToString(modifiedAst);
  }

  /**
   * Generate all combinations of fragment selections
   */
  private generateCombinations(
    dynamicFragments: Array<{ fragments: string[] }>
  ): string[][] {
    if (dynamicFragments.length === 0) return [[]];
    
    const [first, ...rest] = dynamicFragments;
    const restCombinations = this.generateCombinations(rest);
    
    const combinations: string[][] = [];
    for (const fragment of first.fragments) {
      for (const restCombo of restCombinations) {
        combinations.push([fragment, ...restCombo]);
      }
    }
    
    return combinations;
  }

  /**
   * Simple AST to string converter
   */
  private astToString(ast: DocumentNode): string {
    return print(ast);
  }

  /**
   * Extract with variant information included
   */
  async extractFromDirectoryWithVariants(
    directory: string,
    patterns: string[] = ['**/*.{js,jsx,ts,tsx}'],
    resolveFragments: boolean = true
  ): Promise<ExtractedQueryWithVariants[]> {
    const queries = await this.extractFromDirectory(directory, patterns, resolveFragments);
    
    // Group variants by original query
    const variantMap = new Map<string, ExtractedQueryWithVariants>();
    
    for (const query of queries) {
      const baseId = query.id.replace(/-variant-.*$/, '');
      
      if (!variantMap.has(baseId)) {
        variantMap.set(baseId, {
          ...query,
          variants: {
            conditionVariable: '',
            possibleFragments: [],
            variantQueries: []
          }
        });
      }
      
      if (query.id.includes('-variant-')) {
        const baseQuery = variantMap.get(baseId)!;
        baseQuery.variants!.variantQueries.push({
          condition: query.id.substring(query.id.indexOf('-variant-') + 9),
          query
        });
      }
    }
    
    return Array.from(variantMap.values());
  }
}