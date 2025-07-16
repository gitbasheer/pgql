# GraphQL Query Extraction System Architecture

## Overview

The GraphQL Query Extraction System is a sophisticated pipeline designed to extract, analyze, and transform GraphQL queries from JavaScript/TypeScript codebases. It supports multi-schema environments (productGraph, offerGraph) and handles complex scenarios including template interpolations, fragments, and dynamic query variants.

## Core Components

### 1. UnifiedExtractor (Main Entry Point)
**Location**: `src/core/extraction/engine/UnifiedExtractor.ts:21`

The UnifiedExtractor orchestrates the entire extraction process through five main phases:

**Key Components**:
- `context: ExtractionContext` - Centralized state container for the extraction process
- `pipeline: ExtractionPipeline` - Manages multi-phase query processing  
- `strategies: Map<string, BaseStrategy>` - Contains 'pluck' and 'ast' extraction strategies

**Extraction Phases**:
1. **Discovery**: Find all relevant files based on patterns
2. **Load Auxiliary Data**: Initialize query naming service and preload fragments
3. **Extract Queries**: Use strategies to extract GraphQL queries from files
4. **Process Pipeline**: Run queries through 4-phase processing pipeline
5. **Finalize Stats**: Collect and return results with statistics

**Strategy Selection**:
- Default mode is 'hybrid' - runs both strategies and prefers AST results
- PluckStrategy for simple, fast extraction
- ASTStrategy for complex queries with better context preservation

**Template Resolution**:
The UnifiedExtractor performs pre-resolution of template content before extraction to handle `${queryNames.xxx}` patterns. This includes:
- Loading queryNames from multiple sources (queryNames.js files)
- Resolving `${queryNames.xxx}` and `${SAMPLE_QUERY_NAMES.xxx}` patterns
- Handling generic template patterns like `${includeEmail}`, `${additionalFields}`

### 2. ExtractionContext (State Management)
**Location**: `src/core/extraction/engine/ExtractionContext.ts:5`

Centralized state container that manages:

**Storage**:
- Configuration options (normalized)
- Project metadata (root directory)
- Shared caches (in-memory)
- Fragment registry
- Query name mappings  
- Extraction errors
- Performance statistics

**Services**:
- `QueryNamingService` for pattern-based naming

**Key Methods**:
- `getCached/setCached`: Cache management for performance
- `addError`: Centralized error collection
- `incrementStat`: Performance tracking
- `finalizeStats`: Generate final statistics

### 3. ExtractionPipeline (4-Phase Processing)
**Location**: `src/core/extraction/engine/ExtractionPipeline.ts:32`

Processes queries through four distinct phases:

**Phase 1 - Pattern-Aware Analysis**:
- Pattern-aware processing (`QueryNamingService`)
- Template interpolation resolution (`TemplateResolver`)
- Context analysis (`ContextAnalyzer`)
- Query name enhancement (`QueryNameAnalyzer`)
- Variant detection (`VariantAnalyzer`)

**Phase 2 - Resolution**:
- Fragment resolution (`FragmentResolver`)
- Name resolution (`NameResolver`)

**Phase 3 - Transformation**:
- Name normalization (`NameNormalizer`)
- Variant generation (`VariantGenerator`)
- Fragment inlining (`FragmentInliner`)

**Phase 4 - Reporting**:
- JSON/HTML/File reporters for output generation

### 4. Extraction Strategies

#### PluckStrategy
**Location**: `src/core/extraction/strategies/PluckStrategy.ts:13`

- Uses `@graphql-tools/graphql-tag-pluck` for regex-based extraction
- Fast but less accurate for complex queries
- Handles manual extraction of templates with interpolations
- Supports multiple GraphQL client libraries (Apollo, Relay, etc.)

#### ASTStrategy  
**Location**: `src/core/extraction/strategies/ASTStrategy.ts:10`

- Uses Babel AST parsing for JavaScript/TypeScript
- Slower but more accurate, especially for complex queries
- Extracts rich context (imports, functions, components)
- Better handling of template interpolations
- Preserves source AST for advanced analysis

### 5. Template Resolution System

#### TemplateResolver
**Location**: `src/core/extraction/analyzers/TemplateResolver.ts:21`

