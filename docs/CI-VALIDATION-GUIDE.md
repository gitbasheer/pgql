# CI/CD Validation Guide

This guide explains how to integrate the GraphQL migration validation tools into your CI/CD pipeline.

## Overview

The validation tools are designed to be CI-friendly with:
- Clear exit codes (0 = success, 1 = error, 2 = warning)
- Machine-readable output formats (JSON, JUnit XML)
- Actionable error messages with diffs
- Configurable ignore patterns for expected differences

## Three-Step Validation Process

### Step 1: Validate Extracted Queries

Ensures all queries are successfully extracted and valid against the schema.

```bash
# Basic validation
pg-cli validate schema --queries extracted-queries.json --schema schema.graphql

# With pipeline validation (recommended for CI)
pg-cli validate schema --pipeline --report validation-report.json

# Exit codes:
# 0 = All queries valid
# 1 = Invalid queries found
```

**CI Example (GitHub Actions):**
```yaml
- name: Validate Extracted Queries
  run: |
    npm run cli validate schema \
      --queries ./extracted-queries.json \
      --schema ./schema.graphql \
      --pipeline \
      --report ./reports/extraction-validation.json
  continue-on-error: false
```

### Step 2: Validate Transformation

Ensures transformations preserve query behavior and don't lose queries.

```bash
# Validate migration
pg-cli validate-migration \
  --before ./extracted-queries.json \
  --after ./transformed-queries.json \
  --output ./migration-report.json

# Strict mode (fails on any structural changes)
pg-cli validate-migration \
  --before ./before.json \
  --after ./after.json \
  --strict

# Exit codes:
# 0 = Migration successful
# 1 = Errors (missing queries, breaking changes)
# 2 = Warnings (non-breaking changes)
```

**CI Example:**
```yaml
- name: Validate Transformation
  id: validate-transform
  run: |
    npm run cli validate-migration \
      --before ./extracted-queries.json \
      --after ./transformed-queries.json \
      --output ./reports/migration-validation.json

- name: Upload Migration Report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: migration-report
    path: ./reports/migration-validation.json
```

### Step 3: Validate Runtime Responses

Ensures transformed queries return the same data as original queries.

```bash
# Capture baseline responses
pg-cli validate responses \
  --capture-baseline \
  --queries ./extracted-queries.json \
  --endpoint $GRAPHQL_ENDPOINT \
  --auth-token $API_TOKEN

# Compare responses
pg-cli validate responses \
  --compare \
  --baseline ./baseline-queries.json \
  --transformed ./transformed-queries.json \
  --config ./response-validation-config.yaml \
  --output ./response-validation-report.json

# Generate JUnit report for CI
pg-cli validate responses \
  --compare \
  --format junit \
  --output ./test-results/
```

**CI Example with Configuration:**
```yaml
- name: Validate Response Compatibility
  env:
    GRAPHQL_ENDPOINT: ${{ secrets.GRAPHQL_ENDPOINT }}
    API_TOKEN: ${{ secrets.API_TOKEN }}
  run: |
    # Use configuration file with ignore patterns
    npm run cli validate responses \
      --compare \
      --baseline ./baseline-queries.json \
      --transformed ./transformed-queries.json \
      --config ./validation-config.yaml \
      --format junit \
      --output ./test-results/

- name: Publish Test Results
  uses: EnricoMi/publish-unit-test-result-action@v2
  if: always()
  with:
    junit_files: test-results/**/*.xml
```

## Configuration for Expected Differences

Create a `validation-config.yaml` file to handle expected differences:

```yaml
validation:
  # Ignore patterns for fields that are expected to differ
  ignorePatterns:
    # Timestamps always differ
    - path: "data.*.timestamp"
      reason: "Timestamps vary between calls"
      type: "value"

    # Debug fields only in development
    - path: "data.*.debug"
      reason: "Debug fields not in production"
      type: "all"

    # Order may vary in search results
    - path: "data.search.results"
      reason: "Search ordering not guaranteed"
      type: "array-order"

  # Expected schema changes
  expectedDifferences:
    - path: "data.user.name"
      expectedChange:
        type: "missing-field"
      reason: "Field renamed to displayName in v2"
```

## Error Reporting

The enhanced validation tools provide actionable error messages:

```
❌ Invalid Queries:

  GetUser:
    ✗ Cannot query field "username" on type "User"
      💡 Field 'username' does not exist on type 'User'. Check the schema for available fields.

      Suggested fix:
      --- original.graphql
      +++ suggested.graphql
      @@ -1,5 +1,5 @@
       query GetUser {
         user {
           id
      -    username
      +    name
         }
       }

      at line 4, column 5
```

## Response Validation Security Update

### Removal of Embedded JavaScript Functions

**Important**: The response validation system no longer supports embedding JavaScript functions as strings in YAML configuration files. This change addresses:

- **Security Risk**: Embedded code in configuration files creates potential code injection vulnerabilities
- **Maintenance Issues**: String-based functions lack IDE support and type safety
- **Portability Concerns**: Configurations with embedded code cannot be safely shared

### Migration to Predefined Comparators

All custom comparison logic must now use predefined comparator types:

```yaml
# Before (INSECURE - DO NOT USE)
customComparators:
  "data.*.createdAt": |
    function(baseline, transformed) {
      return Math.abs(new Date(baseline) - new Date(transformed)) < 60000;
    }

# After (SECURE)
customComparators:
  "data.*.createdAt":
    type: "date-tolerance"
    options:
      tolerance: 60000
```

### Available Comparator Types

- `date-tolerance` - Compare dates with time tolerance
- `case-insensitive` - String comparison ignoring case
- `numeric-tolerance` - Number comparison with tolerance
- `array-unordered` - Array comparison ignoring order
- `ignore-whitespace` - String comparison normalizing whitespace
- `type-coercion` - Allow common type conversions
- `deep-partial` - Check subset relationships

### Migration Command

```bash
# Migrate existing configs automatically
npm run migrate:response-config "**/*validation*.yaml"
```

See [Response Comparator Migration Guide](./RESPONSE-COMPARATOR-MIGRATION.md) for detailed migration instructions.

## Complete CI Pipeline Example

```yaml
name: GraphQL Migration Validation

on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install Dependencies
      run: npm ci

    - name: Extract Queries
      run: |
        npm run cli extract queries ./src \
          --output ./extracted-queries.json

    - name: Validate Extracted Queries
      run: |
        npm run cli validate schema \
          --queries ./extracted-queries.json \
          --schema ./schema.graphql \
          --pipeline \
          --report ./reports/extraction.json

    - name: Transform Queries
      run: |
        npm run cli transform queries \
          --input ./extracted-queries.json \
          --schema ./new-schema.graphql \
          --output ./transformed/

    - name: Validate Transformation
      id: validate-transform
      run: |
        npm run cli validate-migration \
          --before ./extracted-queries.json \
          --after ./transformed/transformed-queries.json \
          --output ./reports/migration.json
      continue-on-error: true

    - name: Validate Response Compatibility
      if: steps.validate-transform.outcome == 'success'
      env:
        GRAPHQL_ENDPOINT: ${{ secrets.GRAPHQL_ENDPOINT }}
        API_TOKEN: ${{ secrets.API_TOKEN }}
      run: |
        npm run cli validate responses \
          --compare \
          --baseline ./test-data/baseline-responses.json \
          --transformed ./transformed/transformed-queries.json \
          --config ./validation-config.yaml \
          --format junit \
          --output ./test-results/

    - name: Upload Test Results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: validation-reports
        path: |
          ./reports/
          ./test-results/

    - name: Comment PR
      if: failure()
      uses: actions/github-script@v6
      with:
        script: |
          const fs = require('fs');
          const report = JSON.parse(
            fs.readFileSync('./reports/migration.json', 'utf8')
          );

          const comment = `
          ## ❌ GraphQL Migration Validation Failed

          **Summary:**
          - Total Queries: ${report.summary.totalQueries}
          - Missing: ${report.summary.missingQueries}
          - Modified: ${report.summary.modifiedQueries}
          - Breaking Changes: ${report.issues.filter(i => i.severity === 'error').length}

          See the [full report](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}) for details.
          `;

          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: comment
          });
```

## Best Practices

1. **Run validations in order**: Extract → Transform → Response validation
2. **Use configuration files** for ignore patterns rather than CLI flags
3. **Store baseline responses** in your repository for consistent CI runs
4. **Use JUnit format** for better CI integration
5. **Set appropriate exit codes** based on your tolerance for warnings
6. **Upload reports as artifacts** for debugging failed builds
7. **Comment on PRs** with validation summaries for visibility

## Debugging Failed Validations

When validations fail in CI:

1. Download the validation report artifacts
2. Check the detailed error messages with diffs
3. Look for patterns in failures (might need ignore rules)
4. Run validations locally with the same configuration
5. Use the `--verbose` flag for more detailed output

## Performance Considerations

For large codebases:

```yaml
# Parallelize validation steps
- name: Validate Queries in Parallel
  run: |
    npm run cli validate schema \
      --queries ./queries-part1.json \
      --schema ./schema.graphql &

    npm run cli validate schema \
      --queries ./queries-part2.json \
      --schema ./schema.graphql &

    wait
```

## Exit Code Reference

| Tool | Success | Warnings | Errors |
|------|---------|----------|---------|
| validate schema | 0 | 0 (warnings don't fail) | 1 |
| validate-migration | 0 | 2 | 1 |
| validate responses | 0 | 0 (configurable) | 1 |

You can configure exit codes in your validation config:

```yaml
reporting:
  ci:
    failOnWarnings: true  # Make warnings fail the build
    exitCodes:
      success: 0
      warnings: 2
      errors: 1
```
