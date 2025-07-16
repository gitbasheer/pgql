/** @fileoverview Test setup file for vitest */

import { vi } from 'vitest';

// Mock global environment variables
process.env.NODE_ENV = 'test';
process.env.PGQL_LOG_LEVEL = 'error';

// Mock logger to avoid console output in tests
vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock file system operations that might not exist
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
  };
});

// Mock GraphQL schema files
vi.mock('../data/schema.graphql', () => ({
  default: 'type Query { hello: String }',
}));

vi.mock('../data/billing-schema.graphql', () => ({
  default: 'type Query { billing: String }',
}));

// Setup global test helpers
global.testEnvironment = 'vitest';