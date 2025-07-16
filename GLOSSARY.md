# 📚 Pattern-Based Migration Glossary

## Core Concepts

### **Pattern Registry**

A centralized configuration system that maps dynamic query naming patterns to their version information, deprecation status, and migration paths.

```typescript
interface QueryPatternRegistry {
  [key: string]: {
    versions: string[]; // ["V1", "V2", "V3", "V3Airo"]
    names: Record<string, string>; // V1 → actual query name mapping
    deprecations: Record<string, string>; // Deprecation reasons
    fragments: Record<string, string>; // Fragment associations
    conditions: Record<string, string[]>; // Feature flag conditions
  };
}
```

**Example:**

```typescript
const registry = {
  getVentureById: {
    versions: ['V1', 'V2', 'V3'],
    names: {
      V1: 'getVentureHomeDataByVentureIdDashboard',
      V3: 'getVentureHomeDataByVentureIdDashboardV3',
    },
    deprecations: { V1: 'Use V3' },
  },
};
```

---

### **Content Fingerprint**

A hash-based identifier generated from the normalized AST structure of a GraphQL query, used for detecting duplicate queries regardless of their naming patterns.

**Purpose:**

- Identifies duplicate queries with different names
- Ignores operation names and location data
- Focuses on query structure and field selection

**Example:**

```typescript
// These queries have the same fingerprint:
query ${queryNames.byIdV1} { venture { id name } }  // Fingerprint: abc123
query ${queryNames.byIdV2} { venture { id name } }  // Fingerprint: abc123
query getVentureStatic { venture { id name } }      // Fingerprint: abc123
```

---

### **Dynamic Query Template**

A GraphQL query that uses runtime interpolation to determine its operation name, typically through `${queryNames.property}` syntax.

**Characteristics:**

- Uses template literals with interpolation
- Operation name determined at runtime
- Enables feature flag-based query selection
- Preserves application logic flexibility

**Example:**

```typescript
// Dynamic template - name resolved at runtime
const query = gql`
  query ${queryNames.byIdV1} {
    venture(id: $ventureId) {
      ...ventureFields
    }
  }
`;

// vs Static query - name hardcoded
const query = gql`
  query getVentureById {
    venture(id: $ventureId) {
      id
      name
    }
  }
`;
```

---

### **Migration Manifest**

A configuration object that defines migration rules, target patterns, and transformation mappings for deprecated query patterns.

```typescript
interface MigrationManifest {
  patterns: Record<
    string,
    {
      to: string; // Target pattern
      fragments: { old: string; new: string }; // Fragment migrations
      conditions?: string[]; // Required feature flags
      deprecationReason?: string; // Why deprecated
    }
  >;
  globalReplacements: Array<{
    from: string;
    to: string;
    type: 'fragment' | 'directive' | 'field';
  }>;
}
```

**Example:**

```typescript
const manifest = {
  patterns: {
    'queryNames.byIdV1': {
      to: 'queryNames.byIdV3',
      fragments: {
        old: 'ventureFields',
        new: 'ventureInfinityStoneDataFields',
      },
      conditions: ['infinityStoneEnabled'],
      deprecationReason: 'V1 deprecated, use V3 with infinity stone support',
    },
  },
};
```

---

## Service Architecture

### **Query Services Factory**

A factory pattern implementation that creates and manages the lifecycle of pattern-based query services, eliminating tight coupling and providing centralized configuration.

**Benefits:**

- Single point of service creation
- Automatic dependency injection
- Service caching and reuse
- Consistent configuration management

**Usage:**

```typescript
// ✅ Factory approach (loose coupling)
const services = await createDefaultQueryServices(options);
const { namingService, migrator } = services;

// ❌ Manual approach (tight coupling)
const patternService = new QueryPatternService();
const namingService = new QueryNamingService(patternService);
const migrator = new QueryMigrator(patternService);
```

---

### **Query Naming Service**

A centralized service that handles all query naming concerns, replacing scattered normalization logic with pattern-based processing.

**Responsibilities:**

- Process queries with pattern awareness
- Group queries by content fingerprint
- Generate migration recommendations
- Maintain immutable analysis approach

---

### **Pattern-Aware AST Strategy**

An enhanced extraction strategy that preserves template literal structures while capturing pattern metadata for migration analysis.

**Key Features:**

- Preserves `${queryNames.property}` interpolations
- Captures source AST information
- Generates content fingerprints
- No state mutations during extraction

---

## Migration Concepts

### **Version Progression**

The tracking of how query patterns evolve through different versions, typically following a V1 → V2 → V3 progression with deprecation warnings.

**Example Progression:**

```
V1 (Deprecated) → V3 (Current)
V2 (Deprecated) → V3 (Current)
V3Airo (Feature-flagged) → Available when airoFeatureEnabled
```

---

### **Safe Migration Strategy**

An approach that preserves application logic by updating configuration objects instead of modifying query strings directly.

**Principles:**

- Preserve dynamic query selection logic
- Update `queryNames` object, not query content
- Respect feature flag conditions
- Provide clear migration guidance

