#  GraphQL Migration Tool

A schema-aware GraphQL migration tool that automatically transforms deprecated queries based on your GraphQL schema's `@deprecated` directives. Built for production environments with safety, rollback support, and progressive migration capabilities.

## ⚠️ Important: Production Validation

The tool includes comprehensive schema validation to ensure all queries are production-ready:

```bash
# Validate extracted queries
pnpm validate data/schema.graphql -i extracted-queries.json

# Run full validation pipeline
pnpm validate:pipeline data/schema.graphql
```

**Note**: Queries that reference external fragments will fail validation unless the fragments are included. Consider:
- Extracting fragments along with queries
- Using inline fragments instead of external ones
- Ensuring all GraphQL operations are self-contained

## 🚀 Key Features

### Core Functionality
- **Schema-Aware Transformations**: Automatically extracts deprecation rules from GraphQL schema
- **Smart Field Replacements**: Handles simple renames and nested field restructuring
- **Vague Deprecation Handling**: Comments out fields with unclear migration paths
- **AST-Based Safety**: Uses GraphQL AST for accurate, safe transformations
- **Type Safety**: Written in TypeScript with comprehensive type checking
- **Progressive Migration**: Transform queries incrementally with monitoring
- **Production Ready**: Error handling, logging, and performance optimizations

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/pg-migration-620.git
cd pg-migration-620

# Install dependencies
pnpm install

# Build the project
pnpm build
```

## 🎯 Quick Start

### 1. Extract GraphQL Queries
```bash
pnpm extract data/sample_data
# or with custom patterns
pnpm extract ./src --pattern "**/*.{ts,tsx}" -o extracted-queries.json
```

### 2. Transform Using Schema Deprecations
```bash
# Schema-aware transformation (recommended)
pnpm transform -i extracted-queries.json -s data/schema.graphql --dry-run

# Apply transformations (skip invalid queries)
pnpm transform -i extracted-queries.json -s data/schema.graphql -o transformed --skip-invalid
```

### 3. Apply to Source Files
```bash
# Apply with backups
pnpm apply -i transformed/transformed-queries.json --backup
```

### 4. Analyze Operations
```bash
# Analyze extracted queries for patterns and issues
pnpm analyze extracted-queries.json
```

### 5. Extract Query Variants
```bash
# Extract variants for queries with conditional fragments
pnpm extract-advanced data/sample_data --save-queries