Handles complex template interpolation resolution:
- Resolves `${}` interpolations in GraphQL queries
- Handles conditional expressions: `${condition ? fragment1 : fragment2}`
- Resolves spread operators: `...${fragmentName}`
- Loads fragments from specific files (fragments.js, profileFragments.js, etc.)
- Multiple resolution passes (up to 10 iterations)
- Pattern matching for common variables

### 6. Query Naming and Pattern Analysis

#### QueryNamingService
**Location**: `src/core/extraction/services/QueryNamingService.ts:11`

New centralized service for pattern-based naming:
- Replaces scattered normalization logic
- Uses `QueryPatternService` for pattern analysis
- Handles dynamic patterns and fingerprinting
- Groups duplicates by content fingerprint
- Provides migration recommendations

#### Context vs Template Resolution
- **ContextAnalyzer**: Enhances query metadata (function/component names, exports)
- **TemplateResolver**: Focuses on resolving template literal interpolations
- They work sequentially: TemplateResolver runs first to clean queries

### 7. Fragment Management

#### FragmentResolver
**Location**: `src/core/extraction/resolvers/FragmentResolver.ts:11`

- Cross-file fragment discovery
- Nested fragment resolution  
- Fragment interpolation support
- Fragment inlining option
- Fragment dependency tracking
- Security validation for file paths

### 8. Variant Detection and Generation

#### VariantAnalyzer
**Location**: `src/core/extraction/analyzers/VariantAnalyzer.ts:8`

- Identifies dynamic queries with placeholders
- Detects patterns: ternary operators, template literals
- Calculates possible variant combinations
- Creates VariantSwitch configurations
- Supports nested patterns (2^n combinations for n boolean conditions)

## Key Data Types

### Core Types
- **ExtractedQuery**: Raw query with metadata including AST, location, context
- **ResolvedQuery**: Query after resolution with dependencies
- **PatternExtractedQuery**: Query with pattern analysis metadata
- **QueryVariant**: Specific variant of a dynamic query
- **SourceAST**: Preserved JavaScript/TypeScript AST node with template structure

### Configuration
- **ExtractionOptions**: Comprehensive configuration for strategies, features, performance
- **ExtractionResult**: Final output with queries, variants, fragments, stats

## Performance Features

- **Aggressive Caching**: AST cache, context cache for repeated operations
- **Parallel Processing**: Configurable concurrency for file processing
- **Performance Monitoring**: Decorators track operation timing
- **Incremental Extraction**: Support for processing only changed files

## Error Handling

- Centralized error collection in context
- Graceful degradation (continues on errors)
- File-level error isolation
- Detailed error reporting with location info

## File Discovery and Patterns

- Default patterns: `**/*.{js,jsx,ts,tsx}`
- Configurable ignore patterns (node_modules, __generated__, test files)
- Fragment-specific file loading
- Pattern-based file filtering

## Multi-Schema Support

The system automatically classifies queries by endpoint:
- Detects 'offer-graph' in paths → offerGraph endpoint
- Detects hooks like `useOfferGraphMutation` → offerGraph endpoint  
- Defaults to productGraph endpoint

## Testing Infrastructure

The system includes comprehensive test patterns showing:
- Interpolation examples: `${queryNames.getUserDetails}`, `${additionalFields}`
- Conditional patterns: `${includeEmail ? "email" : ""}`
- Source AST tracking: node type, start/end positions, parent context
- Multiple GraphQL client support
- Variant analysis for complex boolean conditions

## Integration Points

- **Event Bus Placeholders**: Ready for event-driven architecture
- **MCP Exposure**: Functions designed for UI integration
- **LLM Integration**: Placeholders for AI-powered transformations
- **A/B Testing**: Support for Hivemind flags

## Best Practices

1. **Use Hybrid Strategy**: Default mode provides best accuracy
2. **Enable Caching**: Significant performance improvement for large codebases
3. **Preserve Source AST**: Required for advanced transformations
4. **Resolve Fragments**: Ensures complete query analysis
5. **Pattern-Based Naming**: Use QueryNamingService for consistent naming

## Future Enhancements

- Event-driven progress reporting
- Advanced LLM integration for query optimization
- Real-time UI integration for extraction monitoring
- Enhanced security scanning for malicious patterns