**Example:**

```typescript
// Instead of changing the query:
// query getVentureHomeDataByVentureIdDashboard { ... }
// ↓ (BREAKS dynamic selection)
// query getVentureHomeDataByVentureIdDashboardV3 { ... }

// Preserve the template:
// query ${queryNames.byIdV1} { ... }
// And update configuration:
// queryNames.byIdV1 → points to V3 query name
```

---

### **Pattern-Based Migration**

A migration approach that tracks and processes dynamic query patterns while preserving their runtime flexibility.

**vs Traditional Normalization:**

- **Old**: Normalize `${queryNames.byIdV1}` → `getVentureHomeDataByVentureIdDashboard`
- **New**: Preserve pattern, track metadata, recommend config changes

---

## Technical Terms

### **AST Normalization**

The process of removing location data, operation names, and other non-structural elements from a GraphQL AST to enable structural comparison.

**Purpose:**

- Enable duplicate detection based on query structure
- Ignore naming differences
- Focus on field selection and query logic

---

### **Template Literal Interpolation**

JavaScript template literal syntax that allows embedding expressions within string templates.

```typescript
// Template literal with interpolation
const query = gql`query ${operationName} { ... }`;

// vs Regular string concatenation
const query = gql`query ` + operationName + ` { ... }`;
```

---

### **Immutable Analysis**

An approach to query processing that doesn't modify the original query objects during analysis, instead returning new objects with additional metadata.

**Benefits:**

- Predictable behavior
- No side effects
- Easier debugging and testing
- Avoids race conditions

---

### **Cache Eviction Strategy**

The algorithm used to remove entries from cache when memory limits are reached, typically using LRU (Least Recently Used) or TTL (Time To Live) approaches.

**Strategies:**

- **LRU**: Remove oldest accessed entries first
- **TTL**: Remove expired entries based on timestamp
- **Size-based**: Remove entries when total size exceeds limit

---

### **Incremental Extraction**

A performance optimization that processes only files that have changed since the last analysis, reducing processing time for large codebases.

**Implementation:**

- Track file modification timestamps
- Maintain cache of previous analysis results
- Only re-process changed files
- Merge results with cached data

---

## CLI and Configuration

### **Pattern CLI**

Command-line interface tools for pattern-based migration analysis and management.

**Main Commands:**

- `analyze`: Run pattern-aware extraction and migration analysis
- `demo`: Show difference between old and new approaches
- `pattern-migrate`: Integrated CLI command in unified tool

---

### **Extraction Options**

Configuration object that controls how GraphQL queries are extracted and processed.

```typescript
interface ExtractionOptions {
  directory: string; // Root directory to scan
  patterns: string[]; // File patterns to match
  ignore?: string[]; // Patterns to exclude
  resolveNames?: boolean; // Enable name resolution
  enableIncrementalExtraction?: boolean; // Only process changed files
  // ... other options
}
```

---

### **Services Configuration**

Configuration object for the query services factory that controls caching, performance, and behavior settings.

```typescript
interface QueryServicesConfig {
  options: ExtractionOptions;
  enableCaching?: boolean; // Enable result caching
  cacheMaxSize?: number; // Maximum cache size in bytes
  cacheTTL?: number; // Cache time-to-live in milliseconds
  enableIncrementalExtraction?: boolean;
  patternRegistryPath?: string; // Path to external pattern config
}
```

---

## Backward Compatibility

### **Deprecated API**

Methods and classes marked as `@deprecated` that will be removed in future versions but continue to work with warnings.

**Examples:**

- `ExtractionContext.normalizeQueryName()` → Use `QueryNamingService.processQuery()`
- `UnifiedExtractor.loadQueryNames()` → Handled automatically by factory
- Manual service instantiation → Use `createDefaultQueryServices()`

---

### **Migration Path**

The planned progression for transitioning from deprecated APIs to new pattern-based approaches.

**Phases:**

1. **Phase 1**: Mark old methods as deprecated, add warnings
2. **Phase 2**: New pattern-based system handles all processing
3. **Phase 3**: Remove deprecated methods (future release)

---

## Performance Terms

### **Hit Rate**

The percentage of cache requests that are successfully served from cache rather than requiring recomputation.

**Formula:** `Hit Rate = Cache Hits / Total Requests * 100`

**Good Performance:** 80%+ hit rate for pattern analysis operations

---

### **Memory Pressure**

The state when cache usage approaches configured limits, triggering eviction strategies.

**Indicators:**

- High eviction frequency
- Low hit rates
- Frequent cache misses
- Performance degradation

---

### **Cold Cache**

Initial state when cache is empty and all requests require computation.

**vs Warm Cache:** State after cache has been populated with frequently accessed data.

---

This glossary provides the foundation for understanding the pattern-based migration system. For practical examples and troubleshooting, see the [Troubleshooting Guide](./TROUBLESHOOTING.md) and [Integration Documentation](./INTEGRATION-COMPLETE.md).
