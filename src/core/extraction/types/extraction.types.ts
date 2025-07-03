import { ExtractedQuery, ResolvedQuery } from './query.types';
import { QueryVariant, VariantSwitch } from './variant.types';

export interface ExtractionOptions {
  // Source options
  directory: string;
  patterns?: string[];
  ignore?: string[];
  
  // Strategy options
  strategies?: ExtractionStrategy[];
  
  // Analysis options
  detectVariants?: boolean;
  analyzeContext?: boolean;
  resolveNames?: boolean;
  preserveSourceAST?: boolean;
  
  // Resolution options
  resolveFragments?: boolean;
  resolveImports?: boolean;
  fragmentsDirectory?: string;
  
  // Transformation options
  normalizeNames?: boolean;
  generateVariants?: boolean;
  inlineFragments?: boolean;
  namingConvention?: 'pascalCase' | 'camelCase' | 'preserve';
  
  // Output options
  reporters?: ReporterType[];
  outputDir?: string;
  
  // Performance options
  cache?: boolean;
  parallel?: boolean;
  maxConcurrency?: number;
}

export type ExtractionStrategy = 'pluck' | 'ast' | 'hybrid';
export type ReporterType = 'json' | 'html' | 'files' | 'summary';

export interface ExtractionResult {
  queries: ResolvedQuery[];
  variants: QueryVariant[];
  fragments: Map<string, string>;
  switches: Map<string, VariantSwitch>;
  errors: ExtractionError[];
  stats: ExtractionStats;
}

export interface ExtractionError {
  file: string;
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface ExtractionStats {
  totalFiles: number;
  processedFiles: number;
  totalQueries: number;
  totalVariants: number;
  totalFragments: number;
  totalErrors: number;
  duration: number;
  strategy: ExtractionStrategy;
}

export interface ExtractionContext {
  options: ExtractionOptions;
  cache: Map<string, any>;
  fragments: Map<string, string>;
  queryNames: Record<string, string>;
  errors: ExtractionError[];
  stats: Partial<ExtractionStats>;
}