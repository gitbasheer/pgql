import { parse, visit, DocumentNode, OperationDefinitionNode, FieldNode } from 'graphql';
import { logger } from './logger.js';

interface NormalizedQuery {
  content: string;
  name: string;
  originalName?: string;
}

export class OperationNameNormalizer {
  private nameCounter: Map<string, number> = new Map();
  
  /**
   * Normalize a query by ensuring it has a proper operation name
   */
  normalizeQuery(content: string, existingName?: string, fileContext?: string): NormalizedQuery {
    try {
      const ast = parse(content);
      const operation = this.findOperation(ast);
      
      if (!operation) {
        throw new Error('No operation definition found');
      }
      
      // If the operation already has a name, use it
      if (operation.name) {
        return {
          content,
          name: operation.name.value,
          originalName: operation.name.value
        };
      }
      
      // Generate a name for unnamed operations
      const generatedName = this.generateOperationName(operation, existingName, fileContext);
      const uniqueName = this.ensureUniqueName(generatedName);
      
      // Add the name to the operation
      const normalizedContent = this.addNameToOperation(content, uniqueName, operation.operation);
      
      return {
        content: normalizedContent,
        name: uniqueName,
        originalName: existingName
      };
    } catch (error) {
      logger.error('Failed to normalize query:', error);
      throw error;
    }
  }
  
  /**
   * Normalize multiple queries, ensuring unique names across all
   */
  normalizeQueries(queries: Array<{ content: string; name?: string; file?: string }>): NormalizedQuery[] {
    this.nameCounter.clear();
    
    return queries.map(query => {
      const fileContext = query.file ? this.extractFileContext(query.file) : undefined;
      return this.normalizeQuery(query.content, query.name, fileContext);
    });
  }
  
  private findOperation(ast: DocumentNode): OperationDefinitionNode | null {
    for (const definition of ast.definitions) {
      if (definition.kind === 'OperationDefinition') {
        return definition;
      }
    }
    return null;
  }
  
  private generateOperationName(
    operation: OperationDefinitionNode, 
    existingName?: string,
    fileContext?: string
  ): string {
    // If we have an existing name (like from the file), use it as base
    if (existingName && existingName !== 'unnamed') {
      return this.pascalCase(existingName);
    }
    
    // Try to generate name from the query structure
    const rootField = this.findMainRootField(operation);
    if (rootField) {
      const baseName = this.createNameFromField(rootField);
      
      // Add operation type prefix if not already present
      const prefix = this.getOperationPrefix(operation.operation);
      if (!baseName.startsWith(prefix)) {
        return prefix + baseName;
      }
      
      return baseName;
    }
    
    // Fallback: use file context if available
    if (fileContext) {
      const cleanContext = this.cleanFileContext(fileContext);
      const prefix = this.getOperationPrefix(operation.operation);
      return prefix + this.pascalCase(cleanContext);
    }
    
    // Last resort: generic name with operation type
    return this.getOperationPrefix(operation.operation) + 'Operation';
  }
  
  private findMainRootField(operation: OperationDefinitionNode): FieldNode | null {
    let mainField: FieldNode | null = null;
    
    visit(operation, {
      Field: {
        enter(node, key, parent) {
          // Only look at root level fields
          if (parent && Array.isArray(parent) && parent.length > 0) {
            const parentNode = parent[0];
            if (parentNode === operation.selectionSet) {
              // Prioritize non-standard root fields (not 'user', 'me', etc.)
              if (!mainField || !['user', 'me', 'viewer'].includes(node.name.value)) {
                mainField = node;
              }
            }
          }
        }
      }
    });
    
    return mainField;
  }
  
