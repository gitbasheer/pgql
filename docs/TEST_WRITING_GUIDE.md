# Test Writing Best Practices Guide

## Overview
This guide provides best practices for writing tests in the pg-migration-620 project. We use Vitest as our test runner, emphasizing clear, maintainable, and reliable tests.

## Test Philosophy

### Core Principles
1. **Test Behavior, Not Implementation** - Focus on what the code does, not how
2. **Clear Test Names** - Should describe the scenario and expected outcome
3. **Isolated Tests** - Each test should be independent
4. **Fast Execution** - Keep unit tests under 100ms
5. **Reliable Results** - No flaky tests allowed

## Test Structure

### Basic Test Template
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ModuleName', () => {
  // Setup shared across tests in this describe block
  let instance: ModuleName;
  
  beforeEach(() => {
    // Fresh setup for each test
    instance = new ModuleName();
  });
  
  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('should return expected result for valid input', () => {
      // Arrange
      const input = 'valid input';
      const expected = 'expected output';
      
      // Act
      const result = instance.methodName(input);
      
      // Assert
      expect(result).toBe(expected);
    });

    it('should throw error for invalid input', () => {
      // Arrange
      const invalidInput = null;
      
      // Act & Assert
      expect(() => instance.methodName(invalidInput))
        .toThrow('Input cannot be null');
    });
  });
});
```

### Test Naming Conventions
```typescript
// ✅ GOOD - Descriptive test names
it('should extract GraphQL queries from TypeScript files');
it('should return empty array when no queries found');
it('should throw ExtractionError when file is not readable');

// ❌ BAD - Vague test names
it('works');
it('handles error');
it('test 1');
```

## Types of Tests

### 1. Unit Tests
Test individual functions or classes in isolation:

```typescript
// UnifiedExtractor.test.ts
describe('UnifiedExtractor', () => {
  it('should extract queries from a single file', async () => {
    const extractor = new UnifiedExtractor();
    const mockFile = createMockFile(`
      const query = gql\`
        query GetUser {
          user { id name }
        }
      \`;
    `);
    
    const result = await extractor.extractFromFile(mockFile);
    
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].name).toBe('GetUser');
  });
});
```

### 2. Integration Tests
Test how multiple components work together:

```typescript
// extraction-integration.test.ts
describe('Extraction Integration', () => {
  it('should extract and transform queries end-to-end', async () => {
    // Setup real files
    const testDir = await createTestDirectory({
      'query.ts': `
        export const GET_USER = gql\`
          query GetUser { user { oldField } }
        \`;
      `,
      'schema.graphql': `
        type User {
          oldField: String @deprecated(reason: "Use newField")
          newField: String
        }
      `
    });
    
    // Run extraction
    const extractor = new UnifiedExtractor();
    const extracted = await extractor.extract({ sourcePaths: [testDir] });
    
    // Run transformation
    const transformer = new OptimizedSchemaTransformer();
    const transformed = await transformer.transformBatch(extracted.operations);
    
    // Verify transformation
    expect(transformed[0].content).toContain('newField');
    expect(transformed[0].content).not.toContain('oldField');
  });
});
```

### 3. Edge Case Tests
Test boundary conditions and error scenarios:

```typescript
describe('Edge Cases', () => {
  it('should handle empty files gracefully', async () => {
    const result = await extractor.extractFromFile(emptyFile);
    expect(result.operations).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('should handle malformed GraphQL', async () => {
    const malformed = createMockFile('gql`query {`'); // Missing closing
    const result = await extractor.extractFromFile(malformed);
    
    expect(result.operations).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('PARSE_ERROR');
  });

  it('should handle circular fragment references', async () => {
    const circular = `
      fragment A on User { ...B }
      fragment B on User { ...A }
    `;
    
    await expect(resolver.resolveFragments(circular))
      .rejects.toThrow('Circular fragment reference detected');
  });
});
```

## Mocking Best Practices

### Mock External Dependencies
```typescript
// ✅ GOOD - Mock external services
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn()
}));
```

### Create Typed Mocks
```typescript
// ✅ GOOD - Type-safe mock creation
import type { Logger } from '@/utils/logger';

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  };
}

