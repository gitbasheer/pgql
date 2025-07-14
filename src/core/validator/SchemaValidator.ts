// @ts-nocheck
import { GraphQLSchema, validate, parse, DocumentNode, GraphQLError, buildSchema, visit, visitWithTypeInfo, TypeInfo } from 'graphql';
import { loadSchema } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import * as fs from 'fs/promises';
import { logger } from '../../utils/logger';
import { createTwoFilesPatch } from 'diff';
import { SchemaAnalyzer } from '../analyzer/SchemaAnalyzer';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  field?: string;
  type: 'syntax' | 'schema' | 'deprecation' | 'field' | 'type';
  suggestion?: string;
  diff?: string;
}

export interface ValidationWarning {
  message: string;
  field?: string;
  suggestion?: string;
  type: 'deprecation' | 'performance' | 'naming';
}

export class SchemaValidator {
  private schema?: GraphQLSchema;
  private schemaCache: Map<string, GraphQLSchema> = new Map();
  private schemaAnalyzer?: SchemaAnalyzer;

  async loadSchemaFromFile(schemaPath: string): Promise<GraphQLSchema> {
    // Check cache first
    if (this.schemaCache.has(schemaPath)) {
      return this.schemaCache.get(schemaPath)!;
    }

    try {
      // Try loading with GraphQL tools
      const schema = await loadSchema(schemaPath, {
        loaders: [new GraphQLFileLoader()]
      });

      this.schema = schema;
      this.schemaCache.set(schemaPath, schema);
      this.schemaAnalyzer = new SchemaAnalyzer(schema);
      return schema;
    } catch (error) {
      // Fallback to manual loading
      logger.warn('Failed to load schema with GraphQL tools, trying manual load');
      const schemaContent = await fs.readFile(schemaPath, 'utf-8');
      const schema = buildSchema(schemaContent);

      this.schema = schema;
      this.schemaCache.set(schemaPath, schema);
      this.schemaAnalyzer = new SchemaAnalyzer(schema);
      return schema;
    }
  }

  /**
   * Generate actionable error with diff
   */
  private createActionableError(
    error: GraphQLError,
    query: string,
    suggestedFix?: string
  ): ValidationError {
    const baseError: ValidationError = {
      message: error.message,
      locations: error.locations?.map(loc => ({ line: loc.line, column: loc.column })),
      path: error.path ? [...error.path] : undefined,
      type: this.classifyErrorType(error),
      field: error.extensions?.field as string | undefined
    };

    // Add suggestions based on error type
    if (error.message.includes('Cannot query field')) {
      const fieldMatch = error.message.match(/Cannot query field "(.+)" on type "(.+)"/);
      if (fieldMatch) {
        const [, field, type] = fieldMatch;
        baseError.suggestion = `Field '${field}' does not exist on type '${type}'. Check the schema for available fields.`;

        // Generate diff if we have a suggested fix
        if (suggestedFix) {
          baseError.diff = createTwoFilesPatch(
            'original.graphql',
            'suggested.graphql',
            query,
            suggestedFix,
            'Original Query',
            'Suggested Fix'
          );
        }
      }
    } else if (error.message.includes('Unknown type')) {
      const typeMatch = error.message.match(/Unknown type "(.+)"/);
      if (typeMatch) {
        const [, typeName] = typeMatch;
        baseError.suggestion = `Type '${typeName}' is not defined in the schema. Check for typos or missing schema definitions.`;
      }
    } else if (error.message.includes('Variable')) {
      baseError.suggestion = 'Check that all variables are properly defined and match their expected types.';
    }

    return baseError;
  }

  private classifyErrorType(error: GraphQLError): ValidationError['type'] {
    const message = error.message.toLowerCase();

    if (message.includes('syntax')) return 'syntax';
    if (message.includes('deprecated')) return 'deprecation';
    if (message.includes('field')) return 'field';
    if (message.includes('type')) return 'type';

    return 'schema';
  }

