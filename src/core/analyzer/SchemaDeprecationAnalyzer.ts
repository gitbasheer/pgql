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

  async analyzeSchemaFile(schemaPath: string): Promise<DeprecationRule[]> {
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    return this.analyzeSchema(schemaContent);
  }

  analyzeSchema(schemaContent: string): DeprecationRule[] {
    this.deprecationRules = [];
    const seenRules = new Set<string>();
    
    // Parse deprecated fields from schema text
    const deprecatedPattern = /(\w+):\s*[^\n]+@deprecated\(reason:\s*"([^"]+)"\)/g;
    const fieldPattern = /type\s+(\w+)\s*\{[^}]*?(\w+):\s*[^\n]+@deprecated\(reason:\s*"([^"]+)"\)/gs;
    
    // First, find all deprecations in the schema
    const lines = schemaContent.split('\n');
    let currentType = '';
    
    logger.info(`Analyzing schema with ${lines.length} lines`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Track current type (including interfaces)
      const typeMatch = line.match(/(?:^|\s)(type|interface)\s+(\w+)\s*/);
      if (typeMatch) {
        currentType = typeMatch[2];
        
        // Also check for inline field definitions on the same line
        const inlineFieldMatch = line.match(/\{\s*(\w+)\s*(?:\([^)]*\))?\s*:\s*[^\n]+@deprecated\(reason:\s*"([^"]+)"\)/);
        if (inlineFieldMatch) {
          const fieldName = inlineFieldMatch[1];
          const reason = inlineFieldMatch[2];
          const ruleKey = `${currentType}.${fieldName}.${reason}`;
          
          if (!seenRules.has(ruleKey)) {
            seenRules.add(ruleKey);
            this.addDeprecationRule(currentType, fieldName, reason);
          }
        }
      }
      
      // Find deprecated fields - improved regex to handle GraphQL syntax
      const deprecatedMatch = line.match(/^\s*(\w+)\s*(?:\([^)]*\))?\s*:\s*[^@]+@deprecated\(reason:\s*"([^"]+)"\)/);
      if (deprecatedMatch && currentType) {
        const fieldName = deprecatedMatch[1];
        const reason = deprecatedMatch[2];
        const ruleKey = `${currentType}.${fieldName}.${reason}`;
        
        // Avoid duplicates
        if (!seenRules.has(ruleKey)) {
          seenRules.add(ruleKey);
          this.addDeprecationRule(currentType, fieldName, reason);
        }
      }
    }
    
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

