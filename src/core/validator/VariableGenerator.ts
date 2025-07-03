import { 
  DocumentNode, 
  VariableDefinitionNode,
  TypeNode,
  visit,
  Kind,
  GraphQLSchema,
  buildSchema
} from 'graphql';
import { logger } from '../../utils/logger';
import { VariableGenerator } from './types';

export class VariableGeneratorImpl implements VariableGenerator {
  private schema?: GraphQLSchema;

  constructor(schemaSDL?: string) {
    if (schemaSDL) {
      try {
        this.schema = buildSchema(schemaSDL);
      } catch (error) {
        logger.warn('Failed to build schema for variable generation:', error);
      }
    }
  }

  async generateForQuery(
    query: DocumentNode, 
    schema?: GraphQLSchema
  ): Promise<Record<string, any>[]> {
    const targetSchema = schema || this.schema;
    const variables: VariableDefinitionNode[] = [];

    // Extract variable definitions from the query
    visit(query, {
      VariableDefinition(node) {
        variables.push(node);
      }
    });

    if (variables.length === 0) {
      return [];
    }

    // Generate multiple sets of variables for thorough testing
    const variableSets: Record<string, any>[] = [];

    // Set 1: Default values
    variableSets.push(this.generateDefaultVariables(variables));

    // Set 2: Edge case values
    variableSets.push(this.generateEdgeCaseVariables(variables));

    // Set 3: Realistic values
    variableSets.push(this.generateRealisticVariables(variables));

    return variableSets;
  }

  generateFromExamples(examples: any[]): Record<string, any>[] {
    if (!examples || examples.length === 0) {
      return [];
    }

    // Analyze examples to find common patterns
    const variableSets: Record<string, any>[] = [];
    const keyFrequency: Record<string, number> = {};
    const valueTypes: Record<string, Set<string>> = {};

    // Analyze all examples
    for (const example of examples) {
      for (const [key, value] of Object.entries(example)) {
        keyFrequency[key] = (keyFrequency[key] || 0) + 1;
        
        if (!valueTypes[key]) {
          valueTypes[key] = new Set();
        }
        valueTypes[key].add(typeof value);
      }
    }

    // Generate variations based on analysis
    const commonKeys = Object.keys(keyFrequency).filter(
      key => keyFrequency[key] >= examples.length * 0.5
    );

    // Use examples as base
    variableSets.push(...examples);

    // Generate a minimal set with only common keys
    if (commonKeys.length > 0) {
      const minimalSet: Record<string, any> = {};
      for (const key of commonKeys) {
        const example = examples.find(ex => ex[key] !== undefined);
        if (example) {
          minimalSet[key] = example[key];
        }
      }
      variableSets.push(minimalSet);
    }

    return variableSets;
  }

  generateEdgeCases(type: string): any[] {
    switch (type.toLowerCase()) {
      case 'string':
        return ['', 'a', 'A very long string that might cause issues in some systems'.repeat(10), null];
      
      case 'int':
      case 'integer':
        return [0, 1, -1, 2147483647, -2147483648, null];
      
      case 'float':
      case 'number':
        return [0.0, 1.0, -1.0, 0.00000001, 999999999.99, null];
      
      case 'boolean':
        return [true, false, null];
      
      case 'id':
        return ['1', '0', 'abc123', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '', null];
      
      case 'array':
        return [[], ['item'], ['item1', 'item2'], new Array(100).fill('item'), null];
      
      case 'object':
        return [{}, { key: 'value' }, null];
      
      default:
        return [null, undefined];
    }
  }

  private generateDefaultVariables(variables: VariableDefinitionNode[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const variable of variables) {
      const name = variable.variable.name.value;
      const defaultValue = variable.defaultValue;

      if (defaultValue) {
        result[name] = this.extractDefaultValue(defaultValue);
      } else {
        result[name] = this.getTypeDefaultValue(variable.type);
      }
    }

    return result;
  }

  private generateEdgeCaseVariables(variables: VariableDefinitionNode[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const variable of variables) {
      const name = variable.variable.name.value;
      const typeName = this.getTypeName(variable.type);
      const edgeCases = this.generateEdgeCases(typeName);
      
      // Pick a random edge case
      result[name] = edgeCases[Math.floor(Math.random() * edgeCases.length)];
    }

    return result;
  }

  private generateRealisticVariables(variables: VariableDefinitionNode[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const variable of variables) {
      const name = variable.variable.name.value;
      const typeName = this.getTypeName(variable.type);
      
      result[name] = this.generateRealisticValue(name, typeName);
    }

    return result;
  }

  private getTypeName(type: TypeNode): string {
    if (type.kind === Kind.NON_NULL_TYPE) {
      return this.getTypeName(type.type);
    }
    if (type.kind === Kind.LIST_TYPE) {
      return 'array';
    }
    if (type.kind === Kind.NAMED_TYPE) {
      return type.name.value;
    }
    return 'unknown';
  }

  private getTypeDefaultValue(type: TypeNode): any {
    const typeName = this.getTypeName(type);

    switch (typeName.toLowerCase()) {
      case 'string':
        return '';
      case 'int':
      case 'integer':
      case 'float':
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'id':
        return '1';
      case 'array':
        return [];
      default:
        return null;
    }
  }

  private extractDefaultValue(node: any): any {
    switch (node.kind) {
      case Kind.INT:
        return parseInt(node.value, 10);
      case Kind.FLOAT:
        return parseFloat(node.value);
      case Kind.STRING:
        return node.value;
      case Kind.BOOLEAN:
        return node.value;
      case Kind.NULL:
        return null;
      case Kind.LIST:
        return node.values.map((v: any) => this.extractDefaultValue(v));
      case Kind.OBJECT:
        const obj: Record<string, any> = {};
        for (const field of node.fields) {
          obj[field.name.value] = this.extractDefaultValue(field.value);
        }
        return obj;
      default:
        return null;
    }
  }

  private generateRealisticValue(name: string, typeName: string): any {
    // Use name hints to generate more realistic values
    const lowerName = name.toLowerCase();

    // Common patterns
    if (lowerName.includes('email')) {
      return 'user@example.com';
    }
    if (lowerName.includes('name')) {
      if (lowerName.includes('first')) return 'John';
      if (lowerName.includes('last')) return 'Doe';
      return 'John Doe';
    }
    if (lowerName.includes('phone')) {
      return '+1-555-123-4567';
    }
    if (lowerName.includes('address')) {
      return '123 Main St, Anytown, USA';
    }
    if (lowerName.includes('url') || lowerName.includes('link')) {
      return 'https://example.com';
    }
    if (lowerName.includes('date')) {
      return new Date().toISOString();
    }
    if (lowerName.includes('time')) {
      return new Date().toTimeString();
    }
    if (lowerName === 'id' || lowerName.includes('_id')) {
      return '123e4567-e89b-12d3-a456-426614174000';
    }
    if (lowerName.includes('count') || lowerName.includes('amount')) {
      return 10;
    }
    if (lowerName.includes('price') || lowerName.includes('cost')) {
      return 99.99;
    }
    if (lowerName.includes('enabled') || lowerName.includes('active')) {
      return true;
    }

    // Fall back to type-based generation
    switch (typeName.toLowerCase()) {
      case 'string':
        return 'example-string';
      case 'int':
      case 'integer':
        return 42;
      case 'float':
      case 'number':
        return 3.14;
      case 'boolean':
        return true;
      case 'id':
        return '123';
      case 'array':
        return ['item1', 'item2'];
      default:
        return {};
    }
  }
} 