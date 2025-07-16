import { vi, MockedFunction } from 'vitest';
import type { GraphQLSchema } from 'graphql';
import type { ExtractedQuery } from '@core/extraction/types/query.types';
import type { TransformationResult } from '@core/transformer/QueryTransformer';
import type { ValidationResult } from '@core/validator/SchemaValidator';
import type { Config } from '@core/config/ConfigValidator';

/**
 * Type-safe mock factory for creating test doubles
 */
export class MockFactory {
  /**
   * Create a mock logger with all methods
   */
  static createLogger() {
    return {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };
  }

  /**
   * Create a mock GraphQL schema
   */
  static createSchema(): GraphQLSchema {
    const { buildSchema } = require('graphql');
    return buildSchema(`
      type Query {
        user(id: ID!): User
        users: [User!]!
      }
      
      type User {
        id: ID!
        name: String!
        email: String!
      }
    `);
  }

  /**
   * Create a mock ExtractedQuery
   */
  static createExtractedQuery(overrides?: Partial<ExtractedQuery>): ExtractedQuery {
    return {
      id: 'test-query-1',
      name: 'TestQuery',
      content: 'query TestQuery { users { id name } }',
      filePath: '/test/file.js',
      startLine: 1,
      endLine: 3,
      type: 'query',
      variables: {},
      fragments: [],
      ...overrides,
    } as ExtractedQuery;
  }

  /**
   * Create a mock TransformationResult
   */
  static createTransformationResult(
    overrides?: Partial<TransformationResult>,
  ): TransformationResult {
    const { parse } = require('graphql');
    const transformed = overrides?.transformed || 'query TestQuery { users { id name email } }';

    return {
      original: overrides?.original || 'query TestQuery { users { id name } }',
      transformed,
      ast: parse(transformed),
      changes: [],
      rules: [],
      ...overrides,
    };
  }

  /**
   * Create a mock ValidationResult
   */
  static createValidationResult(overrides?: Partial<ValidationResult>): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
      ...overrides,
    };
  }

  /**
   * Create a mock Config
   */
  static createConfig(overrides?: Partial<Config>): Config {
    return {
      scanner: {
        include: ['src/**/*.{js,jsx,ts,tsx}'],
        exclude: ['**/node_modules/**'],
        maxDepth: 10,
        followImports: true,
        detectPatterns: {
          queries: true,
          mutations: true,
          subscriptions: true,
          fragments: true,
        },
      },
      analyzer: {
        schemaPath: './schema.graphql',
        enableFederation: false,
        deprecationHandling: 'warn',
      },
      transformer: {
        preserveFormatting: true,
        addSafetyComments: true,
        generateTypeAnnotations: false,
        targetVersion: 'modern',
      },
      output: {
        format: 'markdown',
        generateDiff: true,
        generateTests: false,
      },
      ...overrides,
    } as Config;
  }

  /**
   * Create a mock file system module
   */
  static createFileSystem() {
    return {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      access: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
    };
  }

  /**
   * Create a mock child process module
   */
  static createChildProcess() {
    return {
      exec: vi.fn((cmd: string, cb: Function) => cb(null, 'output', '')),
      execSync: vi.fn().mockReturnValue(Buffer.from('output')),
      spawn: vi.fn().mockReturnValue({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      }),
    };
  }

  /**
   * Create typed mock functions
   */
  static fn<T extends (...args: any[]) => any>(): MockedFunction<T> {
    return vi.fn() as MockedFunction<T>;
  }

  /**
   * Create a mock with partial implementation
   */
  static partial<T>(partial: Partial<T>): T {
    return partial as T;
  }

  /**
   * Mock a module with type safety
   */
  static async mockModule<T>(
    modulePath: string,
    factory: (actual: T) => T | Promise<T>,
  ): Promise<void> {
    vi.mock(modulePath, async () => {
      const actual = await vi.importActual<T>(modulePath);
      return await factory(actual);
    });
  }
}