  private createNameFromField(field: FieldNode): string {
    const fieldName = field.name.value;
    
    // Special handling for common patterns
    if (fieldName === 'user' || fieldName === 'me' || fieldName === 'viewer') {
      // Look for the next significant field
      const subField = this.findSignificantSubField(field);
      if (subField) {
        return this.pascalCase('Get' + this.pascalCase(subField));
      }
      return 'GetUser';
    }
    
    // Handle field names that are already descriptive
    if (fieldName.includes('By') || fieldName.startsWith('get') || fieldName.startsWith('find')) {
      return this.pascalCase(fieldName);
    }
    
    // For fields like 'venture', 'product', etc.
    return 'Get' + this.pascalCase(fieldName);
  }
  
  private findSignificantSubField(field: FieldNode): string | null {
    if (!field.selectionSet) return null;
    
    let mostSignificant: string | null = null;
    let hasVentures = false;
    
    for (const selection of field.selectionSet.selections) {
      if (selection.kind === 'Field') {
        const fieldName = selection.name.value;
        
        // Look for specific important fields
        if (fieldName === 'ventures') {
          hasVentures = true;
          // Continue looking for more specific fields
        } else if (!['id', '__typename', 'name'].includes(fieldName) && !mostSignificant) {
          mostSignificant = fieldName;
        }
      }
    }
    
    // If we found ventures and nothing more specific, return it
    if (hasVentures && !mostSignificant) {
      return 'ventures';
    }
    
    return mostSignificant;
  }
  
  private getOperationPrefix(operation: 'query' | 'mutation' | 'subscription'): string {
    switch (operation) {
      case 'mutation':
        return '';  // Mutations usually have descriptive names already
      case 'subscription':
        return 'Subscribe';
      default:
        return 'Get';
    }
  }
  
  private ensureUniqueName(baseName: string): string {
    const count = this.nameCounter.get(baseName) || 0;
    this.nameCounter.set(baseName, count + 1);
    
    if (count === 0) {
      return baseName;
    }
    
    // Add variant suffix for duplicates
    return `${baseName}Variant${count + 1}`;
  }
  
  private addNameToOperation(content: string, name: string, operationType: string): string {
    // Simple regex replacement to add the name
    const pattern = new RegExp(`^(\\s*${operationType})(\\s*[\\({])`, 'm');
    const replacement = `$1 ${name}$2`;
    
    // If the content already has whitespace issues, clean them up
    return content.replace(pattern, replacement).trim();
  }
  
  private extractFileContext(filePath: string): string {
    const fileName = filePath.split('/').pop() || '';
    const baseName = fileName.replace(/\.(js|ts|jsx|tsx|graphql|gql)$/, '');
    
    // Clean up common patterns
    return baseName
      .replace(/[-_]queries?$/i, '')
      .replace(/[-_]graphql$/i, '')
      .replace(/^graphql[-_]/i, '');
  }
  
  private cleanFileContext(context: string): string {
    // If it looks like a file path, extract just the filename
    if (context.includes('/')) {
      context = context.split('/').pop() || context;
    }
    
    // Remove file extension
    context = context.replace(/\.(js|ts|jsx|tsx|graphql|gql)$/, '');
    
    // Clean up common patterns
    return context
      .replace(/[-_]queries?$/i, '')
      .replace(/[-_]graphql$/i, '')
      .replace(/^graphql[-_]/i, '');
  }
  
  private pascalCase(str: string): string {
    return str
      .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
      .replace(/^(.)/, c => c.toUpperCase());
  }
}

/**
 * Convenience function to normalize a single query
 */
export function normalizeOperationName(
  content: string, 
  existingName?: string, 
  fileContext?: string
): NormalizedQuery {
  const normalizer = new OperationNameNormalizer();
  return normalizer.normalizeQuery(content, existingName, fileContext);
}

/**
 * Convenience function to normalize multiple queries
 */
export function normalizeOperationNames(
  queries: Array<{ content: string; name?: string; file?: string }>
): NormalizedQuery[] {
  const normalizer = new OperationNameNormalizer();
  return normalizer.normalizeQueries(queries);
}