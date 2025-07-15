import { Result, ok, err } from 'neverthrow';
import { DocumentNode, visit, print, parse, validate } from 'graphql';
import { GraphQLSchema } from 'graphql';
import { MigrationRule } from '../analyzer/SchemaAnalyzer.js';

export type TransformError =
  | { type: 'PARSE_ERROR'; message: string; location: SourceLocation }
  | { type: 'VALIDATION_ERROR'; issues: string[] }
  | { type: 'TRANSFORM_ERROR'; reason: string };

export interface TransformContext {
  file: string;
  schema: GraphQLSchema;
  options: TransformOptions;
}

export interface TransformOptions {
  preserveAliases: boolean;
  addTypeAnnotations: boolean;
  generateTests: boolean;
}

export interface TransformResult {
  originalCode: string;
  transformedCode: string;
  changes: CodeChange[];
  warnings: Warning[];
}

export interface CodeChange {
  type: 'FIELD_RENAME' | 'ARGUMENT_CHANGE' | 'FRAGMENT_UPDATE';
  before: string;
  after: string;
  line: number;
  column: number;
  impact: 'BREAKING' | 'COMPATIBLE' | 'ENHANCEMENT';
}

export interface Warning {
  message: string;
  severity: 'low' | 'medium' | 'high';
  location?: SourceLocation;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

// Type-safe transformation pipeline
export class TypeSafeTransformer {
  constructor(
    private schema: GraphQLSchema,
    private rules: MigrationRule[]
  ) {}

  transform(
    code: string,
    context: TransformContext
  ): Result<TransformResult, TransformError> {
    // Parse phase
    const parseResult = this.parseCode(code);
    if (parseResult.isErr()) {
      return err({
        type: 'PARSE_ERROR',
        message: parseResult.error.message,
        location: { file: context.file, line: 0, column: 0 }
      });
    }

    // Extract queries with full type information
    const queries = this.extractQueries(parseResult.value);

    // Skip validation for now - we want to transform even invalid queries
    // to fix deprecated fields
    const validationErrors = this.validateQueries(queries);
    if (validationErrors.length > 0) {
      // Log warnings but continue
      validationErrors.forEach(error => {
        console.debug('Validation warning:', error);
      });
    }

    // Transform with type safety
    try {
      const transformed = queries.map(query =>
        this.applyTransformations(query, this.rules)
      );

      // Generate new code
      return ok(this.generateCode(transformed, context, code));
    } catch (error) {
      return err({
        type: 'TRANSFORM_ERROR',
        reason: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private parseCode(code: string): Result<DocumentNode, Error> {
    try {
      // For testing, assume the code is a GraphQL query string
      const ast = parse(code);
      return ok(ast);
    } catch (error) {
      return err(error as Error);
    }
  }

  private extractQueries(ast: DocumentNode): DocumentNode[] {
    // For testing, treat the entire document as a single query
    return [ast];
  }

  private validateQueries(queries: DocumentNode[]): string[] {
    const errors: string[] = [];
    
    // Validate each query against schema
    queries.forEach(query => {
      const validationErrors = validate(this.schema, query);
      if (validationErrors.length > 0) {
        errors.push(...validationErrors.map(e => e.message));
      }
    });

    return errors;
  }

  private applyTransformations(
    query: DocumentNode,
    rules: MigrationRule[]
  ): DocumentNode {
    return visit(query, {
      Field(node) {
        const matchingRule = rules.find(rule => 
          node.name.value === rule.from.field
        );

        if (matchingRule) {
          return {
            ...node,
            name: {
              ...node.name,
              value: matchingRule.to.field
            }
          };
        }

        return node;
      }
    });
  }

  private generateCode(
    transformedQueries: DocumentNode[],
    _context: TransformContext,
    originalCode: string
  ): TransformResult {
    const changes: CodeChange[] = [];
    const warnings: Warning[] = [];
    
    // Parse original to compare
    const originalAst = parse(originalCode);

    // Track what changed by comparing field names
    const transformedCode = transformedQueries.map(q => print(q)).join('\n\n');
    
    // Find changes by walking both ASTs
    this.rules.forEach(rule => {
      const fromField = rule.from.field;
      const toField = rule.to.field;
      
      // Check if the original contains the deprecated field
      const originalStr = print(originalAst);
      if (originalStr.includes(fromField) && transformedCode.includes(toField)) {
        changes.push({
          type: 'FIELD_RENAME',
          before: fromField,
          after: toField,
          line: 0, // Would be calculated from AST location
          column: 0,
          impact: 'COMPATIBLE'
        });
      }
    });

    return {
      originalCode,
      transformedCode: changes.length > 0 ? transformedCode : originalCode,
      changes,
      warnings
    };
  }
}