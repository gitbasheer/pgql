// Main entry point with full type safety
export { GraphQLExtractor } from './core/scanner/GraphQLExtractor';
export { ASTScanner } from './core/scanner/ASTScanner';
export { SchemaAnalyzer } from './core/analyzer/SchemaAnalyzer';
export { TypeSafeTransformer } from './core/transformer/TypeSafeTransformer';
export { QueryTransformer } from './core/transformer/QueryTransformer';
export { PatternMatcher } from './core/analyzer/PatternMatcher';

// Export types
export type {
  ExtractedQuery
} from './core/scanner/GraphQLExtractor';

export type {
  QueryExtraction,
  SourceLocation,
  GraphQLType
} from './core/scanner/ASTScanner';

export type {
  DeprecatedField,
  MigrationRule,
  FieldReference,
  BreakingChange
} from './core/analyzer/SchemaAnalyzer';

export type {
  TransformationRule,
  TransformationResult
} from './core/transformer/QueryTransformer';

export type {
  TransformError,
  TransformContext,
  TransformOptions,
  TransformResult,
  CodeChange,
  Warning
} from './core/transformer/TypeSafeTransformer';

export type {
  QueryPattern,
  MigrationPattern
} from './core/analyzer/PatternMatcher';

export type {
  Config
} from './core/config/ConfigValidator';

// Export main tool class
export { GraphQLMigrationTool } from './core/GraphQLMigrationTool';