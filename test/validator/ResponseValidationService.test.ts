import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponseValidationService } from '../../src/core/validator/ResponseValidationService';
import { ResponseCaptureService } from '../../src/core/validator/ResponseCaptureService';
import { ResponseComparator } from '../../src/core/validator/ResponseComparator';
import { DocumentNode } from 'graphql';

vi.mock('../../src/core/validator/ResponseCaptureService');
vi.mock('../../src/core/validator/ResponseComparator');
vi.mock('../../src/core/validator/AlignmentGenerator');
vi.mock('../../src/core/validator/ABTestingFramework');
vi.mock('../../src/core/validator/ResponseStorage');
vi.mock('../../src/core/validator/ValidationReportGenerator');

describe('Real API testing with dynamic variables', () => {
  let service: ResponseValidationService;
  let mockCaptureService: any;
  let mockComparator: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create service with minimal config
    service = new ResponseValidationService({
      endpoints: [{ url: 'https://api.example.com', environment: 'test' }],
      capture: { parallel: true, maxConcurrency: 10, timeout: 30000 },
      comparison: { strict: false },
      storage: { type: 'file', path: './test-storage' }
    });

    // Setup mocks
    mockCaptureService = vi.mocked(ResponseCaptureService).mock.instances[0];
    mockComparator = vi.mocked(ResponseComparator).mock.instances[0];
  });

  it('validates transformation end-to-end', async () => {
    const mockQueries = [{
      id: 'test-1',
      name: 'GetVenture',
      content: 'query GetVenture($ventureId: UUID!) { venture(ventureId: $ventureId) { id } }',
      file: 'test.js',
      type: 'query' as const,
      fragments: [],
      imports: [],
      exports: []
    }];

    // Mock capture responses
    mockCaptureService.captureBaseline.mockResolvedValue({
      responses: new Map([['test-1', { 
        queryId: 'test-1',
        operationName: 'GetVenture',
        response: { data: { venture: { id: 'test' } } },
        metadata: {},
        timestamp: new Date(),
        version: 'baseline'
      }]]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 }
    });

    mockCaptureService.captureTransformed.mockResolvedValue({
      responses: new Map([['test-1', { 
        queryId: 'test-1',
        operationName: 'GetVenture',
        response: { data: { venture: { id: 'test' } } },
        metadata: {},
        timestamp: new Date(),
        version: 'transformed'
      }]]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 },
      transformationVersion: 'latest'
    });

    // Mock comparison
    mockComparator.compare.mockReturnValue({
      queryId: 'test-1',
      operationName: 'GetVenture',
      identical: true,
      similarity: 1.0,
      differences: [],
      breakingChanges: [],
      performanceImpact: { latencyChange: 0, sizeChange: 0 },
      recommendation: 'safe'
    });

    const report = await service.validateTransformation(mockQueries, mockQueries);
    
    expect(report.summary.safeToMigrate).toBe(true);
    expect(mockCaptureService.captureBaseline).toHaveBeenCalledWith(mockQueries, undefined);
    expect(mockCaptureService.captureTransformed).toHaveBeenCalledWith(mockQueries, undefined);
    expect(mockComparator.compare).toHaveBeenCalled();
  });

  it('handles missing responses in comparison', async () => {
    const mockQueries = [{
      id: 'test-missing',
      name: 'GetMissing',
      content: 'query GetMissing { missing { id } }',
      file: 'test.js',
      type: 'query' as const,
      fragments: [],
      imports: [],
      exports: []
    }];

    // Mock capture with missing transformed response
    mockCaptureService.captureBaseline.mockResolvedValue({
      responses: new Map([['test-missing', { 
        queryId: 'test-missing',
        operationName: 'GetMissing',
        response: { data: { missing: { id: 'test' } } },
        metadata: {},
        timestamp: new Date(),
        version: 'baseline'
      }]]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 }
    });

    mockCaptureService.captureTransformed.mockResolvedValue({
      responses: new Map(), // Empty - no transformed response
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 0, errorCount: 1 },
      transformationVersion: 'latest'
    });

    const report = await service.validateTransformation(mockQueries, mockQueries);
    
    expect(report.summary.safeToMigrate).toBe(false);
    expect(report.comparisons[0].identical).toBe(false);
    expect(report.comparisons[0].differences[0].type).toBe('missing-field');
  });

  it('generates alignment functions for differences', async () => {
    const mockQueries = [{
      id: 'test-diff',
      name: 'GetDiff',
      content: 'query GetDiff { venture { oldField } }',
      file: 'test.js',
      type: 'query' as const,
      fragments: [],
      imports: [],
      exports: []
    }];

    // Setup responses with differences
    mockCaptureService.captureBaseline.mockResolvedValue({
      responses: new Map([['test-diff', { 
        queryId: 'test-diff',
        operationName: 'GetDiff',
        response: { data: { venture: { oldField: 'value' } } },
        metadata: {},
        timestamp: new Date(),
        version: 'baseline'
      }]]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 }
    });

    mockCaptureService.captureTransformed.mockResolvedValue({
      responses: new Map([['test-diff', { 
        queryId: 'test-diff',
        operationName: 'GetDiff',
        response: { data: { venture: { newField: 'value' } } },
        metadata: {},
        timestamp: new Date(),
        version: 'transformed'
      }]]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 },
      transformationVersion: 'latest'
    });

    // Mock comparison with fixable differences
    mockComparator.compare.mockReturnValue({
      queryId: 'test-diff',
      operationName: 'GetDiff',
      identical: false,
      similarity: 0.8,
      differences: [{
        path: 'venture.oldField',
        type: 'field-rename',
        baseline: 'oldField',
        transformed: 'newField',
        severity: 'medium',
        fixable: true
      }],
      breakingChanges: [],
      performanceImpact: { latencyChange: 0, sizeChange: 0 },
      recommendation: 'safe-with-alignment'
    });

    const report = await service.validateTransformation(mockQueries, mockQueries, { generateAlignments: true });
    
    expect(report.alignments).toHaveLength(1);
    expect(report.summary.requiresAlignment).toBe(true);
  });

  it('sets up A/B testing based on risk assessment', async () => {
    const mockQueries = [{
      id: 'test-ab',
      name: 'GetAB',
      content: 'query GetAB { venture { id } }',
      file: 'test.js',
      type: 'query' as const,
      fragments: [],
      imports: [],
      exports: []
    }];

    // Mock successful capture and comparison
    mockCaptureService.captureBaseline.mockResolvedValue({
      responses: new Map([['test-ab', { 
        queryId: 'test-ab',
        operationName: 'GetAB',
        response: { data: { venture: { id: 'test' } } },
        metadata: {},
        timestamp: new Date(),
        version: 'baseline'
      }]]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 }
    });

    mockCaptureService.captureTransformed.mockResolvedValue({
      responses: new Map([['test-ab', { 
        queryId: 'test-ab',
        operationName: 'GetAB',
        response: { data: { venture: { id: 'test' } } },
        metadata: {},
        timestamp: new Date(),
        version: 'transformed'
      }]]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 },
      transformationVersion: 'latest'
    });

    mockComparator.compare.mockReturnValue({
      queryId: 'test-ab',
      operationName: 'GetAB',
      identical: true,
      similarity: 1.0,
      differences: [],
      breakingChanges: [],
      performanceImpact: { latencyChange: 0, sizeChange: 0 },
      recommendation: 'safe'
    });

    const report = await service.validateTransformation(mockQueries, mockQueries, { setupABTest: true });
    
    expect(report.abTestConfig).toBeDefined();
    expect(report.abTestConfig?.splitPercentage).toBeGreaterThan(0);
  });
});