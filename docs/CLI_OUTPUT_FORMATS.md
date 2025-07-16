# CLI Output Format Specification

## Version: 1.0.0

This document specifies the stable output formats for all CLI commands to ensure backward compatibility and scriptability.

## General Principles

1. **JSON First**: All data outputs are JSON by default
2. **File Based**: Complex outputs write to files, not stdout
3. **Exit Codes**: 0 = success, 1 = error, 2 = warning
4. **Console Output**: Human-readable summaries only
5. **Stderr**: Error messages and debug info

## Command Output Formats

### 1. Extract Commands

#### `pg-cli extract queries`

**Output File**: `extracted-queries.json`

```json
{
  "timestamp": "ISO-8601 datetime",
  "directory": "string (source directory)",
  "totalQueries": "integer",
  "queries": [
    {
      "id": "string (unique identifier)",
      "filePath": "string (relative path)",
      "name": "string (operation name)",
      "type": "query|mutation|subscription",
      "location": {
        "line": "integer",
        "column": "integer"
      },
      "content": "string (GraphQL query)",
      "resolvedContent": "string (with fragments resolved)",
      "hash": "string (content hash)",
      "fragments": ["string (fragment names)"],
      "variables": ["string (variable names)"],
      "originalName": "string (optional)",
      "sourceAST": "object (optional, AST node)"
    }
  ],
  "fragments": [
    {
      "id": "string",
      "name": "string",
      "filePath": "string",
      "content": "string",
      "onType": "string"
    }
  ],
  "variants": [
    {
      "id": "string",
      "queryId": "string",
      "conditions": "object",
      "content": "string"
    }
  ],
  "errors": [
    {
      "file": "string",
      "message": "string",
      "line": "integer (optional)"
    }
  ],
  "stats": {
    "totalFiles": "integer",
    "totalQueries": "integer",
    "totalFragments": "integer",
    "totalVariants": "integer",
    "extractionTime": "integer (ms)"
  }
}
```

**Console Output**:

```
✓ Extraction complete
Found 42 GraphQL operations in 15 files
  query: 35
  mutation: 5
  subscription: 2
```

### 2. Transform Commands

#### `pg-cli transform queries`

**Output File**: `transformed/transformed-queries.json`

```json
{
  "timestamp": "ISO-8601 datetime",
  "totalTransformed": "integer",
  "transformations": [
    {
      "id": "string (query id)",
      "file": "string",
      "original": "string",
      "transformed": "string",
      "changes": [
        {
          "type": "field-rename|nested-replacement|comment-out",
          "path": "string (field path)",
          "field": "string",
          "replacement": "string (optional)",
          "reason": "string"
        }
      ],
      "warnings": ["string"],
      "diff": "string (unified diff format)"
    }
  ],
  "summary": {
    "total": "integer",
    "transformed": "integer",
    "skipped": "integer",
    "failed": "integer"
  }
}
```

**Dry Run Console Output**:

```
✓ Transformation complete (DRY RUN)
Transformed 15 queries with 23 changes

Changes by type:
  field-rename: 18
  nested-replacement: 3
  comment-out: 2

⚠️  Dry run mode - no files were modified
```

### 3. Validate Commands

#### `pg-cli validate schema`

**Output File**: `validation-report.json`

```json
{
  "timestamp": "ISO-8601 datetime",
  "schema": "string (schema path)",
  "results": {
    "total": "integer",
    "valid": "integer",
    "invalid": "integer",
    "warnings": "integer"
  },
  "queries": [
    {
      "id": "string",
      "file": "string",
      "valid": "boolean",
      "errors": [
        {
          "message": "string",
          "locations": [{ "line": "integer", "column": "integer" }],
          "path": ["string"],
          "extensions": {
            "code": "string",
            "suggestion": "string (optional)"
          }
        }
      ],
      "warnings": [
        {
          "message": "string",
          "type": "string"
        }
      ]
    }
  ]
}
```

**Console Output (Success)**:

