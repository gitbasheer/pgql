import { GraphQLSchema, parse, validate, GraphQLError } from 'graphql';
import { logger } from '../../utils/logger.js';

export enum QueryClassification {
  VALID = 'valid',
  SYNTAX_ERROR = 'syntax_error',
  WRONG_SCHEMA = 'wrong_schema',
  PARTIAL_MATCH = 'partial_match',
}

export interface ClassificationResult {
  queryId: string;
  classification: QueryClassification;
  errors?: string[];
  confidence: number;
  suggestedSchema?: string;
  details?: {
    missingTypes?: string[];
    missingFields?: string[];
    validFields?: string[];
    totalFields?: number;
  };
}

export class SmartQueryClassifier {
  constructor(
    private schemas: Map<string, GraphQLSchema>,
    private defaultSchemaName: string = 'ProductGraph',
  ) {}

  classifyQuery(queryId: string, queryContent: string): ClassificationResult {
    // Step 1: Check syntax
    let ast;
    try {
      ast = parse(queryContent);
    } catch (error) {
      return {
        queryId,
        classification: QueryClassification.SYNTAX_ERROR,
        errors: [error instanceof Error ? error.message : 'Unknown syntax error'],
        confidence: 1.0,
      };
    }

    // Step 2: Validate against available schemas
    const schemaResults: Array<{
      schemaName: string;
      errors: readonly GraphQLError[];
      matchScore: number;
    }> = [];

    for (const [schemaName, schema] of this.schemas) {
      const errors = validate(schema, ast);
      const matchScore = this.calculateMatchScore(ast, schema, errors);

      schemaResults.push({
        schemaName,
        errors,
        matchScore,
      });
    }

    // Step 3: Classify based on results
    const bestMatch = schemaResults.reduce((best, current) =>
      current.matchScore > best.matchScore ? current : best,
    );

    // If perfect match with any schema
    if (bestMatch.errors.length === 0) {
      return {
        queryId,
        classification: QueryClassification.VALID,
        confidence: 1.0,
        suggestedSchema: bestMatch.schemaName,
      };
    }

    // If high match score but has errors, likely the right schema with some issues
    if (bestMatch.matchScore > 0.7) {
      return {
        queryId,
        classification: QueryClassification.PARTIAL_MATCH,
        errors: bestMatch.errors.map((e) => e.message),
        confidence: bestMatch.matchScore,
        suggestedSchema: bestMatch.schemaName,
        details: this.extractErrorDetails(bestMatch.errors),
      };
    }

    // Low match score suggests wrong schema
    return {
      queryId,
      classification: QueryClassification.WRONG_SCHEMA,
      errors: bestMatch.errors.slice(0, 5).map((e) => e.message), // First 5 errors
      confidence: bestMatch.matchScore,
      suggestedSchema: this.suggestAlternativeSchema(ast, queryContent),
      details: this.extractErrorDetails(bestMatch.errors),
    };
  }

  private calculateMatchScore(
    ast: any,
    schema: GraphQLSchema,
    errors: readonly GraphQLError[],
  ): number {
    // Extract all field references from the query
    const queryFields = this.extractFieldReferences(ast);

    // Count how many fields exist in the schema
    let validFields = 0;
    const totalFields = queryFields.size;

    for (const field of queryFields) {
      if (this.fieldExistsInSchema(field, schema)) {
        validFields++;
      }
    }

    // Calculate base score from field matches
    const fieldMatchRatio = totalFields > 0 ? validFields / totalFields : 0;

    // Penalize based on error count
    const errorPenalty = Math.min(errors.length * 0.1, 0.5);

    // Final score
    return Math.max(0, fieldMatchRatio - errorPenalty);
  }