# Validate generated variants
pnpm validate-variants extracted-advanced-variants/queries data/schema.graphql
```

### 6. Production Readiness Check
```bash
# Run full production pipeline assessment
pnpm pipeline --input extracted-queries.json --schema data/schema.graphql --continue-on-error
```

### Complete Example
```bash
# Full pipeline with schema-aware transformations
pnpm extract ./src -o queries.json
pnpm validate data/schema.graphql -i queries.json
pnpm transform -i queries.json -s schema.graphql -o transformed --skip-invalid --dry-run
pnpm transform -i queries.json -s schema.graphql -o transformed --skip-invalid
pnpm apply -i transformed/transformed-queries.json --backup
```

## 📚 Available Commands

### Core Commands
- `pnpm extract` - Extract GraphQL queries from JavaScript/TypeScript files
- `pnpm transform` - Transform queries based on schema deprecations
- `pnpm validate` - Validate queries against GraphQL schema
- `pnpm apply` - Apply transformations back to source files

### Pattern-Based Migration Commands
- `pnpm migrate pattern-migrate` - Run pattern-aware migration with centralized query naming
- `pnpm cli pattern-migrate` - Standalone pattern-based migration tool
- `pnpm cli pattern-migrate --demo` - Demo mode showing pattern detection

### Analysis Commands
- `pnpm analyze` - Analyze GraphQL operations for patterns and issues
- `pnpm pipeline` - Run production readiness assessment
- `pnpm validate:pipeline` - Run validation pipeline

### Variant Commands
- `pnpm extract-variants` - Extract query variants (basic)
- `pnpm extract-advanced` - Extract query variants with conditional fragments
- `pnpm validate-variants` - Validate generated variant files
- `pnpm variants` - Run variant analysis

### Development Commands
- `pnpm type-safe` - Type-safe migration tools
- `pnpm migrate` - Main migration orchestrator
- `pnpm migrate:dev` - Development mode with hot reload

### Utility Commands
- `pnpm build` - Build TypeScript files
- `pnpm test` - Run tests
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier

## 🏗️ Architecture

```
pg-migration-620/
├── src/
│   ├── core/
│   │   ├── scanner/
│   │   │   └── GraphQLExtractor.ts    # Extract queries from JS/TS files
│   │   ├── analyzer/
│   │   │   ├── SchemaDeprecationAnalyzer.ts  # Extract rules from schema
│   │   │   ├── PatternMatcher.ts     # AST pattern analysis
│   │   │   └── ConfidenceScorer.ts   # Score transformation confidence
│   │   ├── transformer/
│   │   │   ├── OptimizedSchemaTransformer.ts  # Production transformer
│   │   │   ├── QueryTransformer.ts   # Legacy manual rules
│   │   │   └── SchemaAwareTransformer.ts  # Schema-based transforms
│   │   ├── safety/
│   │   │   ├── ProgressiveMigration.ts  # Gradual rollout
│   │   │   ├── RollbackManager.ts    # Safe rollback support
│   │   │   └── HealthChecker.ts      # Monitor migration health
│   │   └── MigrationOrchestrator.ts  # Main coordinator
│   ├── cli/
│   │   ├── unified-cli.ts            # Main CLI entry
│   │   └── extract-transform.ts      # Extract & transform CLI
│   └── types/                        # TypeScript definitions
```

## 🔒 Safety Features

### Confidence Scoring
Every transformation is scored based on:
- **Complexity** (30%): Query depth, field count, fragments
- **Pattern Match** (30%): Known safe patterns vs custom
- **Test Coverage** (20%): Existing test safety net
- **Historical Success** (20%): Past migration success rates

### Progressive Rollout
- Start with 1% of traffic
- Monitor error rates and latency
- Automatically pause if issues detected
- Gradual increase (1% → 10% → 25% → 50% → 100%)

### Schema Analysis

The tool analyzes your GraphQL schema for deprecations:

```graphql
type Venture {
  logoUrl: String @deprecated(reason: "Use profile.logoUrl instead")
  profile: Profile
}

type CurrentUser {
  ventures: [Venture] @deprecated(reason: "Use CustomerQuery.ventures")
}
```

### Transformation Examples

**Simple Rename:**
```graphql
# Before
query { venture(id: "123") { name } }

# After
query { ventureNode(id: "123") { name } }
```

**Nested Field:**
```graphql
# Before
query { venture { logoUrl } }

# After
query { venture { profile { logoUrl } } }
```

**Vague Deprecation:**
```graphql
# Before
query { website { accountId, data } }

# After
# DEPRECATED: accountId - Use the billing property
# DEPRECATED: data - Use calculated fields
query { website { } }
```

### Dynamic Fragment Variants

The tool can detect and extract variants for queries with conditional fragments:

```javascript
// Original code with conditional fragment
const query = gql`
  query GetVenture($id: ID!) {
    venture(id: $id) {
      ...${infinityStoneEnabled ? 'ventureFullFields' : 'ventureBasicFields'}
    }
  }
`;
```

Generates two separate queries:
```graphql
# Variant 1: infinityStoneEnabled=true
query GetVenture($id: ID!) {
  venture(id: $id) {
    ...ventureFullFields
  }
}

# Variant 2: infinityStoneEnabled=false
query GetVenture($id: ID!) {
  venture(id: $id) {
    ...ventureBasicFields
  }
}
```

## 🔧 Configuration

Edit `migration.config.yaml`:

```yaml
confidence:
  automatic: 90      # Auto-apply threshold
  semiAutomatic: 70  # Review required
  manual: 0          # Always manual

