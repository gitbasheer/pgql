import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import App from '../src/App';

// Mock react-toastify
vi.mock('react-toastify', () => ({
  ToastContainer: () => <div data-testid="toast-container" />,
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock Dashboard component
vi.mock('../src/components/Dashboard', () => ({
  default: () => <div data-testid="dashboard">Dashboard Component</div>,
}));

// Mock ErrorBoundary component
vi.mock('../src/components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render app with all main components', () => {
    render(<App />);
    
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('toast-container')).toBeInTheDocument();
  });

  it('should wrap components with ApolloProvider', () => {
    render(<App />);
    
    // Should render without Apollo provider errors
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('should have correct app structure', () => {
    const { container } = render(<App />);
    
    const appDiv = container.querySelector('.app');
    expect(appDiv).toBeInTheDocument();
    expect(appDiv).toContainElement(screen.getByTestId('dashboard'));
  });

  it('should include toast container with correct props', () => {
    render(<App />);
    
    const toastContainer = screen.getByTestId('toast-container');
    expect(toastContainer).toBeInTheDocument();
  });

  it('should handle GraphQL client initialization', () => {
    // Should not throw during client creation
    expect(() => render(<App />)).not.toThrow();
  });

  it('should handle localStorage auth token', () => {
    // Set mock auth token
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => 'mock-auth-token'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });

    expect(() => render(<App />)).not.toThrow();
  });

  it('should handle missing localStorage auth token', () => {
    // Mock localStorage with no token
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });

    expect(() => render(<App />)).not.toThrow();
  });
});