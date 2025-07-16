# GraphQL Migration Tool - Architecture & Process Diagrams

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph "External Interfaces"
        CLI[CLI Commands<br/>src/cli/*]
        MCP[MCP Server<br/>src/mcp/server.ts]
        API[Programmatic API<br/>src/index.ts]
    end

    subgraph "Core Engine"
        ORCH[Migration Orchestrator<br/>src/core/MigrationOrchestrator.ts]
        PIPE[Unified Pipeline<br/>src/core/pipeline/UnifiedMigrationPipeline.ts]
        TOOL[GraphQL Migration Tool<br/>src/core/GraphQLMigrationTool.ts]
    end

    subgraph "Processing Components"
        EXT[Extraction Engine<br/>src/core/extraction/*]
        TRANS[Transformation Engine<br/>src/core/transformer/*]
        VAL[Validation Engine<br/>src/core/validator/*]
        APP[Application Engine<br/>src/core/applicator/*]
    end

    subgraph "Safety & Monitoring"
        HEALTH[Health Check<br/>src/core/safety/HealthCheck.ts]
        PROG[Progressive Migration<br/>src/core/safety/ProgressiveMigration.ts]
        ROLL[Rollback System<br/>src/core/safety/Rollback.ts]
        PERF[Performance Monitor<br/>src/core/monitoring/PerformanceMonitor.ts]
    end

    subgraph "Support Services"
        CACHE[Cache Manager<br/>src/core/cache/CacheManager.ts]
        GITHUB[GitHub Integration<br/>src/core/integration/GitHubService.ts]
        CONFIG[Config Validator<br/>src/core/config/ConfigValidator.ts]
    end

    CLI --> ORCH
    MCP --> ORCH
    API --> TOOL

    ORCH --> PIPE
    PIPE --> EXT
    PIPE --> TRANS
    PIPE --> VAL
    PIPE --> APP

    PIPE --> HEALTH
    PIPE --> PROG
    PIPE --> ROLL

    EXT --> CACHE
    VAL --> CACHE
    ORCH --> GITHUB

    PERF --> PIPE

    style CLI fill:#e1f5e1
    style MCP fill:#ffe1e1
    style API fill:#e1e1ff
    style PIPE fill:#fff3e1
    style HEALTH fill:#ffe1f5
    style PROG fill:#f5e1ff
    style ROLL fill:#e1ffff
```

## 2. Migration Pipeline Flow

```mermaid
flowchart LR
    subgraph "Input Phase"
        SOURCE[Source Code<br/>*.ts, *.tsx, *.js, *.jsx]
        SCHEMA[GraphQL Schema<br/>schema.graphql]
        CONFIG[Configuration<br/>pg-migration.config.js]
    end

    subgraph "Extraction Phase"
        SCAN[Code Scanner<br/>src/core/scanner/*]
        EXTRACT[Query Extractor<br/>src/core/extraction/UnifiedExtractor.ts]
        ANALYZE[Query Analyzer<br/>src/core/extraction/analyzers/*]

        SOURCE --> SCAN
        SCAN --> EXTRACT
        EXTRACT --> ANALYZE
        ANALYZE --> QUERIES[Extracted Queries<br/>JSON Format]
    end

    subgraph "Analysis Phase"
        DEPRECATION[Deprecation Analyzer<br/>src/core/analyzer/SchemaDeprecationAnalyzer.ts]
        PATTERN[Pattern Matcher<br/>src/core/analyzer/PatternMatcher.ts]
        CONFIDENCE[Confidence Scorer<br/>src/core/analyzer/ConfidenceScorer.ts]

        QUERIES --> DEPRECATION
        SCHEMA --> DEPRECATION
        DEPRECATION --> PATTERN
        PATTERN --> CONFIDENCE
        CONFIDENCE --> REPORT[Analysis Report]
    end

    subgraph "Transformation Phase"
        TRANSFORMER[Schema Transformer<br/>src/core/transformer/OptimizedSchemaTransformer.ts]
        VALIDATOR[Transform Validator<br/>src/core/validator/SchemaValidator.ts]

        REPORT --> TRANSFORMER
        TRANSFORMER --> VALIDATOR
        VALIDATOR --> TRANSFORMED[Transformed Queries]
    end

    subgraph "Validation Phase"
        RESPONSE[Response Validator<br/>src/core/validator/ResponseValidationService.ts]
        COMPARATOR[Response Comparator<br/>src/core/validator/ResponseComparator.ts]
        SEMANTIC[Semantic Validator<br/>src/core/validator/SemanticValidator.ts]

        TRANSFORMED --> RESPONSE
        RESPONSE --> COMPARATOR
        COMPARATOR --> SEMANTIC
        SEMANTIC --> VALIDATED[Validated Queries]
    end

    subgraph "Application Phase"
        APPLICATOR[AST Code Applicator<br/>src/core/applicator/ASTCodeApplicator.ts]
        CALCULATOR[Change Calculator<br/>src/core/applicator/MinimalChangeCalculator.ts]

        VALIDATED --> APPLICATOR
        APPLICATOR --> CALCULATOR
        CALCULATOR --> OUTPUT[Updated Source Files]
    end

    style SOURCE fill:#e1f5e1
    style SCHEMA fill:#e1f5e1
    style CONFIG fill:#e1f5e1
    style OUTPUT fill:#ffe1e1
```

## 3. CLI Command Architecture

```mermaid
graph TB
    subgraph "CLI Entry Points"
        MAIN[main-cli.ts<br/>Primary Entry]
        UNIFIED[unified-cli.ts<br/>Unified Commands]
        COMPAT[cli-wrapper.ts<br/>Compatibility Layer]
    end

    subgraph "Core Commands"
        EXTRACT_CMD[extract-transform.ts<br/>Extract & Transform]
        MIGRATE_CMD[migrate.ts<br/>Full Migration]
        VALIDATE_CMD[validate-responses.ts<br/>Response Validation]
        ANALYZE_CMD[analyze-operations.ts<br/>Operation Analysis]
    end

    subgraph "Advanced Commands"
        PATTERN[pattern-based-migration.ts<br/>Pattern Migration]
        VARIANT[extract-variants.ts<br/>Variant Extraction]
        PR[generate-pr.ts<br/>PR Generation]
        CONVERT[convert-querynames.ts<br/>Query Name Conversion]
    end

    subgraph "Output Adapters"
        OUTPUT[output-adapter.ts<br/>Format Adapter]
        JSON[JSON Output]
        TEXT[Text Output]
        HTML[HTML Output]
    end

    MAIN --> UNIFIED
    UNIFIED --> COMPAT

    COMPAT --> EXTRACT_CMD
    COMPAT --> MIGRATE_CMD
    COMPAT --> VALIDATE_CMD
    COMPAT --> ANALYZE_CMD

    COMPAT --> PATTERN
    COMPAT --> VARIANT
    COMPAT --> PR
    COMPAT --> CONVERT

    EXTRACT_CMD --> OUTPUT
    MIGRATE_CMD --> OUTPUT
    VALIDATE_CMD --> OUTPUT
    ANALYZE_CMD --> OUTPUT

    OUTPUT --> JSON
    OUTPUT --> TEXT
    OUTPUT --> HTML

    style MAIN fill:#e1f5e1
    style COMPAT fill:#ffe1e1
    style OUTPUT fill:#e1e1ff
```

## 4. Extraction Strategy Hierarchy

```mermaid
classDiagram
    class BaseStrategy {
        <<abstract>>
        +extract(content: string): Query[]
        +validate(query: Query): boolean
        #parseContent(content: string): AST
    }

    class ASTStrategy {
        +extract(content: string): Query[]
        +preserveFormatting: boolean
        +handleInterpolations: boolean
        <<src/core/extraction/strategies/ASTStrategy.ts>>
    }

    class PluckStrategy {
        +extract(content: string): Query[]
        +patterns: RegExp[]
        +gqlMagicComment: boolean
        <<src/core/extraction/strategies/PluckStrategy.ts>>
    }

    class PatternAwareASTStrategy {
        +extract(content: string): Query[]
        +detectPatterns: boolean
        +patternRegistry: QueryPatternRegistry
        <<src/core/extraction/strategies/PatternAwareASTStrategy.ts>>
    }

    class UnifiedExtractor {
        +strategies: BaseStrategy[]
        +extract(files: string[]): ExtractedQuery[]
        +selectStrategy(file: string): BaseStrategy
        <<src/core/extraction/engine/UnifiedExtractor.ts>>
    }

    BaseStrategy <|-- ASTStrategy
    BaseStrategy <|-- PluckStrategy
    ASTStrategy <|-- PatternAwareASTStrategy

    UnifiedExtractor o-- BaseStrategy : uses
```

## 5. Validation & Comparison System

```mermaid
graph TB
    subgraph "Validation Pipeline"
        INPUT[Query Input]
        SCHEMA_VAL[Schema Validator<br/>src/core/validator/SchemaValidator.ts]
        RESPONSE_VAL[Response Validator<br/>src/core/validator/ResponseValidationService.ts]
        SEMANTIC_VAL[Semantic Validator<br/>src/core/validator/SemanticValidator.ts]
    end

    subgraph "Comparison System"
        COMPARATOR[Response Comparator<br/>src/core/validator/ResponseComparator.ts]
        REGISTRY[Comparator Registry<br/>src/core/validator/comparators/index.ts]

        subgraph "Comparator Types"
            DATE[date-tolerance]
            CASE[case-insensitive]
            NUM[numeric-tolerance]
            ARRAY[array-unordered]
            SPACE[ignore-whitespace]
            TYPE[type-coercion]
            PARTIAL[deep-partial]
        end
    end

    subgraph "Result Generation"
        REPORT_GEN[Report Generator<br/>src/core/validator/ValidationReportGenerator.ts]
        ALIGN_GEN[Alignment Generator<br/>src/core/validator/AlignmentGenerator.ts]
    end

    INPUT --> SCHEMA_VAL
    SCHEMA_VAL --> RESPONSE_VAL
    RESPONSE_VAL --> COMPARATOR

    COMPARATOR --> REGISTRY
    REGISTRY --> DATE
    REGISTRY --> CASE
    REGISTRY --> NUM
    REGISTRY --> ARRAY
    REGISTRY --> SPACE
    REGISTRY --> TYPE
    REGISTRY --> PARTIAL

    COMPARATOR --> SEMANTIC_VAL
    SEMANTIC_VAL --> REPORT_GEN
    REPORT_GEN --> ALIGN_GEN

    style INPUT fill:#e1f5e1
    style COMPARATOR fill:#ffe1e1
    style REGISTRY fill:#e1e1ff
```

## 6. Safety & Monitoring Architecture

```mermaid
graph LR
    subgraph "Safety Controls"
        HEALTH[Health Check System<br/>src/core/safety/HealthCheck.ts]
        PROGRESSIVE[Progressive Migration<br/>src/core/safety/ProgressiveMigration.ts]
        ROLLBACK[Rollback Manager<br/>src/core/safety/Rollback.ts]
    end

    subgraph "Monitoring"
        PERF_MON[Performance Monitor<br/>src/core/monitoring/PerformanceMonitor.ts]
        METRICS[Metrics Collector]
        ALERTS[Alert System]
    end

    subgraph "Health Indicators"
        QUERY_HEALTH[Query Health]
        TRANSFORM_HEALTH[Transform Health]
        VALIDATION_HEALTH[Validation Health]
        SYSTEM_HEALTH[System Health]
    end

    subgraph "Rollback Strategies"
        IMMEDIATE[Immediate Rollback]
        GRADUAL[Gradual Rollback]
        CHECKPOINT[Checkpoint Restore]
    end

    HEALTH --> QUERY_HEALTH
    HEALTH --> TRANSFORM_HEALTH
    HEALTH --> VALIDATION_HEALTH
    HEALTH --> SYSTEM_HEALTH

    PROGRESSIVE --> PERF_MON
    PERF_MON --> METRICS
    METRICS --> ALERTS

    ROLLBACK --> IMMEDIATE
    ROLLBACK --> GRADUAL
    ROLLBACK --> CHECKPOINT

    ALERTS --> ROLLBACK

    style HEALTH fill:#ffe1e1
    style PROGRESSIVE fill:#e1f5e1
    style ROLLBACK fill:#e1e1ff
```

## 7. MCP Server Integration

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as MCP Server<br/>src/mcp/server.ts
    participant Handler as Error Handler
    participant CLI as CLI Commands
    participant Pipeline as Migration Pipeline

    Client->>Server: List Tools Request
    Server-->>Client: Available Tools List

    Client->>Server: Call Tool (e.g., extract_queries)
    Server->>Handler: Validate Arguments

    alt Valid Arguments
        Server->>CLI: Execute Command
        CLI->>Pipeline: Run Migration Step
        Pipeline-->>CLI: Result/Output
        CLI-->>Server: Command Output
        Server->>Handler: Format Response
        Handler-->>Server: Formatted Output
        Server-->>Client: Success Response
    else Invalid Arguments
        Handler-->>Server: Error Message
        Server-->>Client: Error Response with Help
    end

    Note over Client,Pipeline: All errors are caught and returned<br/>as formatted responses with recovery advice
```

## 8. Test Architecture Overview

```mermaid
graph TB
    subgraph "Unit Tests"
        ANALYZER_TESTS[Analyzer Tests<br/>src/test/analyzer/*]
        EXTRACTOR_TESTS[Extractor Tests<br/>src/test/extraction/*]
        VALIDATOR_TESTS[Validator Tests<br/>src/test/validator/*]
        TRANSFORMER_TESTS[Transformer Tests<br/>src/test/transformer/*]
    end

    subgraph "Integration Tests"
        PIPELINE_TESTS[Pipeline Tests<br/>src/test/pipeline/*]
        CLI_TESTS[CLI Tests<br/>src/test/cli/*]
        E2E_TESTS[End-to-End Tests<br/>src/test/integration/*]
    end

    subgraph "Specialized Tests"
        SAFETY_TESTS[Safety Tests<br/>src/test/core/safety/*]
        PERF_TESTS[Performance Tests<br/>src/test/performance/*]
        EDGE_TESTS[Edge Case Tests<br/>*edge-cases.test.ts]
    end

    subgraph "Test Utilities"
        MOCK_FACTORY[Mock Factory<br/>src/test/utils/mockFactory.ts]
        TEST_HELPERS[Test Helpers<br/>src/test/utils/testHelpers.ts]
        PERF_TRACKER[Performance Tracker<br/>src/test/utils/performanceTracker.ts]
    end

    ANALYZER_TESTS --> MOCK_FACTORY
    EXTRACTOR_TESTS --> MOCK_FACTORY
    VALIDATOR_TESTS --> MOCK_FACTORY
    TRANSFORMER_TESTS --> MOCK_FACTORY

    PIPELINE_TESTS --> TEST_HELPERS
    CLI_TESTS --> TEST_HELPERS
    E2E_TESTS --> TEST_HELPERS

    PERF_TESTS --> PERF_TRACKER

    style SAFETY_TESTS fill:#ffe1e1
    style PERF_TESTS fill:#e1f5e1
    style EDGE_TESTS fill:#e1e1ff
```

## 9. Cache & Performance Strategy

```mermaid
graph LR
    subgraph "Cache Layers"
        MEMORY[Memory Cache<br/>In-Process]
        DISK[Disk Cache<br/>File System]
        DISTRIBUTED[Distributed Cache<br/>Future: Redis]
    end

    subgraph "Cache Manager"
        MANAGER[CacheManager<br/>src/core/cache/CacheManager.ts]
        STRATEGY[Cache Strategy]
        INVALIDATION[Invalidation Logic]
    end

    subgraph "Cached Operations"
        SCHEMA_CACHE[Schema Analysis]
        QUERY_CACHE[Extracted Queries]
        TRANSFORM_CACHE[Transformations]
        VALIDATION_CACHE[Validation Results]
    end

    subgraph "Performance Monitoring"
        MONITOR[PerformanceMonitor<br/>src/core/monitoring/PerformanceMonitor.ts]
        METRICS[Metrics Collection]
        REPORTING[Performance Reports]
    end

    MANAGER --> MEMORY
    MANAGER --> DISK
    MANAGER --> DISTRIBUTED

    MANAGER --> STRATEGY
    STRATEGY --> INVALIDATION

    SCHEMA_CACHE --> MANAGER
    QUERY_CACHE --> MANAGER
    TRANSFORM_CACHE --> MANAGER
    VALIDATION_CACHE --> MANAGER

    MONITOR --> METRICS
    METRICS --> REPORTING
    METRICS --> MANAGER

    style MEMORY fill:#e1f5e1
    style DISK fill:#ffe1e1
    style DISTRIBUTED fill:#e1e1ff,stroke-dasharray: 5 5
```

## 10. Error Handling & Recovery Flow

```mermaid
flowchart TB
    ERROR[Error Occurs]

    subgraph "Error Classification"
        PARSE_ERR[Parse Error]
        VALIDATION_ERR[Validation Error]
        TRANSFORM_ERR[Transform Error]
        RUNTIME_ERR[Runtime Error]
        PERMISSION_ERR[Permission Error]
    end

    subgraph "Error Handlers"
        STANDARD[StandardErrorHandler<br/>src/utils/StandardErrorHandler.ts]
        MCP_HANDLER[MCP ErrorHandler<br/>src/mcp/server.ts]
        CLI_HANDLER[CLI Error Handler]
    end

    subgraph "Recovery Strategies"
        RETRY[Retry with Backoff]
        SKIP[Skip & Continue]
        ROLLBACK[Rollback Changes]
        MANUAL[Manual Intervention]
    end

    subgraph "User Feedback"
        ERROR_MSG[Error Message]
        SUGGESTION[Recovery Suggestion]
        DEBUG_INFO[Debug Information]
        NEXT_STEPS[Next Steps]
    end

    ERROR --> PARSE_ERR
    ERROR --> VALIDATION_ERR
    ERROR --> TRANSFORM_ERR
    ERROR --> RUNTIME_ERR
    ERROR --> PERMISSION_ERR

    PARSE_ERR --> STANDARD
    VALIDATION_ERR --> STANDARD
    TRANSFORM_ERR --> STANDARD
    RUNTIME_ERR --> MCP_HANDLER
    PERMISSION_ERR --> CLI_HANDLER

    STANDARD --> RETRY
    STANDARD --> SKIP
    MCP_HANDLER --> ROLLBACK
    CLI_HANDLER --> MANUAL

    RETRY --> ERROR_MSG
    SKIP --> ERROR_MSG
    ROLLBACK --> ERROR_MSG
    MANUAL --> ERROR_MSG

    ERROR_MSG --> SUGGESTION
    SUGGESTION --> DEBUG_INFO
    DEBUG_INFO --> NEXT_STEPS

    style ERROR fill:#ff6666
    style RETRY fill:#66ff66
    style ROLLBACK fill:#ffff66
```

## Quick Reference

### Key Entry Points

- **CLI**: `src/cli/main-cli.ts`
- **MCP Server**: `src/mcp/server.ts`
- **API**: `src/index.ts`
- **Pipeline**: `src/core/pipeline/UnifiedMigrationPipeline.ts`

### Core Components

- **Orchestrator**: `src/core/MigrationOrchestrator.ts`
- **Extractor**: `src/core/extraction/engine/UnifiedExtractor.ts`
- **Transformer**: `src/core/transformer/OptimizedSchemaTransformer.ts`
- **Validator**: `src/core/validator/ResponseValidationService.ts`
- **Applicator**: `src/core/applicator/ASTCodeApplicator.ts`

### Safety Systems

- **Health Check**: `src/core/safety/HealthCheck.ts`
- **Progressive Migration**: `src/core/safety/ProgressiveMigration.ts`
- **Rollback**: `src/core/safety/Rollback.ts`
- **Performance Monitor**: `src/core/monitoring/PerformanceMonitor.ts`

### Recent Additions

- **MCP Server**: Model Context Protocol integration for AI assistance
- **CLI Compatibility**: Backward-compatible wrapper for automation
- **Comparator Registry**: Type-safe response comparison system
- **Enhanced Safety**: Health checks and progressive migration
- **Performance Monitoring**: Real-time performance tracking
