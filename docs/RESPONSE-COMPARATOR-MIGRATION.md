# Response Comparator Migration Guide

## Overview

The response validation system has been refactored to remove support for embedded JavaScript functions in YAML configuration files. This change improves security, maintainability, and type safety.

### Why This Change?

1. **Security**: Embedding raw JavaScript in YAML files creates potential code injection vulnerabilities
2. **Maintainability**: String-based functions lack IDE support, type checking, and debugging capabilities
3. **Portability**: YAML configs with embedded code cannot be safely shared or validated
4. **Performance**: Pre-compiled comparators are more efficient than runtime evaluation

## Migration Steps

### 1. Automatic Migration

Use the provided migration script to automatically convert most common patterns:

```bash
# Migrate a single file
npx ts-node scripts/migrate-response-validation-config.ts ./config/response-validation.yaml

# Migrate multiple files with glob pattern
npx ts-node scripts/migrate-response-validation-config.ts "**/*validation*.{yaml,yml}"
```

The script will:
- Create backups of original files (`.pre-migration.bak`)
- Convert recognizable patterns to predefined comparator types
- Flag complex functions that require manual migration

### 2. Manual Migration

For functions that cannot be automatically migrated, replace them with appropriate comparator types:

#### Before (Embedded JS):
```yaml
validation:
  customComparators:
    "data.*.createdAt": |
      function(baseline, transformed) {
        const date1 = new Date(baseline);
        const date2 = new Date(transformed);
        return Math.abs(date1.getTime() - date2.getTime()) < 60000;
      }
```

#### After (Comparator Type):
```yaml
comparison:
  customComparators:
    "data.*.createdAt":
      type: "date-tolerance"
      options:
        tolerance: 60000  # milliseconds
```

## Available Comparator Types

### 1. `date-tolerance`
Compares dates/timestamps with configurable tolerance.

```yaml
"data.*.timestamp":
  type: "date-tolerance"
  options:
    tolerance: 60000  # Default: 60000ms (1 minute)
```

### 2. `case-insensitive`
Compares strings ignoring case differences.

```yaml
"data.*.status":
  type: "case-insensitive"
```

### 3. `numeric-tolerance`
Compares numbers with absolute or relative tolerance.

```yaml
# Absolute tolerance
"data.*.price":
  type: "numeric-tolerance"
  options:
    tolerance: 0.01    # Absolute difference
    relative: false    # Default: false

# Relative tolerance (percentage)
"data.*.percentage":
  type: "numeric-tolerance"
  options:
    tolerance: 0.05    # 5% relative tolerance
    relative: true
```

### 4. `array-unordered`
Compares arrays ignoring element order.

```yaml
"data.tags":
  type: "array-unordered"
```

### 5. `ignore-whitespace`
Compares strings ignoring whitespace differences.

```yaml
"data.*.description":
  type: "ignore-whitespace"
```

### 6. `type-coercion`
Allows common type conversions (string ↔ number, string ↔ boolean).

```yaml
"data.*.id":
  type: "type-coercion"
```

### 7. `deep-partial`
Checks if one object is a subset of another.

```yaml
"data.partialResponse":
  type: "deep-partial"
```

## Common Migration Patterns

### Date/Time Comparisons
```yaml
# Before
"data.timestamp": |
  function(a, b) {
    return Math.abs(new Date(a) - new Date(b)) < 300000; // 5 minutes
  }

# After
"data.timestamp":
  type: "date-tolerance"
  options:
    tolerance: 300000
```

### Case-Insensitive String Comparison
```yaml
# Before
"data.name": |
  function(a, b) {
    return a.toLowerCase() === b.toLowerCase();
  }

# After
"data.name":
  type: "case-insensitive"
```

### Type Conversion
```yaml
# Before
"data.id": |
  function(a, b) {
    return String(a) === String(b);
  }

# After
"data.id":
  type: "type-coercion"
```

### Always True (Field Ignore)
```yaml
# Before
"data.debug": |
  function() { return true; }

# After - Use ignorePatterns instead
validation:
  ignorePatterns:
    - path: "data.debug"
      reason: "Debug field varies by environment"
      type: "all"
```

## Custom Comparators

If none of the predefined types meet your needs, you can:

1. **Register a custom comparator in code**:
```typescript
import { ComparatorRegistry } from '@core/validator/comparators';

ComparatorRegistry.registerComparator('my-custom-type', (options) => {
  return (baseline, transformed) => {
    // Your comparison logic
    return customComparison(baseline, transformed, options);
  };
});
```

2. **Reference it in YAML**:
```yaml
"data.specialField":
  type: "my-custom-type"
  options:
    customParam: "value"
```

## Testing Your Migration

After migration, test your configuration:

```bash
# Validate the configuration file
npx pg-validate check-config ./config/response-validation.yaml

# Run response comparison with new config
npx pg-validate compare \
  --config ./config/response-validation.yaml \
  --baseline ./baseline-responses.json \
  --transformed ./transformed-responses.json
```

## Troubleshooting

### Error: "Embedded JavaScript functions are no longer supported"
This warning appears when the system detects string-based function definitions. Update to use a predefined comparator type.

### Error: "Unknown comparator type"
Ensure you're using one of the available comparator types listed above, or register a custom type before use.

### Complex Logic That Doesn't Fit Predefined Types
Consider:
1. Breaking down the logic into multiple comparators
2. Using `ignorePatterns` for fields that should be skipped
3. Implementing a custom comparator in code

## Support

For complex migration scenarios or questions, please:
1. Check the [examples directory](../examples) for more patterns
2. Review the [test cases](../src/test/validator/comparators.test.ts)
3. Open an issue with your specific use case
