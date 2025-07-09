// Main exports for the unified extraction system
export * from './types/index';
export { UnifiedExtractor } from './engine/UnifiedExtractor';
export { ExtractionContext } from './engine/ExtractionContext';
export { ExtractionPipeline } from './engine/ExtractionPipeline';

// Strategies
export { BaseStrategy } from './strategies/BaseStrategy';
export { PluckStrategy } from './strategies/PluckStrategy';
export { ASTStrategy } from './strategies/ASTStrategy';

// Analyzers
export { VariantAnalyzer } from './analyzers/VariantAnalyzer';
export { ContextAnalyzer } from './analyzers/ContextAnalyzer';
export { QueryNameAnalyzer } from './analyzers/QueryNameAnalyzer';

// Resolvers
export { FragmentResolver } from './resolvers/FragmentResolver';
export { NameResolver } from './resolvers/NameResolver';

// Transformers
export { NameNormalizer } from './transformers/NameNormalizer';
export { VariantGenerator } from './transformers/VariantGenerator';
export { FragmentInliner } from './transformers/FragmentInliner';

// Utils
export { SourceMapper } from './utils/SourceMapper';

// Reporters
export { JSONReporter } from './reporters/JSONReporter';
export { HTMLReporter } from './reporters/HTMLReporter';
export { FileReporter } from './reporters/FileReporter';

// Pattern-based system (NEW)
export { QueryPatternService } from './engine/QueryPatternRegistry';
export { QueryMigrator } from './engine/QueryMigrator';
export { QueryNamingService } from './services/QueryNamingService';
export {
  QueryServicesFactory,
  QueryCacheManager,
  createQueryServices,
  createDefaultQueryServices
} from './services/QueryServicesFactory';
export {
  PatternAwareExtraction,
  extractWithPatterns,
  analyzeMigration,
  createPatternServices
} from './PatternAwareExtraction';

// New strategy
export { PatternAwareASTStrategy } from './strategies/PatternAwareASTStrategy';

// New analyzer
export { TemplateResolver } from './analyzers/TemplateResolver';
