// Main entry point with full type safety
export { GraphQLExtractor } from './core/scanner/GraphQLExtractor.js';
export { ASTScanner } from './core/scanner/ASTScanner.js';
export { SchemaAnalyzer } from './core/analyzer/SchemaAnalyzer.js';
export { TypeSafeTransformer } from './core/transformer/TypeSafeTransformer.js';
export { QueryTransformer } from './core/transformer/QueryTransformer.js';
export { PatternMatcher } from './core/analyzer/PatternMatcher.js';

// Export types
export type { ExtractedQuery } from './core/scanner/GraphQLExtractor.js';

export type { QueryExtraction, SourceLocation, GraphQLType } from './core/scanner/ASTScanner.js';

export type {
  DeprecatedField,
  MigrationRule,
  FieldReference,
  BreakingChange,
} from './core/analyzer/SchemaAnalyzer.js';

export type {
  TransformationRule,
  TransformationResult,
} from './core/transformer/QueryTransformer.js';

export type {
  TransformError,
  TransformContext,
  TransformOptions,
  TransformResult,
  CodeChange,
  Warning,
} from './core/transformer/TypeSafeTransformer.js';

export type { QueryPattern, MigrationPattern } from './core/analyzer/PatternMatcher.js';

export type { Config } from './core/config/ConfigValidator.js';

// Export main tool class
export { GraphQLMigrationTool } from './core/GraphQLMigrationTool.js';
