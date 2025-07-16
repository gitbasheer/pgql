import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Create a div with id root for react-modal
const root = document.createElement('div');
root.id = 'root';
document.body.appendChild(root);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Global Apollo Client mocking to prevent real API calls
vi.mock('@apollo/client/core', () => ({
  ApolloClient: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ data: {}, errors: null }),
    mutate: vi.fn().mockResolvedValue({ data: {}, errors: null }),
    subscribe: vi.fn().mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    }),
  })),
  InMemoryCache: vi.fn(),
  createHttpLink: vi.fn(),
  gql: vi.fn().mockImplementation((strings) => ({ 
    kind: 'Document',
    definitions: [],
    loc: { start: 0, end: strings[0].length }
  })),
}));

// Global fetch mocking (fallback for any unmocked fetch calls)
if (!global.fetch) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(''),
    headers: new Headers(),
  });
}
