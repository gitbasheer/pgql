/**
 * Generates mapping utilities for transformed queries
 * Single responsibility: Create TypeScript mapping functions between old/new schemas
 */

import { TransformResult } from '../BaseTransformer.js';
import { logger } from '../../../utils/logger.js';

export interface MappingUtilityOptions {
  typescript?: boolean;
  includeTypes?: boolean;
  addComments?: boolean;
}

export interface GeneratedMapping {
  fileName: string;
  content: string;
  queryId: string;
  changes: number;
}

export class MappingUtilityGenerator {
  constructor(private options: MappingUtilityOptions = {}) {
    this.options = {
      typescript: true,
      includeTypes: true,
      addComments: true,
      ...options,
    };
  }

  /**
   * Generate mapping utility from transformation result
   */
  generateMapping(result: TransformResult): GeneratedMapping {
    const functionName = this.generateFunctionName(result.queryId);
    const mappingCode = this.buildMappingFunction(result);
    
    return {
      fileName: `${result.queryId}.mapping.${this.options.typescript ? 'ts' : 'js'}`,
      content: mappingCode,
      queryId: result.queryId,
      changes: result.changes.length,
    };
  }

  /**
   * Generate multiple mappings from transformation results
   */
  generateMappings(results: TransformResult[]): GeneratedMapping[] {
    return results.map(result => this.generateMapping(result));
  }

  private generateFunctionName(queryId: string): string {
    // Convert query ID to valid function name
    return `map${queryId.replace(/[^a-zA-Z0-9]/g, '')}Response`;
  }

  private buildMappingFunction(result: TransformResult): string {
    const { queryId, changes } = result;
    const functionName = this.generateFunctionName(queryId);
    
    let code = '';
    
    if (this.options.addComments) {
      code += `/**\n`;
      code += ` * Mapping utility for ${queryId}\n`;
      code += ` * Generated on ${new Date().toISOString()}\n`;
      code += ` * Total changes: ${changes.length}\n`;
      code += ` */\n\n`;
    }

    if (this.options.typescript && this.options.includeTypes) {
      code += this.generateTypeDefinitions(result);
    }

    code += `export function ${functionName}(oldResponse${this.options.typescript ? ': any' : ''})${this.options.typescript ? ': any' : ''} {\n`;
    code += `  const newResponse = { ...oldResponse };\n\n`;

    // Generate field mappings
    for (const change of changes) {
      if (change.type === 'field') {
        code += this.generateFieldMapping(change);
      }
    }

    code += `\n  return newResponse;\n`;
    code += `}\n`;

    return code;
  }

  private generateTypeDefinitions(result: TransformResult): string {
    // Simplified type generation - real implementation would analyze the schema
    return `// TODO: Add proper type definitions based on schema analysis\n\n`;
  }

  private generateFieldMapping(change: any): string {
    const { path, oldValue, newValue, reason } = change;
    
    let code = '';
    if (this.options.addComments) {
      code += `  // ${reason}\n`;
    }
    
    code += `  if (newResponse.${oldValue} !== undefined) {\n`;
    code += `    newResponse.${newValue} = newResponse.${oldValue};\n`;
    code += `    delete newResponse.${oldValue};\n`;
    code += `  }\n\n`;
    
    return code;
  }

  /**
   * Generate index file that exports all mappings
   */
  generateIndex(mappings: GeneratedMapping[]): string {
    let code = '// Auto-generated mapping utilities index\n\n';
    
    for (const mapping of mappings) {
      const functionName = this.generateFunctionName(mapping.queryId);
      code += `export { ${functionName} } from './${mapping.fileName.replace(/\.[jt]s$/, '')}';\n`;
    }
    
    return code;
  }
}