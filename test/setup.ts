import { vi } from 'vitest';
vi.mock('fs/promises', () => ({ readdir: vi.fn(), readFile: vi.fn() }));
vi.mock('@apollo/client', () => ({ ApolloClient: vi.fn(), gql: (query: string) => query }));