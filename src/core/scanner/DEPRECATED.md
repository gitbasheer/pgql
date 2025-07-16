# DEPRECATED: Legacy Variant Extractors

The following extractors in this directory are **DEPRECATED** and will be removed in the next major version:

- `SmartVariantExtractor`
- `VariantAwareExtractor`
- `AdvancedVariantExtractor`
- `DynamicGraphQLExtractor`
- `EnhancedDynamicExtractor`

## Migration Guide

All functionality has been consolidated into the new **UnifiedVariantExtractor** located at:
`src/core/extraction/strategies/UnifiedVariantExtractor.ts`

### Key Improvements in UnifiedVariantExtractor:

1. **Proper TypeScript support** - No more `(traverse as any).default` hacks
2. **Standardized error handling** - Consistent error reporting and recovery
3. **Babel-powered template resolution** - Uses Babel's AST capabilities for accurate template evaluation
4. **Incremental extraction support** - Only re-processes changed files for better performance
5. **Unified API** - Single extractor with all the best features

### Automatic Migration

Run the migration script to automatically update your code:

```bash
npx ts-node scripts/migrate-to-unified-extractor.ts
```

### Manual Migration

If you're using any of the deprecated extractors directly:

```typescript
// Old
import { EnhancedDynamicExtractor } from './core/scanner/EnhancedDynamicExtractor';
const extractor = new EnhancedDynamicExtractor();

// New
import { UnifiedVariantExtractor } from './core/extraction/strategies/UnifiedVariantExtractor';
const extractor = new UnifiedVariantExtractor(context);
```

### Configuration Changes

If you're using extraction options:

```typescript
// Enable incremental extraction for large codebases
const options: ExtractionOptions = {
  // ... other options
  enableIncrementalExtraction: true,
};
```

### Why Consolidate?

The five different extractors were the result of iterative development without cleanup:

- Each added features but duplicated core functionality
- Inconsistent error handling made debugging difficult
- Manual template parsing was error-prone
- No caching meant poor performance on large codebases

The UnifiedVariantExtractor addresses all these issues with a clean, maintainable implementation.