rollout:
  initial: 1         # Start percentage
  increment: 10      # Increase step
  interval: "1h"     # Between increases
  maxErrors: 0.01    # Error threshold

safety:
  requireApproval: true
  autoRollback: true
  healthCheckInterval: 60
```

## 🛡️ Safety Features

### Confidence Scoring
Every transformation is scored based on:
- **Complexity** (30%): Query depth, field count, fragments
- **Pattern Match** (30%): Known safe patterns vs custom
- **Test Coverage** (20%): Existing test safety net
- **Historical Success** (20%): Past migration success rates

### Progressive Rollout
- Start with 1% of traffic
- Monitor error rates and latency
- Automatically pause if issues detected
- Gradual increase: 1% → 10% → 25% → 50% → 100%

### Health Monitoring
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy',
  successRate: 0.99,
  errorRate: 0.01,
  latency: { p50: 120, p95: 250, p99: 500 }
}
```

## 📊 Migration Workflow

```mermaid
graph LR
    A[Analyze] --> B[Score Confidence]
    B --> C{Score > 90?}
    C -->|Yes| D[Auto Transform]
    C -->|No| E[Manual Review]
    D --> F[Validate]
    E --> F
    F --> G[Progressive Rollout]
    G --> H[Monitor Health]
    H --> I{Healthy?}
    I -->|Yes| J[Increase %]
    I -->|No| K[Rollback]
```

## 🔍 Response Validation & A/B Testing

The tool includes comprehensive response validation to ensure transformed queries return identical data:

### Basic Validation
```bash
# Validate transformations maintain data integrity
pg-migrate \
  --directory ./src \
  --schema ./schema.graphql \
  --validate-responses \
  --validation-endpoint https://api.example.com/graphql \
  --validation-token $API_TOKEN
```

### Advanced Validation with Alignments
```bash
# Compare baseline vs transformed responses
pg-validate compare \
  --baseline ./queries.json \
  --transformed ./transformed.json \
  --endpoint https://api.example.com/graphql \
  --generate-alignments  # Auto-generate fixes for differences
```

### A/B Testing for Safe Rollout
```bash
# Start with 1% traffic split
pg-validate ab-test --start --split 1 --auto-rollback

# Monitor and gradually increase
pg-validate ab-test --graduate test-123
```

### Key Features
- **Deep Response Comparison**: Detects field changes, type mismatches, missing data
- **Auto-Generated Alignments**: Creates transformation functions to fix differences
- **Gradual Rollout**: Progressive traffic splitting with automatic rollback
- **Comprehensive Reports**: HTML, Markdown, JSON, and CSV formats

[Full Response Validation Documentation](docs/response-validation.md)

## 🚨 Emergency Procedures

### Immediate Rollback
```bash
npm run migrate rollback --immediate --reason "Production issue"
```

### Pause Rollout
```bash
npm run migrate monitor
# Then: Ctrl+C to stop increases
```

### Debug Issues
```bash
# Check specific operation health
npm run migrate monitor --operation GetVentures

# View detailed logs
LOG_LEVEL=debug npm run migrate:dev analyze
```

## 🔍 Next Steps

1. **Enhanced Pattern Learning**: ML-based pattern detection from successful migrations
2. **Build Dashboard**: Web UI for monitoring migrations
3. **Add Integration Tests**: Full pipeline testing
4. **Implement Response Transformer**: Runtime response shape transformation
5. **Advanced Pattern Registry**: Support for complex migration scenarios

## 🎯 Pattern-Based Migration

This tool now uses a **pattern-based migration approach** that preserves your application's dynamic query naming logic while enabling safe migrations:

### Key Features
- **Pattern Registry**: Maps dynamic query naming patterns to version information
- **Query Naming Service**: Centralized service for handling all query naming concerns
- **Content-Based Deduplication**: True duplicate detection regardless of naming
- **Safe Migration Strategy**: Updates configuration instead of breaking query strings

### Enabling Pattern-Based Processing

