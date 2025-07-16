import { vi } from 'vitest';
import type { MockedFunction, MockedObject } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ExtractedQuery } from '@core/extraction/types';
import type { TransformResult } from '@core/transformer/types';
import type { ValidationResult } from '@core/validator/SchemaValidator';
import type { GitHubService } from '@core/integration/GitHubService';
import type { ConfigLoader } from '@utils/ConfigLoader.js';

/**
 * Wait for all pending promises to resolve
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Create a deferred promise for testing async operations
 */
export function createDeferredPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Wait for a condition to be true
 * @param condition - Function returning boolean or promise resolving to boolean
 * @param timeout - Maximum time to wait in milliseconds
 * @param interval - Check interval in milliseconds
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 50,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Create a mock that tracks call order across multiple mocks
 */
export function createOrderedMocks<T extends Record<string, (...args: any[]) => any>>(
  mocks: T,
): T & { getCallOrder(): string[] } {
  const callOrder: string[] = [];

  const trackedMocks = {} as T;

  for (const [name, fn] of Object.entries(mocks)) {
    trackedMocks[name as keyof T] = vi.fn((...args) => {
      callOrder.push(name);
      return fn(...args);
    }) as any;
  }

  return {
    ...trackedMocks,
    getCallOrder: () => [...callOrder],
  };
}

/**
 * Assert that an async function throws with a specific error
 */
export async function expectAsyncError(
  fn: () => Promise<any>,
  expectedError: string | RegExp | Error,
): Promise<void> {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (expectedError instanceof Error) {
      expect(error).toEqual(expectedError);
    } else if (expectedError instanceof RegExp) {
      expect((error as Error).message).toMatch(expectedError);
    } else {
      expect((error as Error).message).toBe(expectedError);
    }
  }
}

/**
 * Create a mock that returns different values on subsequent calls
 */
export function createSequenceMock<T>(sequence: T[]): MockedFunction<() => T> {
  let index = 0;
  return vi.fn(() => {
    const value = sequence[index % sequence.length];
    index++;
    return value;
  });
}

/**
 * Test data builders for common types
 */
export const testDataBuilders = {
  /**
   * Build a test file path
   */
  filePath: (name: string, ext = 'ts'): string => {
    return `/test/files/${name}.${ext}`;
  },

  /**
   * Build a test GraphQL query
   */
  query: (name: string, fields: string[] = ['id']): string => {
    return `query ${name} { users { ${fields.join(' ')} } }`;
  },

  /**
   * Build a test error
   */
  error: (message: string, code?: string): Error => {
    const error = new Error(message);
    if (code) {
      (error as any).code = code;
    }
    return error;
  },
};

/**
 * Mock console methods for testing
 */
export function mockConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = vi.fn((...args) => {
    logs.push(args.join(' '));
  });

  console.error = vi.fn((...args) => {
    errors.push(args.join(' '));
  });

  console.warn = vi.fn((...args) => {
    warns.push(args.join(' '));
  });

  return {
    logs,
    errors,
    warns,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

/**
 * Create a test context that automatically cleans up
 */
export function createTestContext<T>(
  setup: () => T | Promise<T>,
  cleanup?: (context: T) => void | Promise<void>,
): {
  get: () => T;
  cleanup: () => Promise<void>;
} {
  let context: T | undefined;

  return {
    get: () => {
      if (!context) {
        throw new Error('Test context not initialized. Call setup first.');
      }
      return context;
    },
    cleanup: async () => {
      if (context && cleanup) {
        await cleanup(context);
      }
      context = undefined;
    },
  };
}

// Type-safe mock creation helpers
export const createMock = <T extends object>(implementation: Partial<T> = {}): MockedObject<T> => {
  const handler: ProxyHandler<any> = {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }

      // Auto-create mock functions
      const mockFn = vi.fn();
      target[prop] = mockFn;
      return mockFn;
    },
  };

  return new Proxy(implementation, handler) as MockedObject<T>;
};

export const createFunctionMock = <T extends (...args: any[]) => any>(
  implementation: T | undefined = undefined,
): MockedFunction<T> => {
  if (implementation) {
    return vi.fn(implementation) as MockedFunction<T>;
  }
  return vi.fn() as MockedFunction<T>;
};

// ESM-compatible module mocking
export const mockModule = <T>(modulePath: string, factory: () => T): void => {
  vi.doMock(modulePath, factory);
};

// File system helpers
export const createTempDir = async (): Promise<string> => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-migration-test-'));
  return tmpDir;
};

export const cleanupTempDir = async (dir: string): Promise<void> => {
  const fs = await import('node:fs/promises');
  await fs.rm(dir, { recursive: true, force: true });
};

