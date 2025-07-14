import { parse, print, visit } from 'graphql';
import { ResolvedQuery, QueryVariant, VariantSwitch, VariantCondition } from '../types/index';
import { ExtractionContext } from '../engine/ExtractionContext';
import { logger } from '../../../utils/logger';

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
    // Updated pattern to match broken expressions too (missing closing brace)
    const placeholderPattern = /\$\{([^}]*)\}?/g;
    let match;
    
    while ((match = placeholderPattern.exec(query.resolvedContent)) !== null) {
      const expression = match[1];
      
      // Check if this expression contains any known switches
      for (const [varName, varSwitch] of switches) {
        // Normalize expression to handle spaces/newlines
        const normalizedExpr = expression.replace(/\s+/g, ' ').trim();
        
        // Check for exact match (enum case) or if expression contains the variable
        if (normalizedExpr === varName || normalizedExpr.includes(varName)) {
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
    const variants: QueryVariant[] = [];
    
    // Generate all combinations
    const combinations = this.generateCombinations(switches);
    
    for (const combination of combinations) {
      const variant = this.createVariant(query, combination, switches);
      if (variant) {
        variants.push(variant);
      }
    }
    
    return variants;
  }

  private generateCombinations(switches: VariantSwitch[]): VariantCondition[] {
    if (switches.length === 0) return [];
    
    const combinations: VariantCondition[] = [];
    
    // Simple implementation for boolean switches
    const generateCombination = (index: number, current: Record<string, any>): void => {
      if (index === switches.length) {
        combinations.push({
          switches: { ...current },
          description: this.describeCombination(current)
        });
        return;
      }
      
      const sw = switches[index];
      for (const value of sw.possibleValues) {
        current[sw.variable] = value;
        generateCombination(index + 1, current);
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
      const placeholderPattern = /\$\{([^}]+)\}/g;
      
      variantContent = variantContent.replace(placeholderPattern, (match, expression) => {
        // First check for simple variable replacement (enum case)
        const trimmedExpr = expression.trim();
        if (condition.switches[trimmedExpr] !== undefined) {
          return String(condition.switches[trimmedExpr]);
        }
        
        // Handle ternary expressions with various quote styles and nested content
        // Match pattern: variable ? trueValue : falseValue
        // This regex handles quoted strings, nested braces, and complex content
        const ternaryMatch = expression.match(/(\w+)\s*\?\s*["']?([^"':]*(?:{[^}]*}[^"':]*)?)["']?\s*:\s*["']?([^"'}]*(?:{[^}]*}[^"'}]*)?)["']?/);
        
        if (ternaryMatch) {
          const [, varName, trueValue, falseValue] = ternaryMatch;
          const conditionValue = condition.switches[varName];
          
          if (conditionValue !== undefined) {
            // For boolean conditions, return the appropriate branch
            const value = conditionValue ? trueValue : falseValue;
            // Clean up the value - remove quotes if they were part of the capture
            return value.trim();
          }
        }
        
        return match; // Keep original if can't resolve
      });
      
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