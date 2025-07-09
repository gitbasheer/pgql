# Pattern-Based Migration Approach

## Overview

This document describes the new pattern-based migration approach that replaces the problematic query name normalization system. The new approach respects your architecture's complexity while enabling effective migration and deduplication.

## Problems with the Old Approach

### 1. Query Name Complexity was a Red Flag
- Complex `queryNames.js` loading with file system traversal
- Unsafe `eval()` usage for loading query configurations
- Multiple fallback paths and brittle discovery logic

### 2. Enhanced Name Logic was Brittle
- State mutation in `ExtractionContext.normalizeQueryName()`
- Direct modification of query objects in `QueryNameAnalyzer.analyze()`
- Loss of original query structure and intent

### 3. State Mutation During Extraction
- `seenQueryNames` Map modified during analysis
- Query objects mutated with `originalName` and `name` properties
- Race conditions and unpredictable behavior

### 4. TypeScript Workarounds
- `eval()` calls requiring type assertions
- Unsafe AST traversal with missing null checks
- Complex name resolution logic that breaks easily

## The New Pattern-Based Solution

### 1. Track Patterns Instead of Normalizing

Instead of normalizing `${queryNames.byIdV1}` to `getVentureHomeDataByVentureIdDashboard`, we preserve the template and track the pattern metadata:

```typescript
interface PatternExtractedQuery extends ExtractedQuery {
  namePattern?: {
    template: string;        // "${queryNames.byIdV1}"
    resolvedName: string;    // "getVentureHomeDataByVentureIdDashboard"
    possibleValues: string[]; // All possible runtime values
    patternKey: string;      // "getVentureById"
    version: string;         // "V1"
    isDeprecated: boolean;
    migrationPath?: string;  // "V3"
  };
  contentFingerprint?: string; // Hash of normalized AST structure
}
```

### 2. Query Registry System

A registry maps dynamic patterns to all their possible values:

```typescript
const queryRegistry = {
  "getVentureById": {
    versions: ["V1", "V2", "V3", "V3Airo"],
    names: {
      V1: "getVentureHomeDataByVentureIdDashboard",
      V2: "getVentureHomeDataByVentureIdDashboardV2",
      V3: "getVentureHomeDataByVentureIdDashboardV3",
      V3Airo: "getVentureHomeDataByVentureIdDashboardV3Airo"
    },
    deprecations: {
      V1: "Use V3",
      V2: "Use V3"
    },
    fragments: {
      V1: "ventureFields",
      V2: "ventureFields",
      V3: "ventureInfinityStoneDataFields",
      V3Airo: "ventureInfinityStoneDataFields"
    },
    conditions: {
      V3: ["infinityStoneEnabled"],
      V3Airo: ["infinityStoneEnabled", "airoFeatureEnabled"]
    }
  }
};
```

### 3. Smart Migration Strategy

For migrations, we update the `queryNames` object instead of the query string:

```typescript
class QueryMigrator {
  migrateQuery(query: PatternExtractedQuery) {
    if (query.namePattern?.isDeprecated) {
      // Don't change the template, but track what needs updating
      return {
        ...query,
        migrationNotes: {
          currentVersion: query.namePattern.version,
          targetVersion: "V3",
          action: "Update queryNames object, not the query"
        }
      };
    }
    return this.migrateStaticQuery(query);
  }
}
```

### 4. Content-Based Duplicate Detection

Instead of normalizing names, we create a content hash of the AST structure:

```typescript
function getQueryFingerprint(query: PatternExtractedQuery): string {
  // Normalize the AST structure, not the name
  const normalizedAST = removeNamesAndLocations(query.ast);
  return hash(normalizedAST);
}
```

## Usage

### CLI Commands

```bash
# Run pattern-based migration analysis
npx tsx src/cli/pattern-based-migration.ts analyze --directory ./src --verbose

# See demo of old vs new approach
npx tsx src/cli/pattern-based-migration.ts demo

# Save results to file
npx tsx src/cli/pattern-based-migration.ts analyze --output-file ./migration-results.json
```