  private extractFieldReferences(ast: any): Set<string> {
    const fields = new Set<string>();
    const visited = new WeakSet();

    // Simple visitor to collect field names
    const visit = (node: any, parentType?: string) => {
      // Avoid circular references
      if (!node || typeof node !== 'object' || visited.has(node)) {
        return;
      }
      visited.add(node);

      if (node.kind === 'Field') {
        const fieldName = node.name.value;
        if (parentType) {
          fields.add(`${parentType}.${fieldName}`);
        } else {
          fields.add(fieldName);
        }
      }

      // Recursively visit all properties
      for (const key in node) {
        if (key === 'loc') continue; // Skip location info

        const value = node[key];
        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            value.forEach((item) => visit(item, parentType));
          } else {
            visit(value, parentType);
          }
        }
      }
    };

    visit(ast);
    return fields;
  }

  private fieldExistsInSchema(fieldRef: string, schema: GraphQLSchema): boolean {
    // Simple check - could be enhanced to check actual types
    const [typeName, fieldName] = fieldRef.includes('.')
      ? fieldRef.split('.')
      : ['Query', fieldRef];

    const type = schema.getType(typeName || 'Query');
    if (!type || !('getFields' in type)) return false;

    const fields = (type as any).getFields();
    return fieldName ? fieldName in fields : false;
  }

  private extractErrorDetails(errors: readonly GraphQLError[]): any {
    const missingTypes = new Set<string>();
    const missingFields = new Set<string>();

    errors.forEach((error) => {
      // Parse error messages for missing types/fields
      const typeMatch = error.message.match(/Unknown type "([^"]+)"/);
      if (typeMatch) {
        missingTypes.add(typeMatch[1]);
      }

      const fieldMatch = error.message.match(/Cannot query field "([^"]+)"/);
      if (fieldMatch) {
        missingFields.add(fieldMatch[1]);
      }
    });

    return {
      missingTypes: Array.from(missingTypes),
      missingFields: Array.from(missingFields),
    };
  }

  private suggestAlternativeSchema(ast: any, queryContent: string): string | undefined {
    // Look for hints in the query that suggest which API it belongs to

    // Check for Offer Graph indicators
    if (
      queryContent.includes('basket') ||
      queryContent.includes('offer') ||
      queryContent.includes('ModifyBasket')
    ) {
      return 'OfferGraph';
    }

    // Check for specific field patterns
    const fields = this.extractFieldReferences(ast);

    if (
      Array.from(fields).some(
        (f) => f.includes('venture') || f.includes('project') || f.includes('website'),
      )
    ) {
      return 'ProductGraph';
    }

    return undefined;
  }

  classifyBatch(queries: Array<{ id: string; content: string }>): ClassificationResult[] {
    return queries.map((q) => this.classifyQuery(q.id, q.content));
  }

  generateReport(results: ClassificationResult[]): {
    summary: Record<QueryClassification, number>;
    bySchema: Record<string, number>;
    recommendations: string[];
  } {
    const summary: Record<QueryClassification, number> = {
      [QueryClassification.VALID]: 0,
      [QueryClassification.SYNTAX_ERROR]: 0,
      [QueryClassification.WRONG_SCHEMA]: 0,
      [QueryClassification.PARTIAL_MATCH]: 0,
    };

    const bySchema: Record<string, number> = {};

    results.forEach((result) => {
      summary[result.classification]++;

      if (result.suggestedSchema) {
        bySchema[result.suggestedSchema] = (bySchema[result.suggestedSchema] || 0) + 1;
      }
    });

    const recommendations: string[] = [];

    if (summary[QueryClassification.WRONG_SCHEMA] > 0) {
      recommendations.push(
        `${summary[QueryClassification.WRONG_SCHEMA]} queries appear to be for different GraphQL APIs. ` +
          `Consider adding schemas for: ${Object.keys(bySchema)
            .filter((s) => !this.schemas.has(s))
            .join(', ')}`,
      );
    }

    if (summary[QueryClassification.SYNTAX_ERROR] > 0) {
      recommendations.push(
        `${summary[QueryClassification.SYNTAX_ERROR]} queries have syntax errors and need to be fixed before migration.`,
      );
    }

    if (summary[QueryClassification.PARTIAL_MATCH] > 0) {
      recommendations.push(
        `${summary[QueryClassification.PARTIAL_MATCH]} queries partially match the schema but have field mismatches. ` +
          `These are good candidates for migration.`,
      );
    }

    return { summary, bySchema, recommendations };
  }
}
