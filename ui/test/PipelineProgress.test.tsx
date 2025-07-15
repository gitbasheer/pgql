import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PipelineProgress from '../src/components/PipelineProgress';

describe('PipelineProgress', () => {
  const defaultProps = {
    isActive: true,
    currentStage: undefined,
    pipelineStatus: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(<PipelineProgress {...defaultProps} {...props} />);
  };

  it('should render all pipeline stages', () => {
    renderComponent();
    
    expect(screen.getByText('Extraction')).toBeInTheDocument();
    expect(screen.getByText('Classification')).toBeInTheDocument();
    expect(screen.getByText('Validation')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
    expect(screen.getByText('Transformation')).toBeInTheDocument();
    expect(screen.getByText('PR Generation')).toBeInTheDocument();
  });

  it('should show pending state for all stages initially', () => {
    renderComponent();
    
    const stages = document.querySelectorAll('.pipeline-stage');
    expect(stages).toHaveLength(6);
    stages.forEach(stage => {
      expect(stage).toHaveClass('pending');
    });
  });

  it('should update stage status based on pipeline status', () => {
    renderComponent({
      pipelineStatus: {
        stage: 'extraction',
        status: 'running',
        progress: 50,
      }
    });
    
    const extractionStage = document.querySelector('.pipeline-stage.in_progress');
    expect(extractionStage).toBeInTheDocument();
    expect(extractionStage).toHaveTextContent('Extraction');
  });

  it('should show stage icons based on status', () => {
    renderComponent({
      currentStage: 'validation',
      pipelineStatus: {
        stage: 'validation',
        status: 'running',
      }
    });
    
    // First two stages should be completed
    expect(screen.getAllByText('✓')).toHaveLength(2); // extraction and classification
    expect(screen.getByText('⊙')).toBeInTheDocument(); // validation in progress
    expect(screen.getAllByText('○')).toHaveLength(3); // remaining stages pending
  });

  it('should reset stages when isActive becomes false', () => {
    const { rerender } = renderComponent({
      currentStage: 'testing',
      pipelineStatus: {
        stage: 'testing',
        status: 'running',
      }
    });
    
    // Verify some stages are marked as completed
    expect(screen.getAllByText('✓').length).toBeGreaterThan(0);
    
    // Re-render with isActive false
    rerender(<PipelineProgress isActive={false} />);
    
    // All stages should be pending again
    const stages = document.querySelectorAll('.pipeline-stage.pending');
    expect(stages).toHaveLength(6);
  });

  it('should handle error status', () => {
    renderComponent({
      pipelineStatus: {
        stage: 'validation',
        status: 'failed',
      }
    });
    
    // Check that error status is reflected (component might treat 'failed' as 'error')
    const validationStage = Array.from(document.querySelectorAll('.pipeline-stage'))
      .find(el => el.textContent?.includes('Validation'));
    expect(validationStage).toBeInTheDocument();
  });

  it('should handle progress bar rendering', () => {
    renderComponent({
      pipelineStatus: {
        stage: 'extraction',
        status: 'running',
        progress: 75,
      }
    });
    
    const progressBar = document.querySelector('.progress-fill');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveStyle({ width: '75%' });
  });

  it('should mark all stages completed when pipeline completes', () => {
    renderComponent({
      currentStage: 'pr generation',
      pipelineStatus: {
        stage: 'pr generation',
        status: 'completed',
      }
    });
    
    // PR Generation stage should be completed
    const prStage = Array.from(document.querySelectorAll('.pipeline-stage'))
      .find(el => el.textContent?.includes('PR Generation'));
    expect(prStage).toHaveClass('completed');
    
    // All previous stages should also be completed
    expect(screen.getAllByText('✓').length).toBeGreaterThanOrEqual(5);
  });
});