  async validateQuery(
    query: string | DocumentNode,
    schemaPath?: string
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Ensure we have a schema
    if (!this.schema && schemaPath) {
      await this.loadSchemaFromFile(schemaPath);
    }

    if (!this.schema) {
      return {
        valid: false,
        errors: [{
          message: 'No schema loaded for validation',
          type: 'schema',
          suggestion: 'Ensure a valid GraphQL schema file is provided'
        }],
        warnings: []
      };
    }

    // Parse the query if it's a string
    let document: DocumentNode;
    let queryString = typeof query === 'string' ? query : '';

    // Preprocess template literals for dynamic patterns
    if (typeof query === 'string') {
      queryString = this.preprocessTemplateLiterals(query);
    }

    try {
      document = typeof query === 'string' ? parse(queryString) : query;
    } catch (error) {
      const syntaxError = error as GraphQLError;
      return {
        valid: false,
        errors: [{
          message: `Syntax error: ${syntaxError.message}`,
          type: 'syntax',
          locations: syntaxError.locations?.map(loc => ({
            line: loc.line,
            column: loc.column
          })),
          suggestion: 'Check for missing brackets, quotes, or invalid GraphQL syntax',
          diff: this.generateSyntaxErrorDiff(queryString, syntaxError)
        }],
        warnings: []
      };
    }

    // Validate against schema
    const validationErrors = validate(this.schema, document);

    if (validationErrors.length > 0) {
      errors.push(...validationErrors.map(err =>
        this.createActionableError(err, queryString)
      ));
    }

    // Check for deprecated field usage
    const deprecationWarnings = this.checkDeprecatedFields(document, this.schema);
    warnings.push(...deprecationWarnings);

    // Check for performance issues
    const performanceWarnings = this.checkPerformanceIssues(document);
    warnings.push(...performanceWarnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  async validateQueries(
    queries: Array<{ content: string; id: string }>,
    schemaPath: string
  ): Promise<Map<string, ValidationResult>> {
    // Load schema once
    await this.loadSchemaFromFile(schemaPath);

    const results = new Map<string, ValidationResult>();

    for (const query of queries) {
      const result = await this.validateQuery(query.content);
      results.set(query.id, result);
    }

    return results;
  }

  private checkDeprecatedFields(
    document: DocumentNode,
    schema: GraphQLSchema
  ): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Initialize schema analyzer if not already done
    if (!this.schemaAnalyzer) {
      this.schemaAnalyzer = new SchemaAnalyzer(schema);
    }

    // Get all deprecated fields from schema
    const deprecatedFields = this.schemaAnalyzer.findDeprecatedFields();

    // Use TypeInfo to track types while traversing
    const typeInfo = new TypeInfo(schema);

    // Visit the query AST
    visit(document, visitWithTypeInfo(typeInfo, {
      Field: (node) => {
        const fieldDef = typeInfo.getFieldDef();
        const parentType = typeInfo.getParentType();

        if (fieldDef && parentType) {
          const typeName = parentType.name;
          const fieldName = node.name.value;

          // Check if this field is deprecated
          const typeDeprecations = deprecatedFields.get(typeName);
          if (typeDeprecations) {
            const deprecatedField = typeDeprecations.find(df => df.fieldName === fieldName);

            if (deprecatedField || fieldDef.deprecationReason) {
              // Get the deprecation info from either our analyzer or the field definition
              const deprecationInfo = deprecatedField || {
                typeName,
                fieldName,
                deprecationReason: fieldDef.deprecationReason || 'This field is deprecated',
                suggestedReplacement: undefined
              };

              warnings.push({
                message: `Field '${typeName}.${fieldName}' is deprecated: ${deprecationInfo.deprecationReason}`,
                field: `${typeName}.${fieldName}`,
                suggestion: deprecationInfo.suggestedReplacement
                  ? `Use '${deprecationInfo.suggestedReplacement}' instead`
                  : this.extractSuggestionFromReason(deprecationInfo.deprecationReason),
                type: 'deprecation'
              });
            }
          }

          // Also check if field definition itself has deprecation
          if (fieldDef.deprecationReason && !warnings.some(w => w.field === `${typeName}.${fieldName}`)) {
            warnings.push({
              message: `Field '${typeName}.${fieldName}' is deprecated: ${fieldDef.deprecationReason}`,
              field: `${typeName}.${fieldName}`,
              suggestion: this.extractSuggestionFromReason(fieldDef.deprecationReason),
              type: 'deprecation'
            });
          }
        }
      }
    }));

    return warnings;
  }

  private extractSuggestionFromReason(reason: string): string {
    // Common patterns in deprecation reasons
    const usePattern = /use\s+['"`]?(\w+(?:\.\w+)*)['"`]?\s*(?:instead)?/i;
    const match = reason.match(usePattern);

    if (match) {
      return `Use '${match[1]}' instead`;
    }

    // If no specific suggestion found, provide generic advice
    return 'Check the schema documentation for alternatives';
  }

  private checkPerformanceIssues(document: DocumentNode): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check for common performance issues
    // - Deep nesting (> 5 levels)
    // - No pagination on list fields
    // - Selecting too many fields

    const depth = this.calculateMaxDepth(document);
    if (depth > 5) {
      warnings.push({
        message: `Query has deep nesting (${depth} levels). Consider breaking into multiple queries.`,
        type: 'performance',
        suggestion: 'Split deeply nested queries for better performance'
      });
    }

    return warnings;
  }

  private calculateMaxDepth(document: DocumentNode): number {
    let maxDepth = 0;

    // Walk the AST and calculate max depth
    // This is simplified - full implementation would use graphql-js visitor

    return maxDepth;
  }

  private generateSyntaxErrorDiff(query: string, error: GraphQLError): string | undefined {
    if (!error.locations || error.locations.length === 0) return undefined;

    const location = error.locations[0];
    const lines = query.split('\n');

    if (location.line > lines.length) return undefined;

    // Create a visual representation of the error location
    const errorLine = lines[location.line - 1];
    const pointer = ' '.repeat(location.column - 1) + '^';

    return `Line ${location.line}:\n${errorLine}\n${pointer}\n${error.message}`;
  }

  generateValidationReport(
    results: Map<string, ValidationResult>
  ): {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
    summary: Array<{
      id: string;
      valid: boolean;
      errorCount: number;
      warningCount: number;
      errors?: ValidationError[];
    }>;
    machineReadable?: {
      version: string;
      timestamp: string;
      exitCode: number;
    };
  } {
    const summary: Array<{
      id: string;
      valid: boolean;
      errorCount: number;
      warningCount: number;
      errors?: ValidationError[];
    }> = [];

    let valid = 0;
    let invalid = 0;
    let totalWarnings = 0;

    for (const [id, result] of results) {
      if (result.valid) {
        valid++;
      } else {
        invalid++;
      }

      totalWarnings += result.warnings.length;

      summary.push({
        id,
        valid: result.valid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        errors: result.errors.length > 0 ? result.errors : undefined
      });
    }

    const report = {
      total: results.size,
      valid,
      invalid,
      warnings: totalWarnings,
      summary,
      // Add machine-readable metadata for CI
      machineReadable: {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        exitCode: invalid > 0 ? 1 : 0
      }
    };

    return report;
  }

  /**
   * Load schema from content string
   */
  async loadSchema(schemaContent: string): Promise<GraphQLSchema> {
    try {
      const schema = buildSchema(schemaContent);
      this.schema = schema;
      return schema;
    } catch (error) {
      throw new Error(`Failed to load schema: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Preprocesses template literals in GraphQL queries for validation
   * @param query - Raw query string that may contain template literals
   * @returns Processed query with template literals replaced by valid GraphQL
   */
  private preprocessTemplateLiterals(query: string): string {
    // Replace ${...} patterns with placeholder values based on context
    let processedQuery = query;

    // Handle query/mutation/subscription name patterns
    processedQuery = processedQuery.replace(
      /(\b(?:query|mutation|subscription)\s+)\$\{[^}]+\}/g,
      '$1DynamicQuery'
    );

    // Handle string interpolations in quotes: "${expr}" → "placeholder"
    processedQuery = processedQuery.replace(
      /"\$\{[^}]+\}"/g,
      '"placeholder"'
    );

    // Handle numeric interpolations: ${expr} → 0 (when in numeric context)
    processedQuery = processedQuery.replace(
      /:\s*\$\{[^}]+\}/g,
      ': 0'
    );

    // Handle field interpolations in GraphQL field position
    processedQuery = processedQuery.replace(
      /\n\s*\$\{[^}]*\?[^}]*:[^}]*\}\s*\n/g,
      (match) => {
        // Extract the field from ternary: ${condition ? 'field' : ''}
        const fieldMatch = match.match(/['"`](\w+)['"`]/);
        return fieldMatch ? `\n            ${fieldMatch[1]}\n` : '\n';
      }
    );

    // Handle getUserV${version} patterns → getUserV1
    processedQuery = processedQuery.replace(
      /(\w+V)\$\{[^}]+\}/g,
      '$1_Dynamic'
    );

    // Handle simple field interpolations: ${fieldName} → fieldName
    processedQuery = processedQuery.replace(
      /\$\{(\w+)\}/g,
      '$1'
    );

    // Handle any remaining complex expressions: ${...} → placeholder
    processedQuery = processedQuery.replace(
      /\$\{[^}]+\}/g,
      'placeholder'
    );

    return processedQuery;
  }

  /**
   * Validate operation against schema
   */
  async validateOperation(ast: DocumentNode, schema: GraphQLSchema): Promise<readonly GraphQLError[]> {
    return validate(schema, ast);
  }
}