**Automatic Initialization (Recommended)**:
```javascript
// The pattern-based system initializes automatically when using CLI commands
npm run cli pattern-migrate --directory ./src --schema ./schema.graphql
```

**Manual Initialization**:
```javascript
import { createDefaultQueryServices } from './src/core/extraction/services/QueryServicesFactory';
import { ExtractionContext } from './src/core/extraction/engine/ExtractionContext';

// Initialize pattern-based services
const queryServices = await createDefaultQueryServices({
  projectRoot: './src',
  enableIncrementalExtraction: true,
  cacheConfig: {
    memoryLimit: 50 * 1024 * 1024, // 50MB
    ttl: 30 * 60 * 1000, // 30 minutes
  }
});

// Create extraction context with pattern services
const context = new ExtractionContext({
  directory: './src',
  enablePatterns: true
});

// Services are automatically injected via factory pattern
const { namingService, migrator } = queryServices;
```

**Converting Existing queryNames.js**:
```bash
# Convert your existing queryNames.js to pattern registry format
npm run cli convert-querynames --input ./src/queryNames.js --output ./pattern-registry.json

# Validate the conversion
npm run cli validate-migration --before ./extracted-old.json --after ./extracted-new.json
```

### Example Pattern Migration

**Before (problematic normalization)**:
```javascript
// Dynamic query selection
const queryName = conditions.infinity ? 'byIdV2' : 'byIdV1';
const query = gql`query ${queryNames[queryName]} { ... }`;

// ❌ Old approach would break this by normalizing names
```

**After (pattern-based)**:
```javascript
// Dynamic query selection preserved
const queryName = conditions.infinity ? 'byIdV2' : 'byIdV1';
const query = gql`query ${queryNames[queryName]} { ... }`;

// ✅ Pattern system tracks versions and suggests migrations
// Updates queryNames object instead of breaking query strings
```

For detailed information, see [Pattern-Based Migration Guide](PATTERN-BASED-MIGRATION.md).

## 📦 Package Dependencies

### GraphQL & AST Processing
- **graphql** (^16.8.1) - Core GraphQL parsing and validation
- **@graphql-tools/utils** (^10.0.12) - GraphQL utility functions
- **@graphql-tools/graphql-file-loader** (^8.0.0) - Load GraphQL files from filesystem
- **@graphql-tools/load** (^8.0.1) - Universal GraphQL schema/document loader
- **@graphql-tools/graphql-tag-pluck** (^8.0.0) - Extract GraphQL from JS/TS files ⭐
- **@graphql-tools/schema** (^10.0.0) - Schema building and manipulation
- **@graphql-tools/merge** (^9.0.0) - Merge GraphQL schemas and documents
- **@babel/parser** (^7.23.6) - Parse JavaScript/TypeScript to AST
- **@babel/traverse** (^7.23.7) - Traverse and manipulate Babel AST
- **@babel/types** (^7.23.6) - Babel AST type definitions
- **@babel/generator** (^7.23.6) - Generate code from Babel AST

### State Management & Data
- **zustand** (^4.4.7) - Lightweight state management for migration state
- **immer** (^10.0.3) - Immutable state updates for safety
- **zod** (^3.22.4) - Runtime type validation for configs and schemas
- **neverthrow** (^6.1.0) - Type-safe error handling (no try-catch)
- **lokijs** (^1.5.12) - In-memory database for caching analysis results
- **level** (^8.0.0) - Fast key-value storage for baselines and checkpoints

### CLI & User Interface
- **commander** (^11.1.0) - CLI framework for unified command interface
- **inquirer** (^9.2.12) - Interactive prompts for configuration
- **ora** (^8.0.1) - Elegant terminal spinners
- **chalk** (^5.3.0) - Terminal string styling
- **cli-progress** (^3.12.0) - Progress bars for long operations
- **terminal-kit** (^3.0.1) - Advanced terminal UI components