// Mock factories with proper typing
export const mockFactories = {
  createGitHubService: (): MockedObject<GitHubService> => {
    return createMock<GitHubService>({
      validateGitHub: vi.fn().mockResolvedValue(true),
      createPR: vi.fn().mockResolvedValue({
        url: 'https://github.com/test/repo/pull/1',
        number: 1,
        state: 'open' as const,
        title: 'Test PR',
        body: 'Test body',
        base: 'main',
        head: 'feature',
      }),
      getGitStatus: vi.fn().mockResolvedValue({
        isGitRepo: true,
        currentBranch: 'main',
        hasUncommittedChanges: false,
      }),
      createFeatureBranch: vi.fn().mockResolvedValue('feature-branch'),
      stageFiles: vi.fn().mockResolvedValue(undefined),
      createCommit: vi.fn().mockResolvedValue('abc123'),
      pushToRemote: vi.fn().mockResolvedValue(undefined),
      generatePRBody: vi.fn().mockReturnValue('PR Body'),
      generateBranchName: vi.fn().mockReturnValue('feature-branch'),
    });
  },

  createConfigLoader: (): typeof ConfigLoader => {
    const mock = {
      load: vi.fn().mockResolvedValue({
        source: { include: ['src/**/*.js'], exclude: ['node_modules'] },
        schemaPath: './schema.graphql',
      }),
      loadSchema: vi.fn().mockResolvedValue('type Query { test: String }'),
      validate: vi.fn().mockResolvedValue(true),
    };

    return mock as any;
  },

  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),

  createSpinner: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  }),
};

// Test data builders
export class TestDataBuilder {
  static extractedQuery(overrides: Partial<ExtractedQuery> = {}): ExtractedQuery {
    return {
      id: 'test-query-id',
      name: 'TestQuery',
      content: 'query TestQuery { test }',
      type: 'query',
      filePath: '/test/file.js',
      ast: null,
      location: {
        line: 1,
        column: 1,
        file: '/test/file.js',
      },
      ...overrides,
    };
  }

  static transformResult(overrides: Partial<TransformResult> = {}): TransformResult {
    return {
      queryId: 'test-query-id',
      originalQuery: 'query { old }',
      transformedQuery: 'query { new }',
      changes: [
        {
          type: 'field',
          path: 'Query.old',
          oldValue: 'old',
          newValue: 'new',
          reason: 'Field deprecated',
        },
      ],
      confidence: 95,
      metadata: {
        transformationType: 'deprecation',
        appliedRules: ['field-rename'],
      },
      ...overrides,
    };
  }

  static validationResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
      ...overrides,
    };
  }
}

// Performance testing utilities
export class PerformanceTester {
  private measurements: Map<string, number[]> = new Map();

  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(duration);

    return result;
  }

  getStats(name: string): { min: number; max: number; avg: number; count: number } | null {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) return null;

    return {
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      avg: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      count: measurements.length,
    };
  }

  reset(): void {
    this.measurements.clear();
  }
}

// Snapshot testing utilities
export const createSnapshot = (name: string, data: any): void => {
  const snapshot = {
    name,
    data,
    timestamp: new Date().toISOString(),
  };

  // Implementation would save to __snapshots__ directory
  console.log('Snapshot created:', snapshot);
};

// Error testing utilities
export const expectError = async (
  fn: () => Promise<any>,
  errorType?: new (...args: any[]) => Error,
  message?: string | RegExp,
): Promise<void> => {
  let error: Error | null = null;

  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }

  if (!error) {
    throw new Error('Expected function to throw an error, but it did not');
  }

  if (errorType && !(error instanceof errorType)) {
    throw new Error(
      `Expected error to be instance of ${errorType.name}, but got ${(error as any).constructor.name}`,
    );
  }

  if (message) {
    const matches =
      typeof message === 'string' ? error.message.includes(message) : message.test(error.message);

    if (!matches) {
      throw new Error(`Expected error message to match "${message}", but got "${error.message}"`);
    }
  }
};

// Integration test helpers
export const setupIntegrationTest = async () => {
  const tempDir = await createTempDir();

  // Create test files
  const fs = await import('node:fs/promises');
  await fs.writeFile(
    join(tempDir, 'test.graphql'),
    `
      type Query {
        oldField: String @deprecated(reason: "Use newField")
        newField: String
      }
    `,
  );

  await fs.writeFile(
    join(tempDir, 'test.js'),
    `
      import { gql } from '@apollo/client';
      
      export const TEST_QUERY = gql\`
        query TestQuery {
          oldField
        }
      \`;
    `,
  );

  return {
    tempDir,
    cleanup: () => cleanupTempDir(tempDir),
  };
};

// Coverage helpers
export const excludeFromCoverage = (fn: Function): void => {
  // Mark function as excluded from coverage
  (fn as any).__coverage_skip__ = true;
};

// Export all utilities
export default {
  createMock,
  createFunctionMock,
  mockModule,
  waitFor,
  createTempDir,
  cleanupTempDir,
  mockFactories,
  TestDataBuilder,
  PerformanceTester,
  createSnapshot,
  expectError,
  setupIntegrationTest,
  excludeFromCoverage,
};
