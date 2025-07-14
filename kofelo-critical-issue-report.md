# 🚨 CRITICAL ISSUE: UnifiedExtractor File Discovery Failure

**Reporter**: Kofelo (Extraction Support)
**Date**: January 10, 2025 11:56 AM
**Severity**: CRITICAL - Blocking all extractions

## Issue Summary

UnifiedExtractor is failing to discover files, resulting in 0 queries extracted even when valid GraphQL files exist. This is causing all integration tests to fail.

## Evidence

### Test Results
```
FAIL: src/test/extraction/integration.test.ts
- 5/5 tests failing
- All show: "Found 0 files to process"
- Expected 3-4 queries, got 0
```

### Root Cause Analysis

1. **File Discovery Issue**:
   ```
   ]: Found 0 files to process {"service":"pg-migration-620"}
   ```

2. **Test Pattern**:
   - Tests create temp directories (e.g., `temp-test-mixed`)
   - Write GraphQL files to these directories
   - Immediately call UnifiedExtractor.extract()
   - Extractor finds 0 files despite files existing

3. **Potential Causes**:
   - Filesystem timing issue (files not visible immediately after write)
   - Glob pattern mismatch
   - Working directory issue
   - Ignore patterns too aggressive

## Immediate Actions Needed

### 1. Check File Discovery Logic
```typescript
// In UnifiedExtractor.discoverFiles()
const files = await glob(filePatterns, {
  cwd: directory,
  absolute: true,
  ignore: ignore || ['**/node_modules/**', '**/__generated__/**', '**/*.test.*']
});
```

### 2. Verify Test File Creation
The tests use this pattern:
```typescript
await writeAndVerifyFile(testFile, content);
await new Promise(resolve => setTimeout(resolve, 200)); // Delay added
const extractor = new UnifiedExtractor(options);
const result = await extractor.extract();
```

### 3. Debug Steps
1. Add logging to show:
   - Actual working directory
   - Files that exist before extraction
   - Glob patterns being used
   - Ignore patterns applied

## Temporary Workaround

While you fix UnifiedExtractor, I can use my manual extractor:

```bash
# Manual extraction for specific files
pnpm kofelo:extract path/to/file.ts

# This uses AST parsing with multiple fallback strategies
```

## Impact

- **Extraction Pipeline**: Completely blocked
- **Tests**: All integration tests failing
- **Production**: Unknown - needs verification

## Recommendation

1. **Immediate**: Add debug logging to file discovery
2. **Short-term**: Fix glob/timing issue
3. **Long-term**: Add file discovery unit tests

---

**Travis, I'm ready with manual extraction tools if you need to bypass this issue temporarily. Let me know if you need me to manually extract any specific files while you debug.**
