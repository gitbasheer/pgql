import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponseValidationService } from '../../src/core/validator/ResponseValidationService';
import { ResponseCaptureService } from '../../src/core/validator/ResponseCaptureService';
import { ResponseComparator } from '../../src/core/validator/ResponseComparator';
import { DocumentNode } from 'graphql';

vi.mock('../../src/core/validator/ResponseCaptureService');
vi.mock('../../src/core/validator/ResponseComparator');
vi.mock('../../src/core/validator/AlignmentGenerator', () => ({
  AlignmentGenerator: vi.fn().mockImplementation(() => ({
    generateAlignmentFunction: vi.fn(),
  })),
}));
vi.mock('../../src/core/validator/ABTestingFramework', () => ({
  ABTestingFramework: vi.fn().mockImplementation(() => ({
    createConfiguration: vi.fn(),
    createTest: vi.fn().mockResolvedValue({
      id: 'test-ab-123',
      name: 'GraphQL Migration Test',
      variants: ['control', 'treatment'],
      splitRatio: [0.5, 0.5],
      status: 'active',
    }),
    registerRollbackHandler: vi.fn(),
  })),
}));
vi.mock('../../src/core/validator/ResponseStorage', () => ({
  ResponseStorage: vi.fn().mockImplementation(() => ({
    store: vi.fn(),
    retrieve: vi.fn(),
    storeReport: vi.fn(),
    storeAlignment: vi.fn().mockResolvedValue(undefined),
  })),
  createResponseStorage: vi.fn().mockReturnValue({
    store: vi.fn(),
    retrieve: vi.fn(),
    storeReport: vi.fn(),
    storeAlignment: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('../../src/core/validator/ValidationReportGenerator', () => ({
  ValidationReportGenerator: vi.fn().mockImplementation(() => ({
    generateFullReport: vi.fn().mockResolvedValue({
      timestamp: new Date().toISOString(),
      overallRecommendation: 'safe',
      breakingChanges: [],
      alignmentFunctions: [],
      summary: {
        safeToMigrate: true,
        totalQueries: 1,
        identicalResponses: 1,
        minorDifferences: 0,
        breakingChanges: 0,
      },
    }),
  })),
}));

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
      storage: { type: 'file', path: './test-storage' },
    });

    // Setup mocks
    mockCaptureService = vi.mocked(ResponseCaptureService).mock.instances[0];
    mockComparator = vi.mocked(ResponseComparator).mock.instances[0];
  });

  it('validates transformation end-to-end', async () => {
    const mockQueries = [
      {
        id: 'test-1',
        name: 'GetVenture',
        content: 'query GetVenture($ventureId: UUID!) { venture(ventureId: $ventureId) { id } }',
        file: 'test.js',
        type: 'query' as const,
        fragments: [],
        imports: [],
        exports: [],
      },
    ];

    // Mock capture responses
    mockCaptureService.captureBaseline.mockResolvedValue({
      responses: new Map([
        [
          'test-1',
          {
            queryId: 'test-1',
            operationName: 'GetVenture',
            response: { data: { venture: { id: 'test' } } },
            metadata: {},
            timestamp: new Date(),
            version: 'baseline',
          },
        ],
      ]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 },
    });

    mockCaptureService.captureTransformed.mockResolvedValue({
      responses: new Map([
        [
          'test-1',
          {
            queryId: 'test-1',
            operationName: 'GetVenture',
            response: { data: { venture: { id: 'test' } } },
            metadata: {},
            timestamp: new Date(),
            version: 'transformed',
          },
        ],
      ]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 },
      transformationVersion: 'latest',
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
      recommendation: 'safe',
    });

    const report = await service.validateTransformation(mockQueries, mockQueries);

    expect(report.summary.safeToMigrate).toBe(true);
    expect(mockCaptureService.captureBaseline).toHaveBeenCalledWith(mockQueries, undefined);
    expect(mockCaptureService.captureTransformed).toHaveBeenCalledWith(mockQueries, undefined);
    expect(mockComparator.compare).toHaveBeenCalled();
  });

  it('handles missing responses in comparison', async () => {
    const mockQueries = [
      {
        id: 'test-missing',
        name: 'GetMissing',
        content: 'query GetMissing { missing { id } }',
        file: 'test.js',
        type: 'query' as const,
        fragments: [],
        imports: [],
        exports: [],
      },
    ];

    // Mock capture with missing transformed response
    mockCaptureService.captureBaseline.mockResolvedValue({
      responses: new Map([
        [
          'test-missing',
          {
            queryId: 'test-missing',
            operationName: 'GetMissing',
            response: { data: { missing: { id: 'test' } } },
            metadata: {},
            timestamp: new Date(),
            version: 'baseline',
          },
        ],
      ]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 },
    });

    mockCaptureService.captureTransformed.mockResolvedValue({
      responses: new Map(), // Empty - no transformed response
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 0, errorCount: 1 },
      transformationVersion: 'latest',
    });

    // Update the mock to return unsafe for missing responses
    const mockReportGen = vi.mocked(service['reportGenerator']);
    mockReportGen.generateFullReport.mockResolvedValueOnce({
      timestamp: new Date().toISOString(),
      overallRecommendation: 'unsafe',
      breakingChanges: [
        {
          type: 'response-missing',
          path: 'response',
          description: 'Query test-missing response is missing',
          impact: 'critical',
          migrationStrategy: 'Ensure query can be executed successfully',
        },
      ],
      alignmentFunctions: [],
      summary: {
        safeToMigrate: false,
        totalQueries: 1,
        identicalResponses: 0,
        minorDifferences: 0,
        breakingChanges: 1,
      },
      comparisons: [
        {
          queryId: 'test-missing',
          operationName: 'GetMissing',
          identical: false,
          similarity: 0,
          differences: [
            {
              path: 'response',
              type: 'missing-field',
              baseline: 'present',
              transformed: 'missing',
              severity: 'critical',
              description: 'Transformed response is missing',
              fixable: false,
            },
          ],
          breakingChanges: [],
          performanceImpact: { latencyChange: 0, sizeChange: 0, recommendation: '' },
          recommendation: 'unsafe',
        },
      ],
    });

    const report = await service.validateTransformation(mockQueries, mockQueries);

    expect(report.summary.safeToMigrate).toBe(false);
    expect(report.comparisons[0].identical).toBe(false);
    expect(report.comparisons[0].differences[0].type).toBe('missing-field');
  });

  it('generates alignment functions for differences', async () => {
    const mockQueries = [
      {
        id: 'test-diff',
        name: 'GetDiff',
        content: 'query GetDiff { venture { oldField } }',
        file: 'test.js',
        type: 'query' as const,
        fragments: [],
        imports: [],
        exports: [],
      },
    ];

    // Setup responses with differences
    mockCaptureService.captureBaseline.mockResolvedValue({
      responses: new Map([
        [
          'test-diff',
          {
            queryId: 'test-diff',
            operationName: 'GetDiff',
            response: { data: { venture: { oldField: 'value' } } },
            metadata: {},
            timestamp: new Date(),
            version: 'baseline',
          },
        ],
      ]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 },
    });

    mockCaptureService.captureTransformed.mockResolvedValue({
      responses: new Map([
        [
          'test-diff',
          {
            queryId: 'test-diff',
            operationName: 'GetDiff',
            response: { data: { venture: { newField: 'value' } } },
            metadata: {},
            timestamp: new Date(),
            version: 'transformed',
          },
        ],
      ]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 },
      transformationVersion: 'latest',
    });

    // Mock comparison with fixable differences
    mockComparator.compare.mockReturnValue({
      queryId: 'test-diff',
      operationName: 'GetDiff',
      identical: false,
      similarity: 0.8,
      differences: [
        {
          path: 'venture.oldField',
          type: 'field-rename',
          baseline: 'oldField',
          transformed: 'newField',
          severity: 'medium',
          fixable: true,
        },
      ],
      breakingChanges: [],
      performanceImpact: { latencyChange: 0, sizeChange: 0 },
      recommendation: 'safe-with-alignment',
    });

    // Update mock to include alignments
    const mockReportGen = vi.mocked(service['reportGenerator']);
    const mockAlignmentGen = vi.mocked(service['alignmentGenerator']);

    mockAlignmentGen.generateAlignmentFunction.mockReturnValue({
      queryId: 'test-diff',
      alignmentCode: 'function align() { /* mapping logic */ }',
      description: 'Aligns oldField to newField',
    });

    mockReportGen.generateFullReport.mockResolvedValueOnce({
      timestamp: new Date().toISOString(),
      overallRecommendation: 'safe-with-alignment',
      breakingChanges: [],
      alignmentFunctions: [
        {
          queryId: 'test-diff',
          alignmentCode: 'function align() { /* mapping logic */ }',
          description: 'Aligns oldField to newField',
        },
      ],
      alignments: [
        {
          queryId: 'test-diff',
          alignmentCode: 'function align() { /* mapping logic */ }',
          description: 'Aligns oldField to newField',
        },
      ],
      summary: {
        safeToMigrate: true,
        totalQueries: 1,
        identicalResponses: 0,
        minorDifferences: 1,
        breakingChanges: 0,
        requiresAlignment: true,
      },
      comparisons: [],
    });

    const report = await service.validateTransformation(mockQueries, mockQueries, {
      generateAlignments: true,
    });

    expect(report.alignments).toHaveLength(1);
    expect(report.summary.requiresAlignment).toBe(true);
  });

  it('sets up A/B testing based on risk assessment', async () => {
    const mockQueries = [
      {
        id: 'test-ab',
        name: 'GetAB',
        content: 'query GetAB { venture { id } }',
        file: 'test.js',
        type: 'query' as const,
        fragments: [],
        imports: [],
        exports: [],
      },
    ];

    // Mock successful capture and comparison
    mockCaptureService.captureBaseline.mockResolvedValue({
      responses: new Map([
        [
          'test-ab',
          {
            queryId: 'test-ab',
            operationName: 'GetAB',
            response: { data: { venture: { id: 'test' } } },
            metadata: {},
            timestamp: new Date(),
            version: 'baseline',
          },
        ],
      ]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 },
    });

    mockCaptureService.captureTransformed.mockResolvedValue({
      responses: new Map([
        [
          'test-ab',
          {
            queryId: 'test-ab',
            operationName: 'GetAB',
            response: { data: { venture: { id: 'test' } } },
            metadata: {},
            timestamp: new Date(),
            version: 'transformed',
          },
        ],
      ]),
      metadata: { capturedAt: new Date(), totalQueries: 1, successCount: 1, errorCount: 0 },
      transformationVersion: 'latest',
    });

    mockComparator.compare.mockReturnValue({
      queryId: 'test-ab',
      operationName: 'GetAB',
      identical: true,
      similarity: 1.0,
      differences: [],
      breakingChanges: [],
      performanceImpact: { latencyChange: 0, sizeChange: 0 },
      recommendation: 'safe',
    });

    const report = await service.validateTransformation(mockQueries, mockQueries, {
      setupABTest: true,
    });

    expect(report.abTestConfig).toBeDefined();
    expect(report.abTestConfig?.splitPercentage).toBeGreaterThan(0);
  });
});
