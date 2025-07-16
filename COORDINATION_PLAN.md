# Y & Z Coordination Plan
**Date**: 2025-07-16  
**Branch Status**: Both branches merged, ready for coordination

## Current State ✅

### Z's Contributions (z-sample-testing branch)
- ✅ Comprehensive refactoring (60% redundancy elimination) 
- ✅ ConfigurableTestRunner with small/large modes
- ✅ Template validation at 100% pass rate
- ✅ Polling integration (replaced socket.io)
- ✅ Integration audit with detailed issue documentation
- ✅ Security hardening and test stability improvements

### Y's Contributions (testing branch) 
- ✅ AST parsing fixes (traverse import issues resolved)
- ✅ Schema caching with LRU eviction (SchemaLoader)
- ✅ Enhanced error handling in OptimizedSchemaTransformer
- ✅ Comprehensive AST_GUIDE.md (428 lines)
- ✅ Centralized schema utilities (schemaLoader.ts)

### Integration Issues Found ❌
- Authentication mocking incomplete (E2E tests still hitting real APIs)
- UI test failures (35+ tests with undefined property errors)
- Pass rate regression from 95% to 65%
- ConfigurableTestRunner not integrated with Y's SchemaLoader

## Task Distribution & Next Steps

### **Y's Focus Areas (High Impact, Low Dependency)**

#### 1. UI Service Integration Fixes (Critical - 2-3 hours)
**Files**: `ui/test/services/api-comprehensive.test.ts`
**Issue**: Y's API service changes broke error message expectations
```typescript
// Error pattern: 
expected [Function] to throw error including 'Invalid token' 
but got 'Cannot read properties of undefined'
```
**Action**: Review recent API service changes and fix error handling to maintain expected error messages

#### 2. SchemaLoader Integration Testing (Medium - 1 hour)
**Files**: `src/utils/schemaLoader.ts`, new test file
**Issue**: `getRecentActivity` polling mechanism needs testing
**Action**: Create test with mock poll intervals:
```typescript
// Test Y should create:
describe('SchemaLoader Polling', () => {
  it('should return activity since timestamp', async () => {
    const loader = SchemaLoader.getInstance();
    const before = Date.now();
    await loader.loadSchema('test.graphql');
    const after = Date.now();
    
    const activity = loader.getRecentActivity(before);
    expect(activity).toHaveLength(1);
    expect(activity[0].timestamp).toBeGreaterThan(before);
  });
});
```

#### 3. Global Mock Configuration (Critical - 1 hour)
**Files**: `vitest.config.ts`
**Issue**: Real API calls bypassing individual test mocks
**Action**: Add global Apollo Client mocking:
```typescript
// vitest.config.ts addition:
export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    environment: 'node',
    globals: true
  }
});

// test/setup.ts:
vi.mock('@apollo/client/core', () => ({
  ApolloClient: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ data: {}, errors: null })
  })),
  // ... other mocks
}));
```

### **Z's Focus Areas (ConfigurableTestRunner + Integration)**

#### 1. ConfigurableTestRunner + SchemaLoader Integration (Medium - 2 hours)
**Files**: `test/fixtures/sample_data/configurableTestRunner.ts`
**Issue**: ConfigurableTestRunner not using Y's SchemaLoader caching
**Action**: Update ConfigurableTestRunner to leverage Y's SchemaLoader:
```typescript
import { defaultSchemaLoader } from '../../../src/utils/schemaLoader.js';

// In ConfigurableTestRunner:
private async runValidation(): Promise<TestResults['validation']> {
  // Use Y's SchemaLoader instead of custom validation
  const schema = await defaultSchemaLoader.loadSchema('data/schema.graphql');
  const stats = defaultSchemaLoader.getCacheStats();
  
  // Integrate cache stats into test results
  // ...
}
```

#### 2. Performance Benchmarks (Medium - 1 hour) 
**Files**: `test/fixtures/sample_data/configurableTestRunner.test.ts` (new)
**Issue**: Missing performance metrics for small vs large modes
**Action**: Create benchmark test with Y's SchemaLoader caching:
```typescript
describe('ConfigurableTestRunner Performance', () => {
  it('should show performance improvement with caching', async () => {
    // Test with cache disabled
    const noCacheResults = await runSampleTests({ cacheEnabled: false });
    
    // Test with cache enabled (using Y's SchemaLoader)
    const cachedResults = await runSampleTests({ cacheEnabled: true });
    
    expect(cachedResults.totalTimeMs).toBeLessThan(noCacheResults.totalTimeMs);
    // Document performance improvements
  });
});
```

#### 3. Integration Test Recovery (High - 2 hours)
**Files**: Multiple test files
**Issue**: Pass rate regression from 95% to 65%
**Action**: Fix specific test failures after Y's authentication mocking is complete
- Debug remaining UI test undefined errors  
- Verify ConfigurableTestRunner + SchemaLoader integration
- Re-run full test suite to confirm 95%+ pass rate

### **Shared Dependencies**

#### Authentication Mocking (Y → Z)
1. **Y completes**: Global mock configuration 
2. **Z then**: Re-runs E2E tests to verify no more SSO redirects
3. **Both**: Confirm all real API calls properly mocked

#### Final Integration Testing (Z → Y)
1. **Z completes**: ConfigurableTestRunner integration
2. **Y then**: Reviews integration and validates SchemaLoader usage
3. **Both**: Run full test suite and confirm 95%+ pass rate

## Timeline & Checkpoints

### Today (Rest of Day)
- **Y**: UI service fixes + global mocking (3-4 hours)
- **Z**: ConfigurableTestRunner integration (2-3 hours)

### Tomorrow Morning  
- **Checkpoint 1**: Authentication mocking verified working
- **Z**: Integration test recovery (2 hours)
- **Y**: SchemaLoader polling tests (1 hour)

### Tomorrow Afternoon
- **Checkpoint 2**: 95%+ pass rate achieved
- **Both**: Final review and merge preparation
- **Y**: Performance validation
- **Z**: Documentation updates

## Success Criteria

✅ **Authentication Issue Resolved**: No more SSO redirects in any tests  
✅ **UI Tests Fixed**: 35+ failing tests now passing  
✅ **Integration Working**: ConfigurableTestRunner using Y's SchemaLoader  
✅ **Pass Rate Recovered**: 95%+ pass rate achieved  
✅ **Performance Benchmarks**: Small vs large mode metrics documented  
✅ **Polling Tested**: Y's getRecentActivity mechanism verified working  

## Communication

- **Slack/Updates**: After each checkpoint completion
- **Code Reviews**: Cross-review critical integration points
- **Merge Strategy**: Only after all success criteria met

**Current Commit**: `d2b262b` (z-sample-testing with latest Y changes)  
**Ready for**: Parallel development on assigned focus areas