// Usage
const mockLogger = createMockLogger();
const service = new MyService(mockLogger);
```

### Mock Return Values
```typescript
// ✅ GOOD - Clear mock setup
import { readFile } from 'fs/promises';

vi.mocked(readFile).mockResolvedValueOnce('file content');

// For multiple calls
vi.mocked(readFile)
  .mockResolvedValueOnce('first call')
  .mockResolvedValueOnce('second call')
  .mockRejectedValueOnce(new Error('third call fails'));
```

## Testing Async Code

### Async/Await Pattern
```typescript
// ✅ GOOD - Clean async testing
it('should load schema from file', async () => {
  const schemaPath = '/path/to/schema.graphql';
  const schemaContent = 'type Query { hello: String }';
  
  vi.mocked(readFile).mockResolvedValue(schemaContent);
  
  const schema = await loadSchema(schemaPath);
  
  expect(schema).toBeDefined();
  expect(readFile).toHaveBeenCalledWith(schemaPath, 'utf-8');
});

// ✅ GOOD - Testing rejected promises
it('should throw when schema file not found', async () => {
  vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
  
  await expect(loadSchema('missing.graphql'))
    .rejects.toThrow('Failed to load schema');
});
```

### Testing Streams
```typescript
it('should process large files in chunks', async () => {
  const chunks = ['chunk1', 'chunk2', 'chunk3'];
  const mockStream = createMockReadStream(chunks);
  
  vi.mocked(createReadStream).mockReturnValue(mockStream);
  
  const processed: string[] = [];
  await processLargeFile('/large/file', chunk => {
    processed.push(chunk);
  });
  
  expect(processed).toEqual(chunks);
});
```

## Test Data Management

### Test Fixtures
```typescript
// fixtures/queries.ts
export const SIMPLE_QUERY = `
  query GetUser {
    user {
      id
      name
    }
  }
`;

export const QUERY_WITH_VARIABLES = `
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
    }
  }
`;

// Usage in tests
import { SIMPLE_QUERY } from '../fixtures/queries';

it('should parse simple query', () => {
  const result = parseQuery(SIMPLE_QUERY);
  expect(result.type).toBe('query');
});
```

### Test Builders
```typescript
// builders/query.builder.ts
export class QueryBuilder {
  private query = {
    id: 'test-id',
    name: 'TestQuery',
    content: 'query { test }',
    type: 'query' as const
  };

  withName(name: string): this {
    this.query.name = name;
    return this;
  }

  withContent(content: string): this {
    this.query.content = content;
    return this;
  }

  build(): Query {
    return { ...this.query };
  }
}

// Usage
const query = new QueryBuilder()
  .withName('GetProducts')
  .withContent('query { products { id } }')
  .build();
```

## Performance Testing

### Benchmark Tests
```typescript
// UnifiedExtractor.bench.ts
import { bench, describe } from 'vitest';

