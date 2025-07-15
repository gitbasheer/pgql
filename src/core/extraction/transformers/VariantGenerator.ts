import { parse, print, visit } from 'graphql';
import { ResolvedQuery, QueryVariant, VariantSwitch, VariantCondition } from '../types/index.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';
import { logger } from '../../../utils/logger.js';

export class VariantGenerator {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async generate(
    queries: ResolvedQuery[], 
    switches: Map<string, VariantSwitch>
  ): Promise<QueryVariant[]> {
    const variants: QueryVariant[] = [];
    
    for (const query of queries) {
      // Check if this query has dynamic patterns
      const querySwitches = this.findQuerySwitches(query, switches);
      
      if (querySwitches.length > 0) {
        const queryVariants = this.generateQueryVariants(query, querySwitches);
        variants.push(...queryVariants);
      }
    }
    
    logger.info(`Generated ${variants.length} variants from ${queries.length} queries`);
    return variants;
  }

  private findQuerySwitches(query: ResolvedQuery, switches: Map<string, VariantSwitch>): VariantSwitch[] {
    const querySwitches: VariantSwitch[] = [];
    const foundVars = new Set<string>();
    
    // Look for dynamic patterns in the query content
    // Pattern that handles nested braces properly
    const placeholderPattern = /\$\{([^${}]*(?:\{[^{}]*\}[^${}]*)*)\}/g;
    let match;
    
    while ((match = placeholderPattern.exec(query.resolvedContent)) !== null) {
      const expression = match[1];
      
      // Skip empty expressions
      if (!expression) continue;
      
      // Check if this expression contains any known switches
      for (const [varName, varSwitch] of switches) {
        // Normalize expression to handle spaces/newlines
        const normalizedExpr = expression.replace(/\s+/g, ' ').trim();
        
        // Check for exact match (enum case) or if expression contains the variable
        // Use word boundary to avoid partial matches
        const varRegex = new RegExp(`\\b${varName}\\b`);
        if (normalizedExpr === varName || varRegex.test(normalizedExpr)) {
          if (!foundVars.has(varName)) {
            querySwitches.push(varSwitch);
            foundVars.add(varName);
          }
        }
      }
    }
    
    // Also handle broken expressions (missing closing brace)
    const brokenPattern = /\$\{([^}]+)$/g;
    let brokenMatch;
    while ((brokenMatch = brokenPattern.exec(query.resolvedContent)) !== null) {
      const brokenExpr = brokenMatch[1];
      for (const [varName, varSwitch] of switches) {
        if (brokenExpr.includes(varName)) {
          if (!foundVars.has(varName)) {
            querySwitches.push(varSwitch);
            foundVars.add(varName);
          }
        }
      }
    }
    
    return querySwitches;
  }

  private generateQueryVariants(query: ResolvedQuery, switches: VariantSwitch[]): QueryVariant[] {
    // EVENT_PLACEHOLDER: Publish variant generation start
    // e.g., await eventBusClient.publish({ 
    //   source: 'pgql.pipeline', 
    //   detailType: 'progress', 
    //   detail: { stage: 'variant-generation', message: `Generating variants for ${query.name}` } 
    // });
    
    const variants: QueryVariant[] = [];
    
    // Generate all combinations
    const combinations = this.generateCombinations(switches);
    
    for (const combination of combinations) {
      const variant = this.createVariant(query, combination, switches);
      if (variant) {
        variants.push(variant);
      }
    }
    
    // EVENT_PLACEHOLDER: Publish variant generation completion
    // e.g., await eventBusClient.publish({ 
    //   source: 'pgql.pipeline', 
    //   detailType: 'progress', 
    //   detail: { stage: 'variant-generation', message: `Generated ${variants.length} variants for ${query.name}` } 
    // });
    
    return variants;
  }

