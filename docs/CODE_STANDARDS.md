# Code Standards and Best Practices

## Overview
This document defines the coding standards and best practices for the pg-migration-620 project. Following these guidelines ensures consistency, maintainability, and quality across the codebase.

## TypeScript Standards

### General Principles
- **Strict Mode**: Always use TypeScript strict mode
- **No Any**: Avoid `any` type; use `unknown` with type guards
- **Explicit Types**: Be explicit with return types and parameters
- **Null Safety**: Handle null/undefined cases explicitly

### Type Definitions
```typescript
// ✅ GOOD - Explicit types, interfaces for objects
interface QueryOptions {
  includeFragments: boolean;
  resolveVariables: boolean;
  maxDepth?: number; // Optional with ?
}

function processQuery(query: string, options: QueryOptions): TransformResult {
  // Implementation
}

// ❌ BAD - Using any, unclear types
function processQuery(query: any, options: any) {
  // Implementation
}
```

### Async/Await Patterns
```typescript
// ✅ GOOD - Clean async/await with proper error handling
async function loadSchema(path: string): Promise<GraphQLSchema> {
  try {
    const content = await fs.readFile(path, 'utf-8');
    return buildSchema(content);
  } catch (error) {
    throw new SchemaLoadError(`Failed to load schema from ${path}`, { cause: error });
  }
}

// ❌ BAD - Promise chains, poor error handling
function loadSchema(path: string): Promise<GraphQLSchema> {
  return fs.readFile(path, 'utf-8')
    .then(content => buildSchema(content))
    .catch(err => { throw err; }); // Lost context
}
```

### Error Handling
```typescript
// ✅ GOOD - Custom error classes with context
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly file: string,
    public readonly location?: { line: number; column: number },
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ExtractionError';
  }
}

// Usage
throw new ExtractionError(
  'Invalid GraphQL syntax',
  filePath,
  { line: 10, column: 5 },
  { cause: originalError }
);

// ❌ BAD - Generic errors without context
throw new Error('Extraction failed');
```

## Code Organization

### File Structure
```typescript
// ✅ GOOD - Clear separation of concerns
// UserService.ts
export interface UserServiceOptions {
  // Options
}

export class UserService {
  constructor(private options: UserServiceOptions) {}
  
  async getUser(id: string): Promise<User> {
    // Implementation
  }
}

// UserService.test.ts - Tests in parallel file
// UserService.types.ts - Complex types if needed
```

### Module Exports
```typescript
// ✅ GOOD - Explicit exports from index
// index.ts
export { UserService } from './UserService';
export type { UserServiceOptions } from './UserService';
export type { User, UserRole } from './types';

// ❌ BAD - Barrel exports with *
export * from './UserService';
```

### Import Organization
```typescript
// ✅ GOOD - Organized imports
// 1. Node built-ins
import fs from 'fs/promises';
import path from 'path';

// 2. External dependencies
import { GraphQLSchema } from 'graphql';
import { z } from 'zod';

// 3. Internal absolute imports
import { logger } from '@/utils/logger';
import type { QueryOptions } from '@/types';

// 4. Relative imports
import { parseQuery } from './parser';
import type { LocalType } from './types';
```

## Naming Conventions

### Variables and Functions
```typescript
// ✅ GOOD - Descriptive names, camelCase
const queryResults = await extractor.extract(sourcePath);
const isValidQuery = validateGraphQLSyntax(query);

function extractQueriesFromFile(filePath: string): Promise<Query[]> {
  // Implementation
}

// ❌ BAD - Unclear names, wrong case
const q = await e.extract(p);
const valid = check(q);
```

### Classes and Interfaces
```typescript
// ✅ GOOD - PascalCase, descriptive
class QueryExtractor {
  // Implementation
}

interface ExtractionResult {
  queries: Query[];
  errors: ExtractionError[];
}

// ❌ BAD - Wrong case, unclear
class query_extractor { }
interface Result { }
```

### Constants and Enums
```typescript
// ✅ GOOD - UPPER_SNAKE_CASE for constants
const MAX_QUERY_DEPTH = 10;
const DEFAULT_TIMEOUT_MS = 30000;

enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Error = 'error'
}

// ❌ BAD - Inconsistent naming
const maxDepth = 10;
const timeout_ms = 30000;
```

## Testing Standards

### Test Structure
```typescript
// ✅ GOOD - Clear structure with AAA pattern
describe('QueryExtractor', () => {
  describe('extract', () => {
    it('should extract queries from TypeScript files', async () => {
      // Arrange
      const extractor = new QueryExtractor();
      const testFile = createTestFile('query.ts');
      
      // Act
      const result = await extractor.extract(testFile);
      
      // Assert
      expect(result.queries).toHaveLength(1);
      expect(result.queries[0].type).toBe('query');
    });
    
    it('should handle syntax errors gracefully', async () => {
      // Test error cases
    });
  });
});
```

