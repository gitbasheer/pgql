import { vi } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({ 
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue('{"queries": [], "metadata": {"timestamp": "2024-01-01T00:00:00.000Z"}}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue('/tmp/mock-temp-dir'),
  rm: vi.fn().mockResolvedValue(undefined),
  rmdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
  access: vi.fn().mockResolvedValue(undefined)
}));

// Mock Apollo Client
vi.mock('@apollo/client', () => ({ 
  ApolloClient: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ data: {} })
  })),
  gql: (query: any) => query,
  InMemoryCache: vi.fn(),
  HttpLink: vi.fn()
}));

// Mock simple-git
vi.mock('simple-git', () => ({
  default: vi.fn().mockReturnValue({
    checkout: vi.fn().mockResolvedValue(undefined),
    checkoutLocalBranch: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    branch: vi.fn().mockResolvedValue({ current: 'main' })
  })
}));

// Mock graphql-inspector
vi.mock('@graphql-inspector/core', () => ({
  diff: vi.fn().mockReturnValue([]),
  validate: vi.fn().mockReturnValue([])
}));