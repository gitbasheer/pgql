// UNIFIED TRANSFORMER ARCHITECTURE (RECOMMENDED)
export { BaseTransformer } from './BaseTransformer.js';
export { UnifiedSchemaTransformer } from './UnifiedSchemaTransformer.js';
export { UnifiedQueryTransformer } from './UnifiedQueryTransformer.js';

// Export unified types
export type {
  TransformOptions,
  TransformResult,
  TransformChange,
  TransformWarning,
  TransformContext,
  TransformError,
} from './BaseTransformer.js';

export type { SchemaTransformOptions } from './UnifiedSchemaTransformer.js';
export type { QueryTransformRule, QueryTransformOptions } from './UnifiedQueryTransformer.js';

// LEGACY TRANSFORMERS (DEPRECATED - Use unified transformers above)
/**
 * @deprecated Use UnifiedQueryTransformer instead
 */
export { QueryTransformer } from './QueryTransformer.js';
/**
 * @deprecated Use UnifiedSchemaTransformer instead
 */
export { OptimizedSchemaTransformer } from './OptimizedSchemaTransformer.js';
/**
 * @deprecated Use UnifiedSchemaTransformer instead
 */
export { ProductionSchemaTransformer } from './ProductionSchemaTransformer.js';
/**
 * @deprecated Use UnifiedSchemaTransformer instead
 */
export { SchemaAwareTransformer } from './SchemaAwareTransformer.js';
/**
 * @deprecated Use BaseTransformer with neverthrow pattern instead
 */
export { TypeSafeTransformer } from './TypeSafeTransformer.js';

// Legacy types (deprecated)
/**
 * @deprecated Use unified types from BaseTransformer instead
 */
export type { TransformationRule, TransformationResult } from './QueryTransformer.js';
/**
 * @deprecated Use unified types from BaseTransformer instead
 */
export * from './types.js';