### Mock Usage
```typescript
// ✅ GOOD - Type-safe mocks with vi
import { vi, expect, describe, it } from 'vitest';

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// ❌ BAD - Untyped mocks, using jest
jest.mock('../logger'); // No types!
```

## Documentation Standards

### JSDoc Comments
```typescript
// ✅ GOOD - Comprehensive JSDoc
/**
 * Extracts GraphQL operations from source files.
 * 
 * @param sourcePaths - Array of file or directory paths to scan
 * @param options - Extraction options
 * @returns Extraction result containing operations and metadata
 * @throws {ExtractionError} If source files cannot be read
 * @example
 * ```typescript
 * const result = await extractor.extract(['./src'], {
 *   includeFragments: true,
 *   maxDepth: 5
 * });
 * ```
 */
async function extract(
  sourcePaths: string[],
  options?: ExtractOptions
): Promise<ExtractionResult> {
  // Implementation
}
```

### Inline Comments
```typescript
// ✅ GOOD - Explains "why", not "what"
// Use binary search for performance with large arrays
const index = binarySearch(sortedQueries, targetId);

// Skip validation for known safe system queries
if (isSystemQuery(query)) {
  return { valid: true };
}

// ❌ BAD - Obvious comments
// Set count to 0
let count = 0;

// Loop through array
for (const item of items) {
  // Increment count
  count++;
}
```

## Performance Considerations

### Efficient Algorithms
```typescript
// ✅ GOOD - Use efficient data structures
const queryMap = new Map<string, Query>();
for (const query of queries) {
  queryMap.set(query.id, query);
}

// O(1) lookup
const query = queryMap.get(id);

// ❌ BAD - Inefficient lookup
const query = queries.find(q => q.id === id); // O(n)
```

### Memory Management
```typescript
// ✅ GOOD - Stream large files
import { createReadStream } from 'fs';

async function processLargeFile(path: string) {
  const stream = createReadStream(path, { encoding: 'utf8' });
  
  for await (const chunk of stream) {
    processChunk(chunk);
  }
}

// ❌ BAD - Load entire file into memory
const content = await fs.readFile(hugePath, 'utf-8');
```

## Security Standards

### Input Validation
```typescript
// ✅ GOOD - Validate and sanitize inputs
import { z } from 'zod';

const QuerySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  content: z.string().max(10000)
});

function validateQuery(input: unknown): Query {
  return QuerySchema.parse(input);
}

// ❌ BAD - Trust user input
function processQuery(query: any) {
  db.execute(query.content); // SQL injection risk!
}
```

### Path Handling
```typescript
// ✅ GOOD - Safe path handling
import path from 'path';

function readQueryFile(userPath: string): Promise<string> {
  // Resolve and validate path
  const safePath = path.resolve(process.cwd(), userPath);
  
  // Ensure path is within project
  if (!safePath.startsWith(process.cwd())) {
    throw new Error('Path traversal attempt detected');
  }
  
  return fs.readFile(safePath, 'utf-8');
}
```

## CLI Standards

### Output Consistency
```typescript
// ✅ GOOD - Structured output with exit codes
export async function executeCommand(): Promise<void> {
  try {
    const result = await doWork();
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`✓ Processed ${result.count} queries`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}
```

### Progress Reporting
```typescript
// ✅ GOOD - Conditional progress based on environment
import ora from 'ora';

const showProgress = !process.env.CI && !options.quiet;
const spinner = showProgress ? ora('Processing...').start() : null;

try {
  const result = await process();
  spinner?.succeed('Complete');
} catch (error) {
  spinner?.fail('Failed');
  throw error;
}
```

## Git and Version Control

### Commit Messages
```
✅ GOOD:
feat: add variant extraction to UnifiedExtractor
fix: handle empty query files in transformer
docs: update migration guide with new options
test: add edge cases for fragment resolution
refactor: consolidate duplicate validation logic

❌ BAD:
update code
fix stuff
WIP
```

### Branch Naming
```
✅ GOOD:
feature/variant-extraction
fix/empty-file-handling
docs/update-migration-guide
refactor/consolidate-validators

❌ BAD:
mychanges
fix
new-stuff
```

## Code Review Checklist

Before submitting PR:
- [ ] TypeScript strict mode passes
- [ ] No `any` types without justification  
- [ ] All functions have explicit return types
- [ ] Error handling is comprehensive
- [ ] Tests cover happy path and edge cases
- [ ] Documentation is updated
- [ ] No console.log in production code
- [ ] Performance impact considered
- [ ] Security implications reviewed
- [ ] CLI output format preserved

## Enforcement

These standards are enforced through:
1. **ESLint** - Catches style violations
2. **TypeScript** - Enforces type safety
3. **Prettier** - Ensures consistent formatting
4. **PR Reviews** - Human verification
5. **CI Checks** - Automated validation

---

Remember: Consistency is key. When in doubt, follow existing patterns in the codebase.