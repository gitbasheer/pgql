import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingOverlay from '../src/components/LoadingOverlay';

describe('LoadingOverlay', () => {
  it('should not render when isLoading is false', () => {
    const { container } = render(
      <LoadingOverlay isLoading={false} />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it('should render with default message when isLoading is true', () => {
    render(<LoadingOverlay isLoading={true} />);
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(document.querySelector('.loading-overlay')).toBeInTheDocument();
    expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
  });

  it('should render with custom message', () => {
    const customMessage = 'Processing your request...';
    render(<LoadingOverlay isLoading={true} message={customMessage} />);
    
    expect(screen.getByText(customMessage)).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('should have correct CSS classes', () => {
    render(<LoadingOverlay isLoading={true} message="Test" />);
    
    const overlay = document.querySelector('.loading-overlay');
    const content = document.querySelector('.loading-content');
    const spinner = document.querySelector('.loading-spinner');
    
    expect(overlay).toBeInTheDocument();
    expect(content).toBeInTheDocument();
    expect(spinner).toBeInTheDocument();
  });
});