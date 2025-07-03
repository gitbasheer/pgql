import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { ResponseValidationService } from '../../core/validator/ResponseValidationService';
import { ResponseCaptureService } from '../../core/validator/ResponseCaptureService';
import { ResponseComparator } from '../../core/validator/ResponseComparator';
import { AlignmentGenerator } from '../../core/validator/AlignmentGenerator';
import { ABTestingFramework } from '../../core/validator/ABTestingFramework';
import { ResponseStorage } from '../../core/validator/ResponseStorage';
import { ValidationReportGenerator } from '../../core/validator/ValidationReportGenerator';
import {
  ResponseValidationConfig,
  EndpointConfig,
  ValidationReport,
  ComparisonResult,
  BaselineResponses,
  TransformedResponses,
  CapturedResponse,
  ABTestConfig,
  AlignmentFunction
} from '../../core/validator/types';
import { ResolvedQuery } from '../../core/extraction/types/query.types';

// Mock all dependencies
vi.mock('../../core/validator/ResponseCaptureService');
vi.mock('../../core/validator/ResponseComparator');
vi.mock('../../core/validator/AlignmentGenerator');
vi.mock('../../core/validator/ABTestingFramework');
vi.mock('../../core/validator/ResponseStorage');
vi.mock('../../core/validator/ValidationReportGenerator');
vi.mock('../../utils/logger');