### File System & Performance
- **fast-glob** (^3.3.2) - High-performance file globbing
- **chokidar** (^3.5.3) - File watching for hot-reload support
- **p-limit** (^5.0.0) - Limit concurrent operations
- **p-queue** (^8.0.1) - Promise queue with concurrency control
- **stream-json** (^1.8.0) - Stream processing for large JSON files
- **node-stream-zip** (^1.15.0) - Stream processing for zip archives

### Testing
- **vitest** (^1.1.3) - Fast unit test framework
- **@vitest/ui** (^1.1.3) - Web UI for test results
- **@vitest/coverage-v8** (^1.1.3) - Code coverage reporting
- **@testing-library/dom** (^9.3.3) - DOM testing utilities
- **@testing-library/user-event** (^14.5.2) - User interaction simulation
- **happy-dom** (^13.0.0) - Fast DOM implementation for tests
- **msw** (^2.0.11) - Mock Service Worker for API mocking
- **faker** (^6.6.6) - Generate fake data for tests

### Logging & Monitoring
- **winston** (^3.11.0) - Structured logging framework
- **winston-daily-rotate-file** (^4.7.1) - Log rotation support
- **pino** (^8.17.2) - Super fast JSON logger (alternative)
- **pino-pretty** (^10.3.1) - Pretty print for pino logs

### AI & Pattern Matching
- **natural** (^6.10.0) - Natural language processing for pattern learning
- **string-similarity** (^4.0.4) - Find similar strings for fuzzy matching
- **fastest-levenshtein** (^1.0.16) - Fast string distance calculations
- **fuse.js** (^7.0.0) - Fuzzy search for finding similar queries
- **ml-matrix** (^6.10.7) - Matrix operations for ML features

### Utilities
- **ts-pattern** (^5.0.6) - Exhaustive pattern matching for TypeScript
- **nanoid** (^5.0.4) - Tiny unique ID generator
- **date-fns** (^3.2.0) - Modern date utility library
- **lodash-es** (^4.17.21) - Utility functions (ES modules)
- **dot-prop** (^8.0.2) - Get/set object properties using dot paths
- **serialize-error** (^11.0.3) - Serialize errors for logging

### Configuration
- **cosmiconfig** (^9.0.0) - Find and load configuration files
- **ajv** (^8.12.0) - JSON schema validation
- **dotenv** (^16.3.1) - Load environment variables
- **convict** (^6.2.4) - Configuration management with validation
- **yaml** (^2.3.4) - YAML parser for config files

### Development
- **typescript** (^5.3.3) - TypeScript compiler
- **tsx** (^4.7.0) - TypeScript execute for development
- **tsup** (^8.0.1) - Bundle TypeScript libraries
- **eslint** (^8.56.0) - Code linting
- **prettier** (^3.1.1) - Code formatting
- **@graphql-codegen/core** (^4.0.0) - GraphQL code generation core
- **@graphql-codegen/typescript** (^4.0.0) - TypeScript code generation
- **diff** (^5.1.0) - Create text diffs
- **diff2html** (^3.4.0) - Convert diffs to HTML

## 📝 License

MIT

## 🤖 MCP Server (AI Assistant Integration)

This tool includes a powerful MCP (Model Context Protocol) server that enables natural language interaction through Cursor and other AI assistants.

### Quick Start with MCP
```bash
# The MCP server is already built and ready at:
dist/mcp/server.js

# Just open Cursor and use natural language:
"Help me migrate my GraphQL queries safely"
```

### MCP Documentation
- 📚 **[Complete MCP Guide](docs/MCP-COMPLETE-GUIDE.md)** - Comprehensive documentation
- 🎯 **[Quick Reference](docs/MCP-QUICK-REFERENCE.md)** - Common commands and tools
- 🧪 **[Testing Guide](docs/mcp-server-testing.md)** - How to test the MCP server

### Why Use MCP?
Transform complex CLI commands into simple conversations:
- ❌ **Without MCP**: `pnpm extract src && pnpm transform -i extracted.json -s schema.graphql --dry-run`
- ✅ **With MCP**: "Analyze and transform my GraphQL queries with the new schema"
