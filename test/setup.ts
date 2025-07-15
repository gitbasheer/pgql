import { vi } from 'vitest';

// Smart fs/promises mock that tracks written content
const mockFileSystem = new Map<string, string>();

vi.mock('fs/promises', () => ({ 
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockImplementation((filePath: string) => {
    const content = mockFileSystem.get(filePath);
    return Promise.resolve(content || '{"queries": [], "metadata": {"timestamp": "2024-01-01T00:00:00.000Z"}}');
  }),
  writeFile: vi.fn().mockImplementation((filePath: string, content: string) => {
    mockFileSystem.set(filePath, content);
    return Promise.resolve(undefined);
  }),
  mkdir: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue('/tmp/test-dir-123'),
  rm: vi.fn().mockImplementation((filePath: string) => {
    mockFileSystem.delete(filePath);
    return Promise.resolve(undefined);
  }),
  rmdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
  access: vi.fn().mockResolvedValue(undefined)
}));

// Expose cleanup function for tests
(globalThis as any).clearMockFileSystem = () => mockFileSystem.clear();

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