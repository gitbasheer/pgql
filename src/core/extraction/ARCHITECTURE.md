# Unified GraphQL Extraction Pipeline Architecture

## Overview
The unified extraction pipeline combines all existing extraction capabilities into a single, modular system with clear separation of concerns.

## Directory Structure
```
src/core/extraction/
├── index.ts                    # Main exports
├── types/                      # Shared types and interfaces
│   ├── index.ts
│   ├── query.types.ts          # Query-related types
│   ├── variant.types.ts        # Variant-related types
│   └── extraction.types.ts     # Extraction options and results
├── engine/                     # Core extraction engine
│   ├── UnifiedExtractor.ts     # Main extractor class
│   ├── ExtractionContext.ts    # Shared context for extraction
│   └── ExtractionPipeline.ts   # Pipeline orchestrator
├── strategies/                 # Extraction strategies
│   ├── BaseStrategy.ts         # Abstract base strategy
│   ├── PluckStrategy.ts        # graphql-tag-pluck based extraction
│   ├── ASTStrategy.ts          # Babel AST based extraction
│   └── index.ts
├── analyzers/                  # Code analysis modules
│   ├── VariantAnalyzer.ts      # Detects dynamic patterns
│   ├── ContextAnalyzer.ts      # Analyzes surrounding code
│   ├── QueryNameAnalyzer.ts    # Resolves query names
│   └── index.ts
├── resolvers/                  # Resolution modules
│   ├── FragmentResolver.ts     # Fragment resolution
│   ├── ImportResolver.ts       # Import/require resolution
│   ├── NameResolver.ts         # Query name resolution
│   └── index.ts
├── transformers/               # Post-processing transformers
│   ├── NameNormalizer.ts       # Name normalization
│   ├── VariantGenerator.ts     # Variant generation
│   ├── FragmentInliner.ts      # Fragment inlining
│   └── index.ts
├── reporters/                  # Output generation
│   ├── JSONReporter.ts         # JSON output
│   ├── HTMLReporter.ts         # HTML comparison reports
│   ├── FileReporter.ts         # Individual file output
│   └── index.ts
└── utils/                      # Utilities
    ├── cache.ts                # Caching mechanisms
    ├── ast-helpers.ts          # AST utilities
    └── graphql-helpers.ts      # GraphQL utilities
```

## Core Components

### 1. UnifiedExtractor
- Main entry point for all extractions
- Configurable via options
- Manages the extraction pipeline
- Handles caching and optimization

### 2. ExtractionPipeline
- Orchestrates the extraction process
- Applies strategies in order
- Manages transformers and analyzers
- Produces final results

### 3. Strategies
- **PluckStrategy**: Uses graphql-tag-pluck for basic extraction
- **ASTStrategy**: Uses Babel for advanced analysis
- Both strategies can work together

### 4. Analyzers
- **VariantAnalyzer**: Detects conditional patterns
- **ContextAnalyzer**: Extracts surrounding context
- **QueryNameAnalyzer**: Resolves names from various sources

### 5. Transformers
- Applied post-extraction
- Can be chained
- Each transformer is independent

## Extraction Flow
1. **Discovery**: Find files to process
2. **Extraction**: Apply strategies to extract raw queries
3. **Analysis**: Analyze queries for variants, names, etc.
4. **Resolution**: Resolve fragments, imports, names
5. **Transformation**: Apply normalizations and generate variants
6. **Reporting**: Generate requested output formats

## Configuration
```typescript
interface ExtractionOptions {
  // Source options
  directory: string;
  patterns?: string[];
  ignore?: string[];
  
  // Strategy options
  strategies?: ('pluck' | 'ast')[];
  
  // Analysis options
  detectVariants?: boolean;
  analyzeContext?: boolean;
  resolveNames?: boolean;
  
  // Resolution options
  resolveFragments?: boolean;
  resolveImports?: boolean;
  
  // Transformation options
  normalizeNames?: boolean;
  generateVariants?: boolean;
  inlineFragments?: boolean;
  
  // Output options
  reporters?: ('json' | 'html' | 'files')[];
  outputDir?: string;
}
```

## Benefits
1. **Unified Interface**: Single API for all extraction needs
2. **Modular**: Each component has a single responsibility
3. **Extensible**: Easy to add new strategies, analyzers, or transformers
4. **Configurable**: Fine-grained control over the pipeline
5. **Performant**: Shared caching and optimizations
6. **Testable**: Each component can be tested independently