describe('ResponseValidationService', () => {

  let service: ResponseValidationService;
  let mockCaptureService: any;
  let mockComparator: any;
  let mockAlignmentGenerator: any;
  let mockABTestingFramework: any;
  let mockStorage: any;
  let mockReportGenerator: any;

  const mockConfig: ResponseValidationConfig = {
    endpoints: [{
      url: 'https://api.example.com/graphql',
      headers: { 'Authorization': 'Bearer test' }
    }],
    capture: {
      parallel: true,
      maxConcurrency: 5,
      timeout: 30000,
      variableGeneration: 'auto'
    },
    comparison: {
      strict: false,
      ignorePaths: ['data.__typename']
    },
    alignment: {
      strict: false,
      preserveNulls: true,
      preserveOrder: false
    },
    storage: {
      type: 'file',
      path: './test-storage'
    }
  };

  const mockQuery: ResolvedQuery = {
    id: 'test-query-1',
    content: 'query { test }',
    name: 'TestQuery',
    type: 'query',
    filePath: 'test.ts',
    location: { line: 1, column: 1, file: 'test.ts' },
    ast: null,
    resolvedContent: 'query { test }',
    resolvedFragments: [],
    allDependencies: []
  };

  const mockCapturedResponse: CapturedResponse = {
    queryId: 'test-query-1',
    operationName: 'TestQuery',
    variables: {},
    response: { data: { test: 'value' } },
    metadata: {
      duration: 100,
      statusCode: 200,
      headers: {},
      size: 100,
      endpoint: 'https://api.example.com/graphql',
      environment: 'production'
    },
    timestamp: new Date(),
    version: 'baseline'
  };

  function createFreshMocks() {
    return {
      mockCaptureService: {
        captureBaseline: vi.fn(),
        captureTransformed: vi.fn(),
        destroy: vi.fn()
      },
      mockComparator: {
        compare: vi.fn()
      },
      mockAlignmentGenerator: {
        generateAlignmentFunction: vi.fn()
      },
      mockABTestingFramework: {
        createTest: vi.fn(),
        registerRollbackHandler: vi.fn()
      },
      mockStorage: {
        store: vi.fn(),
        storeReport: vi.fn(),
        storeAlignment: vi.fn(),
        retrieve: vi.fn(),
        retrieveReport: vi.fn(),
        cleanup: vi.fn(),
        close: vi.fn(),
        exportData: vi.fn(),
        importData: vi.fn()
      },
      mockReportGenerator: {
        generateFullReport: vi.fn(),
        generatePRSummary: vi.fn(),
        generateCIReport: vi.fn()
      }
    };
  }

  beforeEach(async () => {
    // Create fresh mocks for each test
    const mocks = createFreshMocks();
    mockCaptureService = mocks.mockCaptureService;
    mockComparator = mocks.mockComparator;
    mockAlignmentGenerator = mocks.mockAlignmentGenerator;
    mockABTestingFramework = mocks.mockABTestingFramework;
    mockStorage = mocks.mockStorage;
    mockReportGenerator = mocks.mockReportGenerator;

    // Mock the constructors to return our fresh mock instances
    (ResponseCaptureService as Mock).mockImplementation(() => mockCaptureService);
    (ResponseComparator as Mock).mockImplementation(() => mockComparator);
    (AlignmentGenerator as Mock).mockImplementation(() => mockAlignmentGenerator);
    (ABTestingFramework as Mock).mockImplementation(() => mockABTestingFramework);
    (ResponseStorage as Mock).mockImplementation(() => mockStorage);
    (ValidationReportGenerator as Mock).mockImplementation(() => mockReportGenerator);

    // Create service instance
    service = new ResponseValidationService(mockConfig);
  });

  afterEach(() => {
    // Thorough cleanup after each test
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Reset the mock implementations
    (ResponseCaptureService as Mock).mockReset();
    (ResponseComparator as Mock).mockReset();
    (AlignmentGenerator as Mock).mockReset();
    (ABTestingFramework as Mock).mockReset();
    (ResponseStorage as Mock).mockReset();
    (ValidationReportGenerator as Mock).mockReset();
  });

  describe('validateTransformation', () => {
    it('should execute full validation pipeline', async () => {
      const baselineQueries = [mockQuery];
      const transformedQueries = [{ ...mockQuery, id: 'test-query-1-transformed' }];

      const mockBaselineResponses: BaselineResponses = {
        responses: new Map([['test-query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      };

      const mockTransformedResponses: TransformedResponses = {
        ...mockBaselineResponses,
        transformationVersion: 'latest'
      };

      const mockComparison: ComparisonResult = {
        queryId: 'test-query-1',
        identical: true,
        similarity: 1.0,
        differences: [],
        breakingChanges: [],
        performanceImpact: { latencyChange: 0, sizeChange: 0, recommendation: 'Performance impact is acceptable' },
        recommendation: 'safe'
      };

      const mockReport: ValidationReport = {
        id: 'report-123',
        createdAt: new Date(),
        summary: {
          totalQueries: 1,
          identicalQueries: 1,
          modifiedQueries: 0,
          breakingChanges: 0,
          averageSimilarity: 1.0,
          safeToMigrate: true,
          estimatedRisk: 'low'
        },
        comparisons: [mockComparison],
        alignments: [],
        abTestConfig: undefined,
        recommendations: []
      };

      // Set up fresh mocks for this test
      mockCaptureService.captureBaseline.mockResolvedValue(mockBaselineResponses);
      mockCaptureService.captureTransformed.mockResolvedValue(mockTransformedResponses);
      mockComparator.compare.mockReturnValue(mockComparison);
      mockReportGenerator.generateFullReport.mockResolvedValue(mockReport);
      mockStorage.store.mockResolvedValue(undefined);
      mockStorage.storeReport.mockResolvedValue(undefined);

      const result = await service.validateTransformation(
        baselineQueries,
        transformedQueries,
        {
          generateAlignments: false,
          setupABTest: false
        }
      );

      expect(result).toEqual(mockReport);
      expect(mockCaptureService.captureBaseline).toHaveBeenCalledWith(baselineQueries, undefined);
      expect(mockCaptureService.captureTransformed).toHaveBeenCalledWith(transformedQueries, undefined);
      expect(mockComparator.compare).toHaveBeenCalled();
      expect(mockReportGenerator.generateFullReport).toHaveBeenCalledWith(
        [mockComparison],
        [],
        undefined
      );
      expect(mockStorage.storeReport).toHaveBeenCalledWith(mockReport);
    });

    it('should generate alignments when requested', async () => {
      const baselineQueries = [mockQuery];
      const transformedQueries = [{ ...mockQuery, id: 'test-query-1-transformed' }];

      const mockBaselineResponses: BaselineResponses = {
        responses: new Map([['test-query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      };

      const mockComparison: ComparisonResult = {
        queryId: 'test-query-1',
        identical: false,
        similarity: 0.9,
        differences: [{
          path: ['data', 'test'],
          type: 'value-change',
          baseline: 'value1',
          transformed: 'value2',
          fixable: true,
          severity: 'low',
          description: 'Value changed from value1 to value2'
        }],
        breakingChanges: [],
        performanceImpact: { latencyChange: 10, sizeChange: 0, recommendation: 'Acceptable performance impact' },
        recommendation: 'safe'
      };

      const mockAlignment: AlignmentFunction = {
        id: 'alignment-test-query-1',
        queryId: 'test-query-1',
        differences: mockComparison.differences,
        transform: (response: any) => response,
        code: 'function align(response) { return response; }',
        tests: []
      };

      const mockReportWithAlignment: ValidationReport = {
        id: 'report-123',
        createdAt: new Date(),
        summary: {
          totalQueries: 1,
          identicalQueries: 0,
          modifiedQueries: 1,
          breakingChanges: 0,
          averageSimilarity: 0.9,
          safeToMigrate: true,
          estimatedRisk: 'low'
        },
        comparisons: [mockComparison],
        alignments: [mockAlignment],
        recommendations: []
      };

      // Set up fresh mocks for this test
      mockCaptureService.captureBaseline.mockResolvedValue(mockBaselineResponses);
      mockCaptureService.captureTransformed.mockResolvedValue({
        ...mockBaselineResponses,
        transformationVersion: 'latest'
      });
      mockComparator.compare.mockReturnValue(mockComparison);
      mockAlignmentGenerator.generateAlignmentFunction.mockReturnValue(mockAlignment);
      mockStorage.storeAlignment.mockResolvedValue(undefined);
      mockStorage.store.mockResolvedValue(undefined);
      mockStorage.storeReport.mockResolvedValue(undefined);
      mockReportGenerator.generateFullReport.mockResolvedValue(mockReportWithAlignment);

      await service.validateTransformation(
        baselineQueries,
        transformedQueries,
        {
          generateAlignments: true
        }
      );

      expect(mockAlignmentGenerator.generateAlignmentFunction).toHaveBeenCalledWith(
        'test-query-1',
        [mockComparison.differences[0]]
      );
      expect(mockStorage.storeAlignment).toHaveBeenCalledWith(mockAlignment);
    });

    it('should setup A/B test when requested', async () => {
      const baselineQueries = [mockQuery];
      const transformedQueries = [{ ...mockQuery, id: 'test-query-1-transformed' }];

      const mockComparison: ComparisonResult = {
        queryId: 'test-query-1',
        identical: true,
        similarity: 1.0,
        differences: [],
        breakingChanges: [],
        performanceImpact: { latencyChange: 0, sizeChange: 0, recommendation: 'Performance impact is acceptable' },
        recommendation: 'safe'
      };

      const mockABTestConfig: ABTestConfig = {
        id: 'test-123',
        name: 'GraphQL Migration Test',
        splitPercentage: 10,
        targetQueries: ['test-query-1'],
        rolloutStrategy: { type: 'gradual' as const },
        startDate: new Date(),
        metrics: {
          control: {
            requests: 1000,
            successes: 1000,
            errors: 0,
            averageLatency: 100,
            p95Latency: 150,
            p99Latency: 200,
            errorTypes: {}
          },
          variant: {
            requests: 1000,
            successes: 1000,
            errors: 0,
            averageLatency: 100,
            p95Latency: 150,
            p99Latency: 200,
            errorTypes: {}
          },
          summary: {
            winner: 'tie',
            confidence: 0.95,
            recommendation: 'Continue monitoring'
          }
        },
        autoRollback: {
          enabled: true,
          errorThreshold: 0.05,
          latencyThreshold: 0.2,
          evaluationWindow: '5m',
          cooldownPeriod: '10m'
        }
      };

      const mockReport: ValidationReport = {
        id: 'report-123',
        createdAt: new Date(),
        summary: {
          totalQueries: 1,
          identicalQueries: 1,
          modifiedQueries: 0,
          breakingChanges: 0,
          averageSimilarity: 1.0,
          safeToMigrate: true,
          estimatedRisk: 'low'
        },
        comparisons: [mockComparison],
        alignments: [],
        abTestConfig: mockABTestConfig,
        recommendations: []
      };

      // Set up fresh mocks for this test
      mockCaptureService.captureBaseline.mockResolvedValue({
        responses: new Map([['test-query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      });
      mockCaptureService.captureTransformed.mockResolvedValue({
        responses: new Map([['test-query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        },
        transformationVersion: 'latest'
      });
      mockComparator.compare.mockReturnValue(mockComparison);
      mockABTestingFramework.createTest.mockResolvedValue(mockABTestConfig);
      mockABTestingFramework.registerRollbackHandler.mockReturnValue(undefined);
      mockReportGenerator.generateFullReport.mockResolvedValue(mockReport);
      mockStorage.store.mockResolvedValue(undefined);
      mockStorage.storeReport.mockResolvedValue(undefined);

      await service.validateTransformation(
        baselineQueries,
        transformedQueries,
        {
          generateAlignments: false,
          setupABTest: true
        }
      );

      expect(mockABTestingFramework.createTest).toHaveBeenCalled();
      expect(mockABTestingFramework.registerRollbackHandler).toHaveBeenCalledWith(
        'test-123',
        expect.any(Function)
      );
    });
  });

  describe('captureBaseline', () => {
    it('should capture and store baseline responses', async () => {
      const queries = [mockQuery];
      const mockResponses: BaselineResponses = {
        responses: new Map([['test-query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      };

      mockCaptureService.captureBaseline.mockResolvedValue(mockResponses);
      mockStorage.store.mockResolvedValue(undefined);

      await service.captureBaseline(queries);

      expect(mockCaptureService.captureBaseline).toHaveBeenCalledWith(queries, undefined);
      expect(mockStorage.store).toHaveBeenCalledWith(mockCapturedResponse);
    });

    it('should use provided endpoint when specified', async () => {
      const queries = [mockQuery];
      const customEndpoint: EndpointConfig = {
        url: 'https://custom.api.com/graphql',
        headers: { 'X-API-Key': 'custom-key' }
      };

      mockCaptureService.captureBaseline.mockResolvedValue({
        responses: new Map([['query-1', mockCapturedResponse]]),
        metadata: {
          capturedAt: new Date(),
          totalQueries: 1,
          successCount: 1,
          errorCount: 0,
          endpoint: mockConfig.endpoints[0]
        }
      });

      await service.captureBaseline(queries, customEndpoint);

      expect(mockCaptureService.captureBaseline).toHaveBeenCalledWith(queries, customEndpoint);
    });
  });

  describe('compareStoredResponses', () => {
    it('should compare previously stored responses', async () => {
      const queryIds = ['test-query-1'];
      const baselineResponse = { ...mockCapturedResponse, version: 'baseline' as const };
      const transformedResponse = { ...mockCapturedResponse, version: 'transformed' as const };

      const mockComparison: ComparisonResult = {
        queryId: 'test-query-1',
        identical: true,
        similarity: 1.0,
        differences: [],
        breakingChanges: [],
        performanceImpact: { latencyChange: 0, sizeChange: 0, recommendation: 'Performance impact is acceptable' },
        recommendation: 'safe'
      };

      // Set up fresh, specific mock returns for this test
      mockStorage.retrieve
        .mockResolvedValueOnce(baselineResponse)
        .mockResolvedValueOnce(transformedResponse);
      mockComparator.compare.mockReturnValue(mockComparison);

      const results = await service.compareStoredResponses(queryIds);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(mockComparison);
      expect(mockStorage.retrieve).toHaveBeenCalledWith('test-query-1', 'baseline');
      expect(mockStorage.retrieve).toHaveBeenCalledWith('test-query-1', 'transformed');
      expect(mockComparator.compare).toHaveBeenCalledWith(
          baselineResponse,
          transformedResponse
        );
    });

    it('should handle missing responses gracefully', async () => {
      const queryIds = ['test-query-1', 'test-query-2'];

      mockStorage.retrieve
        .mockResolvedValueOnce(mockCapturedResponse)
        .mockResolvedValueOnce(null) // Missing transformed response for query 1
        .mockResolvedValueOnce(null) // Missing baseline response for query 2
        .mockResolvedValueOnce(mockCapturedResponse);

      const results = await service.compareStoredResponses(queryIds);

      expect(results).toHaveLength(0);
      expect(mockComparator.compare).not.toHaveBeenCalled();
    });
  });

  describe('generatePRSummary', () => {
    it('should generate PR summary from report', async () => {
      const reportId = 'report-123';
      const mockReport: ValidationReport = {
        id: reportId,
        createdAt: new Date(),
        summary: {
          totalQueries: 10,
          identicalQueries: 8,
          modifiedQueries: 2,
          breakingChanges: 0,
          averageSimilarity: 0.95,
          safeToMigrate: true,
          estimatedRisk: 'low'
        },
        comparisons: [],
        alignments: [],
        recommendations: []
      };

      const expectedSummary = '## Validation Summary\n- Total: 10\n- Safe: true';

      mockStorage.retrieveReport.mockResolvedValue(mockReport);
      mockReportGenerator.generatePRSummary.mockReturnValue(expectedSummary);

      const summary = await service.generatePRSummary(reportId);

      expect(summary).toBe(expectedSummary);
      expect(mockStorage.retrieveReport).toHaveBeenCalledWith(reportId);
      expect(mockReportGenerator.generatePRSummary).toHaveBeenCalledWith(mockReport);
    });

    it('should throw error for missing report', async () => {
      mockStorage.retrieveReport.mockResolvedValue(null);

      await expect(service.generatePRSummary('missing-report')).rejects.toThrow(
        'Report missing-report not found'
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup old validation data', async () => {
      const cutoffDate = new Date('2024-01-01');
      mockStorage.cleanup.mockResolvedValue(5);

      const result = await service.cleanup(cutoffDate);

      expect(result).toBe(5);
      expect(mockStorage.cleanup).toHaveBeenCalledWith(cutoffDate);
    });

    it('should cleanup all data when no date provided', async () => {
      mockStorage.cleanup.mockResolvedValue(10);

      const result = await service.cleanup();

      expect(result).toBe(10);
      expect(mockStorage.cleanup).toHaveBeenCalledWith(undefined);
    });
  });

  describe('destroy', () => {
    it('should cleanup resources', async () => {
      mockCaptureService.destroy.mockReturnValue(undefined);
      mockStorage.close.mockResolvedValue(undefined);

      await service.destroy();

      expect(mockCaptureService.destroy).toHaveBeenCalled();
      expect(mockStorage.close).toHaveBeenCalled();
    });
  });
});