describe('UnifiedExtractor Performance', () => {
  bench('extract from small file', async () => {
    await extractor.extractFromFile(smallFile);
  });

  bench('extract from large file', async () => {
    await extractor.extractFromFile(largeFile);
  }, {
    // Only run 100 iterations for large files
    iterations: 100
  });

  bench('extract with caching', async () => {
    await extractorWithCache.extractFromFile(testFile);
  });
});
```

### Performance Assertions
```typescript
it('should complete extraction within time limit', async () => {
  const start = performance.now();
  
  await extractor.extract({ sourcePaths: [largeProject] });
  
  const duration = performance.now() - start;
  expect(duration).toBeLessThan(5000); // 5 seconds max
});
```

## Common Patterns

### Testing Error Messages
```typescript
// ✅ GOOD - Specific error testing
it('should provide helpful error message for missing schema', async () => {
  const error = await captureError(() => 
    validator.validate(query, undefined)
  );
  
  expect(error).toBeInstanceOf(ValidationError);
  expect(error.message).toContain('Schema is required');
  expect(error.code).toBe('MISSING_SCHEMA');
});
```

### Testing Side Effects
```typescript
it('should create backup before applying changes', async () => {
  const backupSpy = vi.spyOn(backupService, 'createBackup');
  
  await applicator.apply(changes, { backup: true });
  
  expect(backupSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      files: expect.arrayContaining(['file1.ts', 'file2.ts'])
    })
  );
});
```

### Testing Event Emissions
```typescript
it('should emit progress events during extraction', async () => {
  const events: ProgressEvent[] = [];
  
  extractor.on('progress', event => events.push(event));
  
  await extractor.extract({ sourcePaths: [testDir] });
  
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'file-processed',
      current: expect.any(Number),
      total: expect.any(Number)
    })
  );
});
```

## Test Debugging

### Debug Output
```typescript
// Temporarily add debug output
it.only('debug failing test', async () => {
  console.log('Input:', input);
  
  const result = await process(input);
  
  console.log('Result:', JSON.stringify(result, null, 2));
  
  expect(result).toMatchObject(expected);
});
```

### Using Test Utilities
```typescript
// Create debug utilities
export function debugQuery(query: Query): void {
  console.log('Query:', {
    name: query.name,
    type: query.type,
    contentLength: query.content.length,
    ast: query.ast ? 'present' : 'missing'
  });
}

// Use in tests
it('should transform complex query', async () => {
  const query = createComplexQuery();
  debugQuery(query);
  
  const result = await transformer.transform(query);
  // ... assertions
});
```

## CI Considerations

### Environment-Specific Tests
```typescript
// Skip tests in CI that require local resources
it.skipIf(process.env.CI)('should connect to local database', async () => {
  const db = await connectToLocalDB();
  expect(db.isConnected).toBe(true);
});

// Run only in CI
it.runIf(process.env.CI)('should work with CI database', async () => {
  const db = await connectToCIDB();
  expect(db.isConnected).toBe(true);
});
```

### Timeout Configuration
```typescript
// Increase timeout for slow operations
it('should process large dataset', async () => {
  await processLargeDataset();
}, {
  timeout: 30000 // 30 seconds
});
```

## Common Pitfalls to Avoid

### 1. Test Interdependence
```typescript
// ❌ BAD - Tests depend on order
it('test 1', () => {
  globalState.value = 1;
});

it('test 2', () => {
  expect(globalState.value).toBe(1); // Fails if test 1 doesn't run first
});

// ✅ GOOD - Independent tests
beforeEach(() => {
  globalState.value = 1;
});

it('test 2', () => {
  expect(globalState.value).toBe(1); // Always passes
});
```

### 2. Testing Implementation Details
```typescript
// ❌ BAD - Testing private methods
it('should call private method', () => {
  const spy = vi.spyOn(instance as any, '_privateMethod');
  instance.publicMethod();
  expect(spy).toHaveBeenCalled();
});

// ✅ GOOD - Testing public behavior
it('should return processed result', () => {
  const result = instance.publicMethod(input);
  expect(result).toBe(expectedOutput);
});
```

### 3. Overuse of Mocks
```typescript
// ❌ BAD - Mocking everything
vi.mock('./entire-module');

// ✅ GOOD - Mock only external dependencies
vi.mock('fs/promises');
vi.mock('@/external/api-client');
// Use real implementations for internal modules when possible
```

## Test Coverage

### Achieving Good Coverage
1. Test all public methods
2. Test error conditions
3. Test edge cases
4. Test async operations
5. Don't chase 100% - focus on critical paths

### Coverage Reports
```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/index.html
```

## Checklist for Writing Tests

- [ ] Test name clearly describes scenario
- [ ] Test is independent (no shared state)
- [ ] Uses AAA pattern (Arrange, Act, Assert)
- [ ] Mocks are properly typed
- [ ] Async operations use async/await
- [ ] Error cases are tested
- [ ] Edge cases are covered
- [ ] No implementation details tested
- [ ] Test runs quickly (<100ms for unit tests)
- [ ] No console.log left in tests

---

Remember: Good tests are an investment in code quality and developer confidence. Take the time to write them well!