```
✓ Validation complete
Validated 42 queries against schema
  Valid: 40
  Invalid: 2
  Warnings: 5
```

**Console Output (Failure)**:

```
✗ Validation failed
2 queries have errors:

  query-1: Field "oldField" not found on type "User"
    Suggestion: Did you mean "newField"?

  query-2: Variable "$id" is not defined
```

### 4. Response Validation

#### `pg-cli validate responses`

**Output Formats**: Specified by `--format` flag

**JSON Format** (default):

```json
{
  "timestamp": "ISO-8601 datetime",
  "summary": {
    "total": "integer",
    "passed": "integer",
    "failed": "integer",
    "mismatches": "integer"
  },
  "validations": [
    {
      "queryId": "string",
      "queryName": "string",
      "passed": "boolean",
      "errors": ["string"],
      "mismatches": [
        {
          "path": "string",
          "expected": "any",
          "actual": "any",
          "reason": "string"
        }
      ]
    }
  ]
}
```

**JUnit Format** (`--format junit`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="GraphQL Response Validation">
  <testsuite name="Response Validation" tests="42" failures="2">
    <testcase name="GetUser" classname="queries">
      <failure message="Type mismatch at user.age">
        Expected: number, Actual: string
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

### 5. Migration Pipeline

#### `pg-cli migrate full`

**Output Directory Structure**:

```
migration-YYYYMMDDHHmmss/
├── analysis.json
├── extraction.json
├── validation-pre.json
├── transformations.json
├── validation-post.json
├── applied-changes.json
├── rollback-plan.json
└── summary.json
```

**Summary File** (`summary.json`):

```json
{
  "timestamp": "ISO-8601 datetime",
  "status": "success|partial|failed",
  "phases": {
    "extraction": {
      "status": "completed",
      "duration": "integer (ms)",
      "queriesFound": "integer"
    },
    "validation": {
      "status": "completed",
      "valid": "integer",
      "invalid": "integer"
    },
    "transformation": {
      "status": "completed",
      "transformed": "integer",
      "changes": "integer"
    },
    "application": {
      "status": "completed|skipped",
      "filesModified": "integer"
    }
  },
  "rollbackAvailable": "boolean",
  "nextSteps": ["string"]
}
```

## Exit Codes

| Code | Meaning             | Used By           |
| ---- | ------------------- | ----------------- |
| 0    | Success             | All commands      |
| 1    | General failure     | All commands      |
| 2    | Validation warnings | validate commands |
| 3    | Partial success     | migrate commands  |
| 127  | Command not found   | Shell             |

## Environment Variables

```bash
# Disable progress indicators for CI
export PG_CLI_NO_PROGRESS=1

# Force JSON output to stdout
export PG_CLI_JSON_STDOUT=1

# Set output format version
export PG_CLI_OUTPUT_VERSION=1.0
```

## Backward Compatibility

### Version Detection

```bash
# Get current output version
pg-cli --output-version

# Use specific version
pg-cli extract queries --output-version 1.0
```

### Migration Path

When output format changes:

1. **Minor changes** (1.0 → 1.1): Additional fields only
2. **Major changes** (1.0 → 2.0): Support both versions for 6 months
3. **Deprecation**: Warning in console for 3 months before removal

### Legacy Format Support

```bash
# Use legacy format
pg-cli extract queries --legacy-format

# Get migration guide
pg-cli migrate-output --from 1.0 --to 2.0
```

## Testing Compatibility

### Automated Tests

```bash
# Run compatibility test suite
npm run test:cli-compatibility

# Test specific output version
npm run test:cli-compatibility -- --version 1.0
```

### Manual Verification

```bash
# Verify JSON output
pg-cli extract queries -o out.json
jq '.queries[0]' out.json

# Test exit codes
pg-cli validate schema || echo "Exit code: $?"

# Test piping
pg-cli extract queries --json | jq '.totalQueries'
```

## Changelog

### Version 1.0.0 (2025-01-09)

- Initial stable release
- Defined core output formats
- Established compatibility guarantees