  private generateCombinations(switches: VariantSwitch[]): VariantCondition[] {
    if (switches.length === 0) return [];
    
    // Filter out switches with no possible values
    const validSwitches = switches.filter(sw => sw.possibleValues && sw.possibleValues.length > 0);
    if (validSwitches.length === 0) return [];
    
    const combinations: VariantCondition[] = [];
    
    // Simple implementation for boolean switches
    const generateCombination = (index: number, current: Record<string, any>): void => {
      if (index === validSwitches.length) {
        combinations.push({
          switches: { ...current },
          description: this.describeCombination(current)
        });
        return;
      }
      
      const sw = validSwitches[index];
      for (const value of sw.possibleValues) {
        const newCurrent = { ...current };
        newCurrent[sw.variable] = value;
        generateCombination(index + 1, newCurrent);
      }
    };
    
    generateCombination(0, {});
    return combinations;
  }

  private describeCombination(switches: Record<string, any>): string {
    return Object.entries(switches)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
  }

  private createVariant(
    query: ResolvedQuery, 
    condition: VariantCondition,
    switches: VariantSwitch[]
  ): QueryVariant | null {
    try {
      // Apply the condition to generate the variant content
      let variantContent = query.resolvedContent;
      
      // Replace dynamic patterns based on condition
      // Pattern that handles nested braces
      const placeholderPattern = /\$\{([^${}]*(?:\{[^{}]*\}[^${}]*)*)\}/g;
      
      // First check for broken expressions and throw error
      const brokenPattern = /\$\{([^}]+)$/g;
      const brokenMatch = brokenPattern.exec(variantContent);
      if (brokenMatch) {
        throw new Error(`Broken placeholder expression: ${brokenMatch[0]}`);
      }
      
      variantContent = variantContent.replace(placeholderPattern, (match, expression) => {
        // Normalize expression to handle spaces/newlines
        const normalizedExpr = expression.replace(/\s+/g, ' ').trim();
        
        // First check for simple variable replacement (enum case)
        if (condition.switches[normalizedExpr] !== undefined) {
          return String(condition.switches[normalizedExpr]);
        }
        
        // Handle ternary expressions with improved regex
        // This regex handles:
        // - Single and double quotes
        // - Nested braces like { level }
        // - Whitespace variations
        // - Empty strings
        const ternaryMatch = normalizedExpr.match(/^(\w+)\s*\?\s*["']?([^"':]*(?:\{[^}]*\}[^"':]*)*)["']?\s*:\s*["']?([^"']*(?:\{[^}]*\}[^"']*)*)["']?$/);
        
        if (ternaryMatch) {
          const [, varName, trueValue, falseValue] = ternaryMatch;
          const conditionValue = condition.switches[varName];
          
          if (conditionValue !== undefined) {
            // For boolean conditions, return the appropriate branch
            const value = conditionValue ? trueValue : falseValue;
            // Clean up the value - remove leading/trailing quotes if present
            return value.trim().replace(/^["']|["']$/g, '');
          }
        }
        
        return match; // Keep original if can't resolve
      });
      
      // Clean up whitespace to fix invalid GraphQL
      variantContent = variantContent.replace(/\s+/g, ' ').trim();
      
      // Handle edge case of empty selection set
      if (variantContent.includes('{ }')) {
        variantContent = variantContent.replace(/\{\s*\}/g, '{ __typename }');
      }
      
      // Parse and validate the variant
      const ast = parse(variantContent);
      
      // Generate variant ID
      const variantId = this.generateVariantId(query, condition);
      
      return {
        id: variantId,
        originalQueryId: query.id,
        queryName: query.name || 'unnamed',
        filePath: query.filePath,
        content: variantContent,
        ast,
        conditions: condition,
        usedFragments: query.allDependencies || [],
        switchConfig: switches
      };
    } catch (error) {
      logger.error(`Failed to create variant for ${query.name}:`, error);
      return null;
    }
  }

  private generateVariantId(query: ResolvedQuery, condition: VariantCondition): string {
    const conditionStr = Object.entries(condition.switches)
      .map(([k, v]) => `${k}-${v}`)
      .join('_');
    
    return `${query.id}-variant-${conditionStr}`;
  }
}