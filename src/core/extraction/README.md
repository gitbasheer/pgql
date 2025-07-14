# Unified GraphQL Extraction Pipeline

## Overview

The unified extraction pipeline combines all GraphQL extraction capabilities into a single, modular system. It merges functionality from multiple extractors:

- **GraphQLExtractor**: Basic extraction with `graphql-tag-pluck`
- **DynamicGraphQLExtractor**: Conditional fragment detection
- **SmartVariantExtractor**: Advanced AST analysis for variants
- **VariantAwareExtractor**: Context-aware extraction

## Features

- **Multiple extraction strategies**: Pluck-based and AST-based
- **Automatic query name resolution**: From variables like `${queryNames.byIdV3}`
- **Name normalization**: Converts to PascalCase with duplicate detection
- **Variant detection**: Identifies dynamic GraphQL patterns
- **Fragment resolution**: Resolves and inlines fragments
- **Context analysis**: Extracts surrounding code context
- **Multiple output formats**: JSON, HTML, and individual files

## Usage

### CLI

```bash
# Basic extraction
pg-extract extract -d ./src

# With variants
pg-extract extract -d ./src --strategy hybrid --reporters json html files

# Simple extraction without variants
pg-extract simple -d ./src

# Focus on variants
pg-extract variants -d ./src
```

### Programmatic

```typescript
import { UnifiedExtractor, ExtractionOptions } from './core/extraction';

const options: ExtractionOptions = {
  directory: './src',
  detectVariants: true,
  normalizeNames: true,
  reporters: ['json', 'html']
};

const extractor = new UnifiedExtractor(options);
const result = await extractor.extract();

console.log(`Found ${result.queries.length} queries`);
console.log(`Generated ${result.variants.length} variants`);
```

## Architecture

The pipeline follows a clear extraction flow:

1. **Discovery**: Find GraphQL files
2. **Extraction**: Apply strategies (pluck/AST)
3. **Analysis**: Detect variants, analyze context
4. **Resolution**: Resolve fragments and names
5. **Transformation**: Normalize names, generate variants
6. **Reporting**: Generate output in requested formats

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `directory` | string | required | Directory to scan |
| `patterns` | string[] | `['**/*.{js,jsx,ts,tsx}']` | File patterns |
| `strategies` | string[] | `['hybrid']` | Extraction strategies |
| `detectVariants` | boolean | `true` | Enable variant detection |
| `normalizeNames` | boolean | `true` | Normalize query names |
| `namingConvention` | string | `'pascalCase'` | Naming convention |
| `reporters` | string[] | `['json']` | Output formats |

## Example Output

```json
{
  "metadata": {
    "extractedAt": "2024-01-26T10:30:00Z",
    "stats": {
      "totalQueries": 30,
      "totalVariants": 12,
      "totalFragments": 5
    }
  },
  "queries": [{
    "name": "GetUserData",
    "originalName": "getUserData",
    "type": "query",
    "content": "query GetUserData { ... }"
  }]
}
```