### Programmatic Usage

```typescript
import {
  QueryPatternService,
  QueryMigrator,
  PatternAwareASTStrategy
} from './src/core/extraction';

// Initialize services
const patternService = new QueryPatternService();
const migrator = new QueryMigrator(patternService);
const strategy = new PatternAwareASTStrategy(patternService);

// Extract queries with pattern awareness
const queries = await strategy.extract(filePath, content);

// Generate migration recommendations
const results = await migrator.migrateQueries(queries);
const summary = migrator.generateMigrationSummary(results);

// Get queryNames object updates
const updates = migrator.generateQueryNamesUpdates(results);
```

### Example Migration Output

```
📊 Migration Analysis Summary
═══════════════════════════════════════════════════════════════════════════════════════════
Total queries analyzed: 45
Queries needing migration: 12
Queries requiring manual review: 3
Pattern-based migrations: 12
Static migrations: 0

🔄 Version Progression
─────────────────────────────────────────────────────────────────────────────────────────
V1 → V3: 8 queries
V2 → V3: 4 queries

🔧 QueryNames Object Updates
─────────────────────────────────────────────────────────────────────────────────────────
byIdV1: getVentureHomeDataByVentureIdDashboard → getVentureHomeDataByVentureIdDashboardV3
  Reason: V1 is deprecated, use V3 with infinity stone support
```

## Benefits

### ✅ Preserves Application Logic
- Dynamic query selection still works
- Feature flags and conditions respected
- Runtime behavior unchanged

### ✅ Enables Safe Migration
- Know exactly what changes where
- Migration recommendations with context
- Manual review flags for complex cases

### ✅ Handles Versioning
- Track V1→V2→V3 progression
- Understand deprecation paths
- Maintain compatibility matrix

### ✅ Supports Feature Flags
- Respect `infinityStoneEnabled` conditions
- Handle `airoFeatureEnabled` logic
- Preserve conditional query selection

### ✅ Content-Based Deduplication
- Find true duplicates regardless of naming
- AST structure comparison
- Pattern-aware grouping

### ✅ No Brittle State Mutations
- Immutable analysis approach
- No side effects during extraction
- Predictable behavior

## Migration Path

1. **Immediate**: Use the new `PatternAwareASTStrategy` for extraction
2. **Phase 1**: Run analysis to understand current patterns
3. **Phase 2**: Generate `queryNames` object updates
4. **Phase 3**: Apply fragment and directive migrations
5. **Phase 4**: Deprecate old normalization logic

## Testing

```bash
# Run pattern-based extraction tests
npm test src/test/core/extraction/PatternBasedExtraction.test.ts

# Test the CLI
npx tsx src/cli/pattern-based-migration.ts demo
```

## Files Added

- `src/core/extraction/types/pattern.types.ts` - New pattern-based types
- `src/core/extraction/engine/QueryPatternRegistry.ts` - Pattern registry service
- `src/core/extraction/engine/QueryMigrator.ts` - Pattern-aware migration
- `src/core/extraction/strategies/PatternAwareASTStrategy.ts` - New extraction strategy
- `src/cli/pattern-based-migration.ts` - CLI for pattern-based analysis
- `src/test/core/extraction/PatternBasedExtraction.test.ts` - Tests

## Architecture Decision

This approach respects your existing architecture while solving the fundamental issues:

1. **No More Normalization**: Preserve the dynamic nature of your queries
2. **Pattern Registry**: Centralized, configurable pattern management
3. **Content Fingerprinting**: True duplicate detection based on structure
4. **Safe Migration**: Update configuration, not application code
5. **Immutable Analysis**: No state mutations during extraction

The pattern-based approach enables effective migration and deduplication while preserving the complexity and flexibility of your existing GraphQL query system.
