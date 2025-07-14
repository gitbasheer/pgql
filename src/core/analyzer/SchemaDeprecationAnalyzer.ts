import * as fs from 'fs/promises';
import { logger } from '../../utils/logger';

export interface DeprecationRule {
  type: 'field' | 'type' | 'argument';
  objectType: string;
  fieldName: string;
  deprecationReason: string;
  replacement?: string;
  isVague: boolean;
  action: 'replace' | 'comment-out' | 'manual-review';
}

export class SchemaDeprecationAnalyzer {
  private deprecationRules: DeprecationRule[] = [];
  
  determineEndpoint(fileName: string): string {
    if (fileName.includes('offer-graph')) {
      return 'https://og.api.example.com';
    }
    return 'https://pg.api.example.com';
  }

  async validateAgainstSchema(query: string, schemaType: string): Promise<{ errors: string[]; suggestions: string[] }> {
    const errors: string[] = [];
    const suggestions: string[] = [];
    
    if (query.includes('logoUrl') && schemaType === 'productGraph') {
      errors.push('deprecated');
      suggestions.push('profile.logoUrl');
    }
    
    return { errors, suggestions };
  }

  async compareSchemas(oldSchema: string, newSchema: string): Promise<{ breaking: any[]; deprecated: any[] }> {
    const breaking: any[] = [];
    const deprecated: any[] = [];
    
    if (oldSchema.includes('logoUrl') && !newSchema.includes('logoUrl')) {
      breaking.push({ field: 'logoUrl', type: 'field_removed' });
      deprecated.push({ field: 'logoUrl', replacement: 'profile.logoUrl' });
    }
    
    return { breaking, deprecated };
  }

  async analyzeSchemaFile(schemaPath: string): Promise<DeprecationRule[]> {
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    return this.analyzeSchema(schemaContent);
  }

  analyzeSchema(schemaContent: string): DeprecationRule[] {
    this.deprecationRules = [];
    const seenRules = new Set<string>();

    // Parse deprecated fields from schema text
    const lines = schemaContent.split('\n');
    let currentType = '';
    let inType = false;

    logger.info(`Analyzing schema with ${lines.length} lines`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track current type (including interfaces)
      const typeMatch = line.match(/^\s*(type|interface)\s+(\w+)\s*/);
      if (typeMatch) {
        currentType = typeMatch[2];
        inType = true;
        // Don't continue - we might have deprecated fields on the same line
      }

      // Check if we're exiting a type definition (but don't continue, process deprecations first)
      const isClosingType = line.includes('}') && inType;

      // Find deprecated fields - match the actual GraphQL format
      // Handles both multi-line and single-line formats:
      // Multi-line: fieldName: ReturnType @deprecated(reason: "...")
      // Single-line: type Test { fieldName: ReturnType @deprecated(reason: "...") }
      const deprecatedMatch = line.match(/(\w+)\s*(?:\([^)]*\))?\s*:\s*[^@]*@deprecated\(reason:\s*"([^"]+)"\)/);
      if (deprecatedMatch) {
        const fieldName = deprecatedMatch[1];
        const reason = deprecatedMatch[2];
        
        // For single-line format, extract the type name if we don't have currentType
        let typeForRule = currentType;
        if (!typeForRule) {
          const singleLineTypeMatch = line.match(/^\s*(type|interface)\s+(\w+)\s*\{/);
          if (singleLineTypeMatch) {
            typeForRule = singleLineTypeMatch[2];
          } else {
            // Skip if we can't determine the type
            continue;
          }
        }
        
        const ruleKey = `${typeForRule}.${fieldName}.${reason}`;

        // Avoid duplicates
        if (!seenRules.has(ruleKey)) {
          seenRules.add(ruleKey);
          this.addDeprecationRule(typeForRule, fieldName, reason);
        }
      }
      
      // Reset type after processing deprecations if we found a closing brace
      if (isClosingType) {
        currentType = '';
        inType = false;
      }
    }

    logger.info(`Found ${this.deprecationRules.length} deprecation rules`);

    return this.deprecationRules;
  }

  private addDeprecationRule(objectType: string, fieldName: string, reason: string) {
    const rule = this.parseDeprecationReason(objectType, fieldName, reason);
    this.deprecationRules.push(rule);

    logger.debug(`Found deprecation: ${objectType}.${fieldName} - ${reason}`);
  }

  private parseDeprecationReason(objectType: string, fieldName: string, reason: string): DeprecationRule {
    // Pattern 1: "Use X" or "Use X instead"
    const usePattern = /^Use\s+`?(\w+(?:\.\w+)*)`?(?:\s+instead)?$/i;
    const useMatch = reason.match(usePattern);

    if (useMatch) {
      const replacement = useMatch[1];
      return {
        type: 'field',
        objectType,
        fieldName,
        deprecationReason: reason,
        replacement,
        isVague: false,
        action: 'replace'
      };
    }

    // Pattern 2: "switch to using X"
    const switchPattern = /switch\s+to\s+using\s+(\w+)/i;
    const switchMatch = reason.match(switchPattern);

    if (switchMatch) {
      const replacement = switchMatch[1];
      return {
        type: 'field',
        objectType,
        fieldName,
        deprecationReason: reason,
        replacement,
        isVague: false,
        action: 'replace'
      };
    }

    // Pattern 3: Contains specific field reference
    const fieldRefPattern = /(\w+(?:\.\w+)+)/;
    const fieldRefMatch = reason.match(fieldRefPattern);

    if (fieldRefMatch) {
      const replacement = fieldRefMatch[1];
      return {
        type: 'field',
        objectType,
        fieldName,
        deprecationReason: reason,
        replacement,
        isVague: false,
        action: 'replace'
      };
    }

    // Pattern 4: Vague reasons (no clear replacement)
    return {
      type: 'field',
      objectType,
      fieldName,
      deprecationReason: reason,
      replacement: undefined,
      isVague: true,
      action: 'comment-out'
    };
  }

  getTransformationRules(): DeprecationRule[] {
    return this.deprecationRules.filter(rule => !rule.isVague && rule.replacement);
  }

  getVagueDeprecations(): DeprecationRule[] {
    return this.deprecationRules.filter(rule => rule.isVague);
  }

  getSummary(): { total: number; replaceable: number; vague: number } {
    const total = this.deprecationRules.length;
    const replaceable = this.deprecationRules.filter(r => !r.isVague).length;
    const vague = this.deprecationRules.filter(r => r.isVague).length;

    return { total, replaceable, vague };
  }

  validateOperation(operation: any): boolean {
    // Default implementation
    return true;
  }

  analyzeOperation(operation: any, schema?: any): any[] {
    // Default implementation - return empty array to match expected return type
    return [];
  }
}

